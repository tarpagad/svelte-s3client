import {
	GetObjectCommand,
	ListObjectsV2Command,
	type S3Client,
} from "@aws-sdk/client-s3";
import { Zip, ZipPassThrough } from "fflate";
import { sanitizeZipPath } from "$lib/zip-path";
import { getServerContext } from "$lib/server/context";
import { getConnection } from "$lib/server/connections";
import { getBucketRegion, getS3Client, getS3ClientForRegion } from "$lib/server/s3";
import type { RequestHandler } from "./$types";

// Paid Workers allow 1000 subrequests per invocation; each zip entry costs
// one GetObject plus listing calls, so keep headroom below the cap.
const MAX_FILES_PER_ZIP = 800;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB guard

interface DownloadItem {
	key: string;
	zipPath: string;
}

/**
 * Recursively expands folder prefixes ("prefix/") into a flat list of object
 * keys, mapping each object to the path it should have inside the zip. Files
 * are passed through unchanged and mapped to their base name.
 */
async function expandKeys(
	client: S3Client,
	bucket: string,
	keys: string[],
	state: { truncated: boolean },
): Promise<DownloadItem[]> {
	const items: DownloadItem[] = [];
	const seen = new Set<string>();

	for (const key of keys) {
		if (items.length >= MAX_FILES_PER_ZIP) {
			state.truncated = true;
			break;
		}
		if (seen.has(key)) continue;
		seen.add(key);

		if (!key.endsWith("/")) {
			items.push({
				key,
				zipPath: sanitizeZipPath(key.split("/").pop() || "download"),
			});
			continue;
		}

		const base = key.slice(0, -1);
		const folderName = base.split("/").pop() || "download";
		const root = `${folderName}/`;

		const nestedPrefixes: string[] = [];
		let continuationToken: string | undefined;

		do {
			const response = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: key,
					ContinuationToken: continuationToken,
					MaxKeys: 1000,
				}),
			);

			// Folder markers ("prefix/") have no body — skip them.
			for (const c of response.Contents || []) {
				if (items.length >= MAX_FILES_PER_ZIP) {
					state.truncated = true;
					break;
				}
				if (!c.Key || c.Key.endsWith("/")) continue;
				items.push({
					key: c.Key,
					zipPath: sanitizeZipPath(root + c.Key.slice(key.length)),
				});
			}

			for (const p of response.CommonPrefixes || []) {
				if (p.Prefix) nestedPrefixes.push(p.Prefix);
			}

			if (state.truncated) break;
			continuationToken = response.NextContinuationToken;
		} while (continuationToken);

		// Expand nested folders once, after pagination completes, nesting
		// their contents under this folder's root in the zip.
		for (const nestedPrefix of nestedPrefixes) {
			if (items.length >= MAX_FILES_PER_ZIP) {
				state.truncated = true;
				break;
			}
			const nested = await expandKeys(client, bucket, [nestedPrefix], state);
			for (const n of nested) {
				if (items.length >= MAX_FILES_PER_ZIP) {
					state.truncated = true;
					break;
				}
				items.push({ key: n.key, zipPath: sanitizeZipPath(root + n.zipPath) });
			}
		}
	}

	return items;
}

export const GET: RequestHandler = async (event) => {
	const url = new URL(event.request.url);
	const connectionId = url.searchParams.get("connectionId");
	const bucket = url.searchParams.get("bucket");
	const keysParam = url.searchParams.get("keys");

	if (!connectionId || !bucket || !keysParam) {
		return new Response("Missing connectionId, bucket, or keys", { status: 400 });
	}
	const connectionIdParam: string = connectionId;
	const bucketParam: string = bucket;

	let keys: string[];
	try {
		keys = JSON.parse(keysParam);
	} catch {
		return new Response("Invalid keys parameter", { status: 400 });
	}

	if (!Array.isArray(keys) || keys.length === 0) {
		return new Response("No keys provided", { status: 400 });
	}

	const ctx = getServerContext(event);
	const connection = await getConnection(ctx, connectionIdParam);
	if (!connection) {
		return new Response("Connection not found", { status: 404 });
	}

	let client = await getS3Client(ctx, connectionIdParam);
	// Standard S3: sign requests with the bucket's actual region to avoid
	// PermanentRedirect errors (same as getDownloadUrl).
	if (!connection.endpoint) {
		const region = await getBucketRegion(ctx, connectionIdParam, bucketParam);
		if (region) {
			client = await getS3ClientForRegion(ctx, connectionIdParam, region);
		}
	}

	const expandState = { truncated: false };
	let items: DownloadItem[];
	try {
		items = await expandKeys(client, bucketParam, keys, expandState);
	} catch (error: unknown) {
		console.error("Failed to expand keys for zip download:", error);
		return new Response(
			error instanceof Error ? error.message : "Failed to list objects",
			{ status: 500 },
		);
	}

	if (items.length === 0) {
		return new Response("No files found in the selection", { status: 404 });
	}

	if (expandState.truncated || items.length > MAX_FILES_PER_ZIP) {
		return new Response(
			`Too many files to download as a zip. Limit is ${MAX_FILES_PER_ZIP}.`,
			{ status: 413 },
		);
	}

	// Avoid duplicate zip paths (e.g. the same file selected twice).
	const usedPaths = new Map<string, number>();
	const uniqueItems: DownloadItem[] = [];
	for (const item of items) {
		const count = usedPaths.get(item.zipPath) || 0;
		usedPaths.set(item.zipPath, count + 1);
		if (count === 0) {
			uniqueItems.push(item);
		} else {
			const dot = item.zipPath.lastIndexOf(".");
			const base = dot > 0 ? item.zipPath.slice(0, dot) : item.zipPath;
			const ext = dot > 0 ? item.zipPath.slice(dot) : "";
			uniqueItems.push({ key: item.key, zipPath: `${base} (${count})${ext}` });
		}
	}

	let cancelled = false;
	let zipError: Error | null = null;

	const zip = new Zip((err, data, final) => {
		if (err) {
			zipError = err;
			return;
		}
		// enqueued by the pump below
		if (data.length > 0) zipOutput?.enqueue(data);
		if (final) zipOutput?.close();
	});

	let zipOutput: {
		enqueue: (chunk: Uint8Array) => void;
		close: () => void;
		error: (err: unknown) => void;
	} | null = null;

	const fallbackName =
		keys.length === 1 && keys[0].endsWith("/")
			? keys[0].slice(0, -1).split("/").pop() || "download"
			: "download";
	// Content-Disposition value: strip quotes/control chars to prevent
	// header injection via a crafted folder prefix.
	const safeName =
		fallbackName.replace(/["\\\r\n\x00-\x1f]/g, "") || "download";
	const filename = `${safeName}.zip`;

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			zipOutput = {
				enqueue: (chunk) => controller.enqueue(chunk),
				close: () => {
					try {
						controller.close();
					} catch {
						// already closed or errored
					}
				},
				error: (err) => {
					try {
						controller.error(err);
					} catch {
						// already closed
					}
				},
			};

			pump().catch((error: unknown) => {
				console.error("Zip download failed:", error);
				zipOutput?.error(error);
			});
		},
		cancel() {
			// Client aborted the download — stop fetching remaining objects.
			cancelled = true;
		},
	});

	async function pump(): Promise<void> {
		let totalBytes = 0;

		for (const item of uniqueItems) {
			if (cancelled || zipError) return;

			try {
				const response = await client.send(
					new GetObjectCommand({ Bucket: bucketParam, Key: item.key }),
				);
				if (!response.Body) continue;

				const entry = new ZipPassThrough(item.zipPath);
				zip.add(entry);

				const webStream = response.Body.transformToWebStream();
				for await (const chunk of webStream) {
					entry.push(
						chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk),
						false,
					);
				}
				entry.push(new Uint8Array(0), true);

				totalBytes += response.ContentLength || 0;
				if (totalBytes > MAX_TOTAL_BYTES) {
					zipOutput?.error(new Error("Selection is too large to download as a zip"));
					return;
				}
			} catch (error: unknown) {
				console.error(`Failed to fetch object ${item.key}:`, error);
			}
		}

		if (cancelled) return;
		zip.end();
	}

	return new Response(body as unknown as BodyInit, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
};
