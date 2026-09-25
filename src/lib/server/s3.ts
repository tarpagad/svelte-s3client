import {
	CopyObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectAclCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	ListBucketsCommand,
	ListObjectsV2Command,
	PutObjectAclCommand,
	PutObjectCommand,
	S3Client,
	type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDecryptedConnection } from "./connections";
import type { ServerContext } from "./context";
import {
	destKeyForKey,
	destKeyForPrefix,
	isInsidePrefix,
} from "$lib/move-path";
import type {
	BucketInfo,
	ListObjectsResponse,
	S3ObjectInfo,
} from "$lib/types";

/**
 * Error whose message is intended for the client. Anything else is an
 * SDK/internal error: logged server-side, replaced by a generic message
 * in the response so endpoint/bucket/account details never leak.
 */
export class AppError extends Error { }

function clientMessage(error: unknown, fallback: string): string {
	return error instanceof AppError ? error.message : fallback;
}

// Bulk delete/count folder expansion cap: keeps the listing loop bounded
// (subrequest budget) and the confirmation dialog meaningful.
const MAX_BULK_DELETE_OBJECTS = 5000;

// CopyObject costs one subrequest per object (no batching like
// DeleteObjects), so move/copy requests stay well under the1000
// subrequests/invocation cap even with ACL re-applies and listings.
const MAX_MOVE_OBJECTS = 400;

/**
 * Object ACLs are an AWS S3 concept; S3-compatible stores (R2, MinIO,
 * B2, …) reject or ignore GetObjectAcl. Skipping the per-file ACL probe
 * on custom endpoints saves one subrequest per listed file.
 */
async function aclSupported(
	ctx: ServerContext,
	connectionId: string,
): Promise<boolean> {
	const connection = await getDecryptedConnection(ctx, connectionId);
	return !connection?.endpoint;
}

export async function getS3Client(
	ctx: ServerContext,
	connectionId: string,
): Promise<S3Client> {
	const connection = await getDecryptedConnection(ctx, connectionId);

	if (!connection) {
		throw new AppError("Connection not found");
	}

	// R2 always signs with region `auto` (Cloudflare requirement). The
	// stored region must not win there: connections saved before 8302629
	// carry the old `us-east-1` default, which R2 rejects with
	// SignatureDoesNotMatch. Other custom endpoints (MinIO, …) keep their
	// configured region; plain S3 falls back to us-east-1.
	const region =
		connection.type === "r2"
			? "auto"
			: connection.endpoint
				? connection.region || "auto"
				: connection.region || "us-east-1";

	const config: S3ClientConfig = {
		credentials: {
			accessKeyId: connection.accessKeyId,
			secretAccessKey: connection.secretAccessKey,
		},
		region,
		followRegionRedirects: true,
	};

	if (connection.endpoint) {
		config.endpoint = connection.endpoint;
		config.forcePathStyle = true;
	}

	return new S3Client(config);
}

export async function getS3ClientForRegion(
	ctx: ServerContext,
	connectionId: string,
	region: string,
): Promise<S3Client> {
	const connection = await getDecryptedConnection(ctx, connectionId);

	if (!connection) {
		throw new AppError("Connection not found");
	}

	return new S3Client({
		credentials: {
			accessKeyId: connection.accessKeyId,
			secretAccessKey: connection.secretAccessKey,
		},
		region,
	});
}

const bucketRegionCache = new Map<string, string>();

export async function getBucketRegion(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
): Promise<string | null> {
	const connection = await getDecryptedConnection(ctx, connectionId);

	if (!connection) {
		throw new AppError("Connection not found");
	}

	// Custom endpoint (R2, MinIO, etc.): region is not resolvable, and the
	// configured endpoint is authoritative.
	if (connection.endpoint) {
		return null;
	}

	const configuredRegion = connection.region || "us-east-1";

	const cacheKey = `${connectionId}:${bucket}`;
	const cached = bucketRegionCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const probeClient = new S3Client({
		credentials: {
			accessKeyId: connection.accessKeyId,
			secretAccessKey: connection.secretAccessKey,
		},
		region: configuredRegion,
		followRegionRedirects: false,
	});

	try {
		await probeClient.send(new HeadBucketCommand({ Bucket: bucket }));
		return configuredRegion;
	} catch (error: unknown) {
		const bucketRegion = (error as {
			$response?: { headers?: Record<string, string> };
		})?.$response?.headers?.["x-amz-bucket-region"];

		if (bucketRegion) {
			bucketRegionCache.set(cacheKey, bucketRegion);
			return bucketRegion;
		}

		// HeadBucket succeeded via redirect, or the error carries no region
		// hint. Fall back to the configured region.
		return configuredRegion;
	}
}

// ---------------------------------------------------------------------------
// S3 operations
// ---------------------------------------------------------------------------

export async function listBuckets(
	ctx: ServerContext,
	connectionId: string,
): Promise<BucketInfo[]> {
	try {
		const client = await getS3Client(ctx, connectionId);
		const response = await client.send(new ListBucketsCommand({}));

		return (response.Buckets || []).map((bucket) => ({
			name: bucket.Name || "unknown",
			creationDate: bucket.CreationDate,
		}));
	} catch (error: unknown) {
		console.error("Failed to list buckets:", error);
		if (error instanceof AppError) throw error;
		throw new Error(clientMessage(error, "Failed to list buckets"));
	}
}

export async function listObjects(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	prefix: string = "",
	maxKeys: number = 100,
	continuationToken?: string,
	sortBy: "date-desc" | "date-asc" | "name-asc" | "name-desc" = "date-desc",
): Promise<ListObjectsResponse> {
	try {
		const client = await getS3Client(ctx, connectionId);
		const checkAcl = await aclSupported(ctx, connectionId);

		let offset = 0;
		if (continuationToken) {
			try {
				const decoded = JSON.parse(atob(continuationToken));
				offset = decoded.offset || 0;
			} catch {
				offset = 0;
			}
		}

		const allFolders: S3ObjectInfo[] = [];
		const allFiles: {
			Key: string;
			LastModified?: Date;
			Size?: number;
			ETag?: string;
		}[] = [];

		let s3Token: string | undefined;
		const SAFETY_LIMIT = 2000;
		let totalFetched = 0;

		do {
			const command = new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				Delimiter: "/",
				ContinuationToken: s3Token,
			});
			const response = await client.send(command);

			if (response.CommonPrefixes) {
				for (const p of response.CommonPrefixes) {
					const prefixStr = p.Prefix ?? "";
					if (!allFolders.some((f) => f.key === prefixStr)) {
						const name = prefixStr.slice(0, -1).split("/").pop() || "";
						allFolders.push({
							key: prefixStr,
							name,
							type: "folder" as const,
						});
					}
				}
			}

			if (response.Contents) {
				for (const c of response.Contents) {
					if (c.Key === prefix) continue;
					const key = c.Key || "";
					if (key.endsWith("/") && key !== prefix) {
						const name = key.slice(0, -1).split("/").pop() || "";
						if (!allFolders.some((f) => f.key === key)) {
							allFolders.push({ key, name, type: "folder" as const });
						}
					} else {
						allFiles.push({
							Key: key,
							LastModified: c.LastModified,
							Size: c.Size,
							ETag: c.ETag,
						});
					}
				}
			}

			totalFetched = allFolders.length + allFiles.length;
			s3Token = response.NextContinuationToken;
		} while (s3Token && totalFetched < SAFETY_LIMIT);

		allFolders.sort((a, b) => a.name.localeCompare(b.name));

		allFiles.sort((a, b) => {
			if (sortBy === "date-desc") {
				return (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0);
			}
			if (sortBy === "date-asc") {
				return (a.LastModified?.getTime() || 0) - (b.LastModified?.getTime() || 0);
			}
			const nameA = a.Key.split("/").pop() || "";
			const nameB = b.Key.split("/").pop() || "";
			if (sortBy === "name-asc") {
				return nameA.localeCompare(nameB);
			}
			if (sortBy === "name-desc") {
				return nameB.localeCompare(nameA);
			}
			return 0;
		});

		const allFilesMapped: S3ObjectInfo[] = allFiles.map((f) => {
			const name = f.Key.split("/").pop() || "";
			const extension = name.split(".").pop();
			return {
				key: f.Key,
				name,
				lastModified: f.LastModified,
				size: f.Size,
				etag: f.ETag,
				type: "file" as const,
				extension,
				isPublic: false,
			};
		});

		const combined = [...allFolders, ...allFilesMapped];
		const paginatedItems = combined.slice(offset, offset + maxKeys);

		const itemsWithAcl = await Promise.all(
			paginatedItems.map(async (item) => {
				if (item.type !== "file" || !checkAcl) return item;

				try {
					const acl = await client.send(
						new GetObjectAclCommand({ Bucket: bucket, Key: item.key }),
					);
					const isPublic = (acl.Grants || []).some(
						(grant) =>
							grant.Grantee?.URI ===
							"http://acs.amazonaws.com/groups/global/AllUsers" &&
							grant.Permission === "READ",
					);
					return { ...item, isPublic };
				} catch {
					return item;
				}
			}),
		);

		let nextToken: string | undefined;
		if (offset + maxKeys < combined.length) {
			nextToken = btoa(JSON.stringify({ offset: offset + maxKeys }));
		}

		return {
			objects: itemsWithAcl,
			nextToken,
			totalObjects: combined.length,
		};
	} catch (error: unknown) {
		console.error("Failed to list objects:", error);
		if (error instanceof AppError) throw error;
		throw new Error(clientMessage(error, "Failed to list objects"));
	}
}

export async function deleteObjects(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	keys: string[],
) {
	try {
		const client = await getS3Client(ctx, connectionId);

		if (keys.length === 0) return { success: true, deleted: 0 };

		const expandedKeys: string[] = [];

		for (const key of keys) {
			if (key.endsWith("/")) {
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

					for (const c of response.Contents || []) {
						if (c.Key) expandedKeys.push(c.Key);
					}

					if (expandedKeys.length > MAX_BULK_DELETE_OBJECTS) {
						throw new AppError(
							`Folder contents exceed the ${MAX_BULK_DELETE_OBJECTS}-object limit for bulk deletion. Delete large folders in smaller batches.`,
						);
					}

					continuationToken = response.NextContinuationToken;
				} while (continuationToken);
			} else {
				expandedKeys.push(key);
			}
		}

		if (expandedKeys.length === 0) return { success: true, deleted: 0 };

		const objects = expandedKeys.map((key) => ({ Key: key }));

		const batchSize = 1000;
		for (let i = 0; i < objects.length; i += batchSize) {
			const batch = objects.slice(i, i + batchSize);
			await client.send(
				new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: batch },
				}),
			);
		}

		return { success: true, deleted: expandedKeys.length };
	} catch (error: unknown) {
		console.error("Bulk delete failed:", error);
		return { error: clientMessage(error, "Failed to delete objects") };
	}
}

export async function deleteObject(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		const client = await getS3Client(ctx, connectionId);
		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);
		return { success: true };
	} catch (error: unknown) {
		console.error("Delete object failed:", error);
		return { error: clientMessage(error, "Failed to delete object") };
	}
}

export async function deleteFolder(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	folderPrefix: string,
) {
	return deleteObjects(ctx, connectionId, bucket, [folderPrefix]);
}

export async function renameObject(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	oldKey: string,
	newKey: string,
) {
	try {
		const client = await getS3Client(ctx, connectionId);

		await client.send(
			new CopyObjectCommand({
				Bucket: bucket,
				CopySource: encodeURIComponent(`${bucket}/${oldKey}`),
				Key: newKey,
			}),
		);

		await client.send(
			new DeleteObjectCommand({
				Bucket: bucket,
				Key: oldKey,
			}),
		);

		return { success: true };
	} catch (error: unknown) {
		console.error("Failed to rename object:", error);
		return { error: clientMessage(error, "Failed to rename object") };
	}
}

export async function moveObjects(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	payload: {
		keys?: string[];
		srcPrefix?: string;
		destPrefix: string;
		mode: "move" | "copy";
		publicKeys?: string[];
		offset?: number;
	},
) {
	try {
		const client = await getS3Client(ctx, connectionId);

		const srcPrefix = payload.srcPrefix
			? payload.srcPrefix.endsWith("/")
				? payload.srcPrefix
				: `${payload.srcPrefix}/`
			: "";
		const destPrefix = payload.destPrefix;

		if (srcPrefix && isInsidePrefix(srcPrefix, destPrefix)) {
			throw new AppError("Cannot move or copy a folder into itself.");
		}

		let sourceKeys: string[];
		let total: number;
		const offset = Math.max(0, Math.floor(payload.offset ?? 0));

		if (srcPrefix) {
			const all = await expandMoveKeys(client, bucket, srcPrefix);
			total = all.length;
			sourceKeys = all.slice(offset, offset + MAX_MOVE_OBJECTS);
		} else {
			// Explicit selection: folders are sent one srcPrefix call each,
			// so markers never reach this branch.
			const keys = (payload.keys ?? []).filter((k) => !k.endsWith("/"));
			if (keys.length > MAX_MOVE_OBJECTS) {
				throw new AppError(
					`Send at most ${MAX_MOVE_OBJECTS} objects per move request.`,
				);
			}
			total = keys.length;
			sourceKeys = keys;
		}

		const publicSet = new Set(payload.publicKeys ?? []);
		const copiedSources: string[] = [];
		let skipped = 0;

		for (let i = 0; i < sourceKeys.length; i += 50) {
			const chunk = sourceKeys.slice(i, i + 50);
			await Promise.all(
				chunk.map(async (key) => {
					const destKey = srcPrefix
						? destKeyForPrefix(key, srcPrefix, destPrefix)
						: destKeyForKey(key, destPrefix);
					if (destKey === key) {
						skipped += 1;
						return;
					}
					await client.send(
						new CopyObjectCommand({
							Bucket: bucket,
							CopySource: encodeURIComponent(`${bucket}/${key}`),
							Key: destKey,
						}),
					);
					if (publicSet.has(key)) {
						await client.send(
							new PutObjectAclCommand({
								Bucket: bucket,
								Key: destKey,
								ACL: "public-read",
							}),
						);
					}
					copiedSources.push(key);
				}),
			);
		}

		if (payload.mode === "move" && copiedSources.length > 0) {
			const objects = copiedSources.map((key) => ({ Key: key }));
			const batchSize = 1000;
			for (let i = 0; i < objects.length; i += batchSize) {
				await client.send(
					new DeleteObjectsCommand({
						Bucket: bucket,
						Delete: { Objects: objects.slice(i, i + batchSize) },
					}),
				);
			}
		}

		const processed = copiedSources.length;
		// Prefix mode pages through large folders across requests (offset on
		// a stable lexicographic expansion); key batches are always whole.
		const nextOffset = srcPrefix ? offset + sourceKeys.length : offset;
		return {
			success: true,
			processed,
			total,
			nextOffset,
			done: !srcPrefix || nextOffset >= total,
			skipped,
		};
	} catch (error: unknown) {
		console.error("Failed to move objects:", error);
		return { error: clientMessage(error, "Failed to move objects") };
	}
}

/** Recursively expand a folder prefix; stable lexicographic order for offset paging. */
async function expandMoveKeys(
	client: S3Client,
	bucket: string,
	srcPrefix: string,
): Promise<string[]> {
	const keys: string[] = [];
	let continuationToken: string | undefined;
	do {
		const response = await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: srcPrefix,
				ContinuationToken: continuationToken,
				MaxKeys: 1000,
			}),
		);
		for (const c of response.Contents || []) {
			if (c.Key) keys.push(c.Key);
		}
		if (keys.length > MAX_BULK_DELETE_OBJECTS) {
			throw new AppError(
				`Folder contents exceed the ${MAX_BULK_DELETE_OBJECTS}-object limit. Move it in smaller batches.`,
			);
		}
		continuationToken = response.NextContinuationToken;
	} while (continuationToken);
	return keys;
}

export async function getDownloadUrl(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		const connection = await getDecryptedConnection(ctx, connectionId);
		let client = await getS3Client(ctx, connectionId);

		// Standard S3: the connection's configured region may not match the
		// bucket's actual region. Presigned URLs must be signed with the
		// bucket's region or S3 returns PermanentRedirect on fetch.
		if (connection && !connection.endpoint) {
			const region = await getBucketRegion(ctx, connectionId, bucket);
			if (region) {
				client = await getS3ClientForRegion(ctx, connectionId, region);
			}
		}

		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: key,
		});

		const url = await getSignedUrl(client, command, { expiresIn: 3600 });
		return { url };
	} catch (error: unknown) {
		console.error("Failed to generate presigned URL:", error);
		return {
			error: clientMessage(error, "Failed to generate download URL"),
		};
	}
}

export async function uploadFile(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
	file: File,
	isPublic: boolean = false,
) {
	try {
		const client = await getS3Client(ctx, connectionId);

		// Stream the upload in constant memory (multipart under the hood) —
		// Workers isolates cap memory at 128 MB, so buffering is not an option.
		const upload = new Upload({
			client,
			params: {
				Bucket: bucket,
				Key: key,
				Body: file.stream(),
				ContentType: file.type || "application/octet-stream",
				ACL: isPublic ? "public-read" : undefined,
			},
		});

		await upload.done();

		return { success: true };
	} catch (error: unknown) {
		console.error("Failed to upload file:", error);
		return { error: clientMessage(error, "Failed to upload file") };
	}
}

export async function makePublic(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		const client = await getS3Client(ctx, connectionId);
		await client.send(
			new PutObjectAclCommand({
				Bucket: bucket,
				Key: key,
				ACL: "public-read",
			}),
		);
		return { success: true };
	} catch (error: unknown) {
		console.error("Failed to make object public:", error);
		return { error: clientMessage(error, "Failed to set public access") };
	}
}

export async function makePrivate(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		const client = await getS3Client(ctx, connectionId);
		await client.send(
			new PutObjectAclCommand({
				Bucket: bucket,
				Key: key,
				ACL: "private",
			}),
		);
		return { success: true };
	} catch (error: unknown) {
		console.error("Failed to make object private:", error);
		return { error: clientMessage(error, "Failed to remove public access") };
	}
}

export async function getFileContent(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		const client = await getS3Client(ctx, connectionId);
		const response = await client.send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: key,
			}),
		);

		if (!response.Body) {
			throw new Error("Empty response body");
		}

		const content = await response.Body.transformToString();
		return { content };
	} catch (error: unknown) {
		console.error("Failed to fetch file content:", error);
		return { error: clientMessage(error, "Failed to fetch file content") };
	}
}

export async function searchObjects(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	prefix: string,
	query: string,
): Promise<ListObjectsResponse> {
	if (!query.trim()) {
		return listObjects(ctx, connectionId, bucket, prefix);
	}

	try {
		const client = await getS3Client(ctx, connectionId);
		const checkAcl = await aclSupported(ctx, connectionId);
		const allFolders: S3ObjectInfo[] = [];
		const allFiles: {
			Key: string;
			LastModified?: Date;
			Size?: number;
			ETag?: string;
		}[] = [];
		let continuationToken: string | undefined;

		const lowerQuery = query.toLowerCase();

		do {
			const response = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					Delimiter: "/",
					ContinuationToken: continuationToken,
				}),
			);

			const folders: S3ObjectInfo[] = (response.CommonPrefixes || [])
				.map((p) => {
					const prefixStr = p.Prefix ?? "";
					const name = prefixStr.slice(0, -1).split("/").pop() || "";
					return { key: prefixStr, name, type: "folder" as const };
				})
				.filter((f) => f.name.toLowerCase().includes(lowerQuery));

			allFolders.push(...folders);

			const files = (response.Contents || [])
				.filter((c) => {
					if (c.Key === prefix) return false;
					const name = c.Key?.split("/").pop() || "";
					return name.toLowerCase().includes(lowerQuery);
				})
				.map((c) => ({
					Key: c.Key || "",
					LastModified: c.LastModified,
					Size: c.Size,
					ETag: c.ETag,
				}));

			allFiles.push(...files);
			continuationToken = response.NextContinuationToken;
		} while (continuationToken);

		allFolders.sort((a, b) => a.name.localeCompare(b.name));

		const matchedFilesToProcess = allFiles.slice(0, 100);
		const batchSize = 10;
		const finalFiles: S3ObjectInfo[] = [];

		for (let i = 0; i < matchedFilesToProcess.length; i += batchSize) {
			const batch = matchedFilesToProcess.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map(async (content) => {
					const key = content.Key;
					const name = key.split("/").pop() || "";
					const extension = name.split(".").pop();

					let isPublic = false;
					if (checkAcl) {
						try {
							const acl = await client.send(
								new GetObjectAclCommand({ Bucket: bucket, Key: key }),
							);
							isPublic = (acl.Grants || []).some(
								(grant) =>
									grant.Grantee?.URI ===
									"http://acs.amazonaws.com/groups/global/AllUsers" &&
									grant.Permission === "READ",
							);
						} catch { }
					}

					return {
						key,
						name,
						lastModified: content.LastModified,
						size: content.Size,
						etag: content.ETag,
						type: "file" as const,
						extension,
						isPublic,
					};
				}),
			);
			finalFiles.push(...batchResults);
		}

		return {
			objects: [...allFolders, ...finalFiles],
			totalObjects: allFolders.length + finalFiles.length,
		};
	} catch (error: unknown) {
		console.error("Search failed:", error);
		if (error instanceof AppError) throw error;
		throw new Error(clientMessage(error, "Search failed"));
	}
}

export async function getObjectDetails(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	key: string,
) {
	try {
		if (key.endsWith("/")) {
			throw new AppError("Folders have no object details");
		}
		const client = await getS3Client(ctx, connectionId);
		const r = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: key }),
		);
		return {
			contentType: r.ContentType ?? "",
			contentLength: r.ContentLength ?? 0,
			etag: r.ETag ?? "",
			lastModified: r.LastModified ?? null,
			storageClass: r.StorageClass ?? "STANDARD",
			metadata: r.Metadata ?? {},
		};
	} catch (error: unknown) {
		console.error("Failed to fetch object details:", error);
		return { error: clientMessage(error, "Failed to fetch object details") };
	}
}

export async function countObjects(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	prefix: string = "",
): Promise<{ count: number }> {
	try {
		const client = await getS3Client(ctx, connectionId);
		let totalCount = 0;
		let continuationToken: string | undefined;

		do {
			const response = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					Delimiter: "/",
					ContinuationToken: continuationToken,
					MaxKeys: 1000,
				}),
			);

			totalCount += response.CommonPrefixes?.length || 0;
			const files = (response.Contents || []).filter((c) => c.Key !== prefix);
			totalCount += files.length;

			continuationToken = response.NextContinuationToken;
		} while (continuationToken);

		return { count: totalCount };
	} catch (error: unknown) {
		console.error("Failed to count objects:", error);
		return { count: 0 };
	}
}

export async function countObjectsToDelete(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	keys: string[],
): Promise<{ count: number; capped?: boolean }> {
	try {
		const client = await getS3Client(ctx, connectionId);
		let totalCount = 0;

		for (const key of keys) {
			if (key.endsWith("/")) {
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

					for (const c of response.Contents || []) {
						if (c.Key && c.Key !== key) totalCount++;
					}

					if (totalCount > MAX_BULK_DELETE_OBJECTS) {
						return { count: MAX_BULK_DELETE_OBJECTS, capped: true };
					}

					continuationToken = response.NextContinuationToken;
				} while (continuationToken);
			} else {
				totalCount++;
			}
		}

		return { count: totalCount };
	} catch (error: unknown) {
		console.error("Failed to count objects to delete:", error);
		return { count: 0 };
	}
}

export async function createFolder(
	ctx: ServerContext,
	connectionId: string,
	bucket: string,
	prefix: string,
	folderName: string,
) {
	try {
		if (!folderName.trim()) {
			throw new AppError("Folder name cannot be empty");
		}

		const invalidChars = /[\\^`><{}[\]#%~|/]/;
		if (invalidChars.test(folderName)) {
			throw new AppError(
				"Folder name contains invalid characters (\\ ^ ` > < { } [ ] # % ~ | /)",
			);
		}

		const client = await getS3Client(ctx, connectionId);
		const key = `${prefix}${folderName}/`;

		const response = await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: key,
				Delimiter: "/",
				MaxKeys: 1,
			}),
		);

		if (
			(response.Contents && response.Contents.length > 0) ||
			(response.CommonPrefixes && response.CommonPrefixes.length > 0)
		) {
			throw new AppError("A folder or file with this name already exists");
		}

		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: "",
			}),
		);

		return { success: true };
	} catch (error: unknown) {
		console.error("Failed to create folder:", error);
		return { error: clientMessage(error, "Failed to create folder") };
	}
}
