import { dev } from "$app/environment";
import { json, type RequestEvent } from "@sveltejs/kit";

/**
 * Cookie storing the visitor's own encryption key (AES-256 secret) and the
 * encrypted connection array. Production uses the __Host- prefix, which
 * pins the cookie to this exact host (no Domain attribute, Secure
 * required) so a sibling subdomain can never overwrite the credentials.
 * Dev keeps the plain names: __Host- mandates the Secure attribute, which
 * is incompatible with http://localhost in `vite dev`.
 */
export const KEY_COOKIE_NAME = dev ? "s3-key" : "__Host-s3-key";
export const CONNECTIONS_COOKIE_NAME = dev
	? "s3-connections"
	: "__Host-s3-connections";
/**
 * Previous cookie names (no prefix). Cookies are READ under both names —
 * `readCookie` tries the __Host- name first, then the legacy one — but
 * always WRITTEN under the current primary name, so every visitor
 * migrates to the prefixed cookies on their next write.
 */
export const LEGACY_KEY_COOKIE_NAME = "s3-key";
export const LEGACY_CONNECTIONS_COOKIE_NAME = "s3-connections";

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

/**
 * Reads a credential cookie: __Host- name first, legacy name fallback.
 */
export function readCookie(
	cookies: RequestEvent["cookies"],
	primary: string,
	legacy: string,
): string | undefined {
	return cookies.get(primary) ?? cookies.get(legacy);
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

/**
 * CSRF defence for the JSON endpoints. SvelteKit already CSRF-checks
 * `content-type: application/json` POSTs (blocks text/plain form posts),
 * but browsers can still be made to send same-site (subdomain) JSON with
 * cookies attached. Defence in depth: an explicit Origin/Referer check
 * that the request really came from this exact host.
 *
 * Returns a 403 JSON response if the request is not same-origin, or
 * `null` when it passes. Cross-origin fetch() cannot set Origin, so a
 * missing Origin+Referer is also rejected.
 */
export function assertSameOrigin(event: RequestEvent): Response | null {
	const request = event.request;
	const origin = request.headers.get("origin");
	const referer = request.headers.get("referer");
	// Referer falls back to the origin: "https://site.com/page" → "https://site.com"
	const source = origin ?? referer?.split("/").slice(0, 3).join("/");

	if (!source) {
		return json({ error: "Missing Origin header" }, { status: 403 });
	}

	let sourceHost: string;
	try {
		sourceHost = new URL(source).host;
	} catch {
		return json({ error: "Invalid Origin header" }, { status: 403 });
	}

	if (sourceHost !== event.url.host) {
		return json({ error: "Cross-origin request rejected" }, { status: 403 });
	}

	return null;
}
