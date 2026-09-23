import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getConnection } from "$lib/server/connections";
import { listObjects } from "$lib/server/s3";
import { getServerContext } from "$lib/server/context";
import { getUserPrefs } from "$lib/prefs";
import type { S3ObjectInfo } from "$lib/types";

export const load: PageServerLoad = async (event) => {
	const ctx = getServerContext(event);
	const connectionId = event.params.connectionId ?? "";
	const bucketName = event.params.bucketName ?? "";
	if (!bucketName || !connectionId) {
		error(404, "Not found");
	}

	const connection = await getConnection(ctx, connectionId);
	if (!connection) {
		error(404, "Connection not found");
	}

	const prefs = getUserPrefs(event.cookies);
	let initialObjects: S3ObjectInfo[] = [];
	let initialNextToken: string | undefined;
	try {
		const result = await listObjects(ctx, connectionId, bucketName, "", prefs.itemsPerPage);
		initialObjects = result.objects;
		initialNextToken = result.nextToken;
	} catch (e) {
		console.error("Failed to fetch initial objects:", e);
	}

	return { connection, bucketName, prefs, initialObjects, initialNextToken };
};
