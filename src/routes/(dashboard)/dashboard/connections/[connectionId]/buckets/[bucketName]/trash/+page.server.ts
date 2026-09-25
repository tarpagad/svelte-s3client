import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getConnection } from "$lib/server/connections";
import { listObjects, purgeTrash } from "$lib/server/s3";
import { getServerContext } from "$lib/server/context";
import { TRASH_PREFIX } from "$lib/trash-path";
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

	// Lazy purge of expired batches (ADR-0005): a scheduled worker would
	// have no request cookies, so cleanup runs when Trash is opened.
	try {
		await purgeTrash(ctx, connectionId, bucketName);
	} catch (e) {
		console.error("Trash purge failed:", e);
	}

	let initialBatches: S3ObjectInfo[] = [];
	try {
		const result = await listObjects(
			ctx,
			connectionId,
			bucketName,
			TRASH_PREFIX,
			100,
			undefined,
			"name-asc",
		);
		initialBatches = result.objects.filter((o) => o.type === "folder");
	} catch (e) {
		console.error("Failed to list trash batches:", e);
	}

	return {
		connectionId,
		bucketName,
		connectionName: connection.name,
		initialBatches,
	};
};
