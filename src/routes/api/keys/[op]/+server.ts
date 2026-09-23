import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getServerContext } from "$lib/server/context";
import { getEncryptionKeyStatus, setEncryptionKey, removeEncryptionKey, changeEncryptionKey } from "$lib/server/keys";

export const POST: RequestHandler = async (event) => {
	const op = event.params.op ?? "";
	const ctx = getServerContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	switch (op) {
		case "status":
			return json(await getEncryptionKeyStatus(ctx));
		case "set":
			return json(
				await setEncryptionKey(ctx, String(body.key ?? "")),
			);
		case "remove":
			return json(await removeEncryptionKey(ctx));
		case "change":
			return json(
				await changeEncryptionKey(
					ctx,
					String(body.currentKey ?? ""),
					String(body.newKey ?? ""),
				),
			);
		default:
			return json({ error: "Unknown operation" }, { status: 404 });
	}
};
