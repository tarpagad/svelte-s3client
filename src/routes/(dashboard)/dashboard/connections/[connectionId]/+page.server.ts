import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getConnection, removeConnection } from "$lib/server/connections";
import { listBuckets } from "$lib/server/s3";
import { getServerContext } from "$lib/server/context";
import type { BucketInfo } from "$lib/types";

export const load: PageServerLoad = async (event) => {
	const ctx = getServerContext(event);
	const connectionId = event.params.connectionId ?? "";
	const connection = await getConnection(ctx, connectionId);
	if (!connection) {
		error(404, "Connection not found");
	}

	let buckets: BucketInfo[] = [];
	let loadError: string | null = null;
	try {
		buckets = await listBuckets(ctx, connectionId);
		buckets.sort((a, b) => a.name.localeCompare(b.name));
	} catch (err: unknown) {
		loadError = err instanceof Error ? err.message : "An unknown error occurred";
	}

	return { connection, buckets, loadError };
};

export const actions = {
	delete: async (event) => {
		const ctx = getServerContext(event);
		const connectionId = event.params.connectionId ?? "";
		const response = await removeConnection(ctx, connectionId);
		if (response.error) {
			return fail(400, { error: response.error });
		}
		redirect(303, "/dashboard");
	},
} satisfies Actions;
