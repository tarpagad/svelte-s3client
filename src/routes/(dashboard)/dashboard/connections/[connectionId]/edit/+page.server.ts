import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { getConnection, updateConnection } from "$lib/server/connections";
import { getServerContext } from "$lib/server/context";

export const load: PageServerLoad = async (event) => {
	const ctx = getServerContext(event);
	const connection = await getConnection(ctx, event.params.connectionId ?? "");
	if (!connection) {
		error(404, "Connection not found");
	}
	return { connection };
};

export const actions = {
	default: async (event) => {
		const ctx = getServerContext(event);
		const connectionId = event.params.connectionId ?? "";
		const form = await event.request.formData();

		const accessKeyId = String(form.get("accessKeyId") ?? "");
		const secretAccessKey = String(form.get("secretAccessKey") ?? "");

		const data = {
			name: String(form.get("name") ?? ""),
			region: String(form.get("region") ?? "") || "us-east-1",
			endpoint: String(form.get("endpoint") ?? "") || undefined,
			bucket: String(form.get("bucket") ?? "") || undefined,
			publicUrl: String(form.get("publicUrl") ?? "") || undefined,
			...(accessKeyId ? { accessKeyId } : {}),
			...(secretAccessKey ? { secretAccessKey } : {}),
		};

		const response = await updateConnection(ctx, connectionId, data);
		if (response.error) {
			return fail(400, { error: response.error });
		}

		redirect(303, `/dashboard/connections/${connectionId}`);
	},
} satisfies Actions;
