import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import * as s3 from "$lib/server/s3";
import { getServerContext } from "$lib/server/context";

// Cloudflare enforces a 100 MB request body limit at the edge.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
	const ctx = getServerContext(event);

	let form: FormData;
	try {
		form = await event.request.formData();
	} catch {
		return json({ error: "Invalid form data" }, { status: 400 });
	}

	const connectionId = String(form.get("connectionId") ?? "");
	const bucket = String(form.get("bucket") ?? "");
	const key = String(form.get("key") ?? "");
	const isPublic = form.get("isPublic") === "true";
	const file = form.get("file");

	if (!connectionId || !bucket || !key || !(file instanceof File)) {
		return json(
			{ error: "Missing connectionId, bucket, key, or file" },
			{ status: 400 },
		);
	}

	if (file.size > MAX_UPLOAD_BYTES) {
		return json(
			{
				error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The upload limit is 100 MB.`,
			},
			{ status: 413 },
		);
	}

	const result = await s3.uploadFile(ctx, connectionId, bucket, key, file, isPublic);
	return json(result);
};
