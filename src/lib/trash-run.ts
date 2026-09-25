import { callS3 } from "./api";

interface TrashResponse {
	processed?: number;
	trashed?: string[];
	total?: number;
	nextOffset?: number;
	done?: boolean;
	error?: string;
}

interface RestoreResponse {
	processed?: number;
	restored?: string[];
	skipped?: number;
	total?: number;
	nextOffset?: number;
	done?: boolean;
	error?: string;
}

/**
 * Soft-delete keys (folders expand server-side), paging through the
 * per-request cap. Returns the trash keys so callers can offer Undo.
 */
export async function runTrash(o: {
	connectionId: string;
	bucket: string;
	keys: string[];
}): Promise<{ count: number; trashed: string[] }> {
	const trashed: string[] = [];
	let count = 0;
	let offset = 0;
	for (;;) {
		const r = await callS3<TrashResponse>("trashObjects", {
			connectionId: o.connectionId,
			bucket: o.bucket,
			keys: o.keys,
			offset,
		});
		if (r.error) throw new Error(r.error);
		count += r.processed ?? 0;
		trashed.push(...(r.trashed ?? []));
		if (r.done !== false) break;
		offset = r.nextOffset ?? offset + 1;
	}
	return { count, trashed };
}

/** Restore trash keys or a whole trash batch (prefix pages like move). */
export async function runRestore(o: {
	connectionId: string;
	bucket: string;
	keys?: string[];
	trashSrcPrefix?: string;
}): Promise<number> {
	let processed = 0;
	let offset = 0;
	for (;;) {
		const r = await callS3<RestoreResponse>("restoreTrash", {
			connectionId: o.connectionId,
			bucket: o.bucket,
			keys: o.keys ?? [],
			trashSrcPrefix: o.trashSrcPrefix ?? "",
			offset,
		});
		if (r.error) throw new Error(r.error);
		processed += r.processed ?? 0;
		if (r.done !== false) break;
		offset = r.nextOffset ?? offset + 1;
	}
	return processed;
}
