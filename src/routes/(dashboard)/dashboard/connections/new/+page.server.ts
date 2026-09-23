import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { addConnection } from "$lib/server/connections";
import { getServerContext } from "$lib/server/context";

export const actions = {
	add: async (event) => {
		const ctx = getServerContext(event);
		const form = await event.request.formData();

		const data = {
			name: String(form.get("name") ?? ""),
			type: form.get("type") === "r2" ? ("r2" as const) : ("s3" as const),
			accessKeyId: String(form.get("accessKeyId") ?? ""),
			secretAccessKey: String(form.get("secretAccessKey") ?? ""),
			region: String(form.get("region") ?? "") || "us-east-1",
			endpoint: String(form.get("endpoint") ?? "") || undefined,
			bucket: String(form.get("bucket") ?? "") || undefined,
			publicUrl: String(form.get("publicUrl") ?? "") || undefined,
		};

		const response = await addConnection(ctx, data);
		if (response.error) {
			return fail(400, { error: response.error });
		}

		redirect(303, "/dashboard");
	},
} satisfies Actions;
