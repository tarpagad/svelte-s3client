import { dev } from "$app/environment";
import type { RequestEvent } from "@sveltejs/kit";

/** Cookie storing the visitor's own encryption key (AES-256 secret). */
export const KEY_COOKIE_NAME = "s3-key";
/** Cookie storing the encrypted connection array. */
export const CONNECTIONS_COOKIE_NAME = "s3-connections";

/**
 * Options shared by all credential-bearing cookies (encryption key,
 * encrypted connections). httpOnly + SameSite=strict: the key and the
 * ciphertext only ever travel on same-origin requests, so provisioning
 * logic can trust that "cookie absent on a write" really means absent.
 */
export function secretCookieOptions(maxAgeSeconds: number) {
	return {
		httpOnly: true,
		secure: !dev,
		sameSite: "strict" as const,
		path: "/",
		maxAge: maxAgeSeconds,
	};
}

export interface ServerContext {
	cookies: RequestEvent["cookies"];
	envKey?: string;
	/**
	 * Memoized write key for this request (set by `resolveWriteKey` in
	 * connections.ts) so every operation in one request agrees on the same
	 * key regardless of cookie-read timing. Request-scoped, never persisted
	 * anywhere but the key cookie itself.
	 */
	writeKeyCache?: string;
}

export function getServerContext(event: RequestEvent): ServerContext {
	const env = event.platform?.env as { ENCRYPTION_KEY?: string } | undefined;
	return { cookies: event.cookies, envKey: env?.ENCRYPTION_KEY };
}
