import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as s3 from "$lib/server/s3";
import { assertSameOrigin, getServerContext } from "$lib/server/context";

type Payload = Record<string, unknown>;

function str(body: Payload, key: string): string {
	return typeof body[key] === "string" ? (body[key] as string) : "";
}

function num(body: Payload, key: string, fallback: number): number {
	return typeof body[key] === "number" ? (body[key] as number) : fallback;
}

function bool(body: Payload, key: string): boolean {
	return body[key] === true;
}

function arr(body: Payload, key: string): string[] {
	return Array.isArray(body[key]) ? (body[key] as string[]) : [];
}

export const POST: RequestHandler = async (event) => {
	const blocked = assertSameOrigin(event);
	if (blocked) return blocked;

	const op = event.params.op ?? "";
	const ctx = getServerContext(event);

	let body: Payload;
	try {
		body = (await event.request.json()) as Payload;
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	try {
		switch (op) {
			case "listBuckets":
				return json(await s3.listBuckets(ctx, str(body, "connectionId")));
			case "listObjects":
				return json(
					await s3.listObjects(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "prefix"),
						num(body, "maxKeys", 100),
						str(body, "continuationToken") || undefined,
						(str(body, "sortBy") || "date-desc") as
						| "date-desc"
						| "date-asc"
						| "name-asc"
						| "name-desc",
					),
				);
			case "searchObjects":
				return json(
					await s3.searchObjects(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "prefix"),
						str(body, "query"),
					),
				);
			case "deleteObjects":
				return json(
					await s3.deleteObjects(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						arr(body, "keys"),
					),
				);
			case "deleteObject":
				return json(
					await s3.deleteObject(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
			case "deleteFolder":
				return json(
					await s3.deleteFolder(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "folderPrefix"),
					),
				);
			case "renameObject":
				return json(
					await s3.renameObject(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "oldKey"),
						str(body, "newKey"),
					),
				);
			case "makePublic":
				return json(
					await s3.makePublic(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
case "moveObjects":
				return json(
					await s3.moveObjects(ctx, str(body, "connectionId"), str(body, "bucket"), {
						keys: arr(body, "keys"),
						srcPrefix: str(body, "srcPrefix"),
						destPrefix: str(body, "destPrefix"),
						mode: str(body, "mode") === "copy" ? "copy" : "move",
						publicKeys: arr(body, "publicKeys"),
						offset: num(body, "offset", 0),
					}),
				);
			case "makePrivate":
				return json(
					await s3.makePrivate(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
			case "trashObjects":
				return json(
					await s3.trashObjects(ctx, str(body, "connectionId"), str(body, "bucket"), {
						keys: arr(body, "keys"),
						offset: num(body, "offset", 0),
					}),
				);
			case "restoreTrash":
				return json(
					await s3.restoreTrash(ctx, str(body, "connectionId"), str(body, "bucket"), {
						keys: arr(body, "keys"),
						trashSrcPrefix: str(body, "trashSrcPrefix"),
						offset: num(body, "offset", 0),
					}),
				);
			case "purgeTrash":
				return json(
					await s3.purgeTrash(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						num(body, "maxAgeDays", 30),
					),
				);
			case "getObjectDetails":
				return json(
					await s3.getObjectDetails(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
						case "getFileContent":
				return json(
					await s3.getFileContent(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
			case "countObjects":
				return json(
					await s3.countObjects(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "prefix"),
					),
				);
			case "countObjectsToDelete":
				return json(
					await s3.countObjectsToDelete(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						arr(body, "keys"),
					),
				);
			case "createFolder":
				return json(
					await s3.createFolder(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "prefix"),
						str(body, "folderName"),
					),
				);
			case "getDownloadUrl":
				return json(
					await s3.getDownloadUrl(
						ctx,
						str(body, "connectionId"),
						str(body, "bucket"),
						str(body, "key"),
					),
				);
			default:
				return json({ error: "Unknown operation" }, { status: 404 });
		}
	} catch (error: unknown) {
		console.error(`S3 op "${op}" failed:`, error);
		// AppError messages are written for end users; anything else can
		// carry SDK/internal detail (endpoint, bucket names, stack hints).
		const message =
			error instanceof s3.AppError
				? error.message
				: "The request could not be completed. Check the connection settings and try again.";
		return json({ error: message }, { status: 500 });
	}
};
