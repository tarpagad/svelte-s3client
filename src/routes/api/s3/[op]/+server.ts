import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as s3 from "$lib/server/s3";
import { getServerContext } from "$lib/server/context";

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
		return json(
			{
				error:
					error instanceof Error ? error.message : "Request failed",
			},
			{ status: 500 },
		);
	}
};
