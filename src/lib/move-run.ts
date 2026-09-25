import { callS3, callS3Batches } from "./api";
import { folderDestPrefix } from "./move-path";

export interface MoveRunOptions {
	connectionId: string;
	bucket: string;
	mode: "move" | "copy";
	/** Folder the user chose as destination ("" = bucket root). */
	destParent: string;
	fileKeys?: string[];
	/** Folder sources; each keeps its own name under destParent. */
	folderPrefixes?: string[];
	/** Source keys known to be public — ACL re-applied after copy. */
	publicKeys?: string[];
}

/**
 * Executes a move/copy across request-sized batches (server caps at400
 * objects per request because CopyObject has no batching). Folder
 * sources page via the server's offset on a stable listing.
 */
export async function runMove(o: MoveRunOptions): Promise<number> {
	let processed = 0;

	for (const prefix of o.folderPrefixes ?? []) {
		const name = prefix.split("/").filter(Boolean).pop() || "";
		const dest = folderDestPrefix(o.destParent, name);
		let offset = 0;
		for (;;) {
			const r = await callS3<{
				processed?: number;
				nextOffset?: number;
				done?: boolean;
				error?: string;
			}>("moveObjects", {
				connectionId: o.connectionId,
				bucket: o.bucket,
				srcPrefix: prefix,
				destPrefix: dest,
				mode: o.mode,
				offset,
			});
			if (r.error) throw new Error(r.error);
			processed += r.processed ?? 0;
			if (r.done) break;
			offset = r.nextOffset ?? offset + 1;
		}
	}

	const keys = o.fileKeys ?? [];
	if (keys.length > 0) {
		const batches: Record<string, unknown>[] = [];
		for (let i = 0; i < keys.length; i += 400) {
			batches.push({
				connectionId: o.connectionId,
				bucket: o.bucket,
				keys: keys.slice(i, i + 400),
				destPrefix: o.destParent,
				mode: o.mode,
				publicKeys: o.publicKeys ?? [],
			});
		}
		await callS3Batches("moveObjects", batches);
		processed += keys.length;
	}

	return processed;
}
