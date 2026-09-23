import type { RequestEvent } from "@sveltejs/kit";

export interface ServerContext {
	cookies: RequestEvent["cookies"];
	envKey?: string;
}

export function getServerContext(event: RequestEvent): ServerContext {
	const env = event.platform?.env as { ENCRYPTION_KEY?: string } | undefined;
	return { cookies: event.cookies, envKey: env?.ENCRYPTION_KEY };
}
