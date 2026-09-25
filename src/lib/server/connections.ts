import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { decrypt, encrypt, generateEncryptionKey } from "$lib/encryption";
import type {
	ConnectionInfo,
	CreateConnectionInput,
	DecryptedConnection,
	UpdateConnectionInput,
} from "$lib/types";
import {
	createConnectionSchema,
	updateConnectionSchema,
} from "$lib/types";
import {
	CONNECTIONS_COOKIE_NAME as COOKIE_NAME,
	KEY_COOKIE_NAME,
	LEGACY_CONNECTIONS_COOKIE_NAME as LEGACY_COOKIE_NAME,
	LEGACY_KEY_COOKIE_NAME,
	readCookie,
	secretCookieOptions,
	type ServerContext,
} from "./context";

export interface StoredConnection {
	id: string;
	name: string;
	type: "s3" | "r2";
	encryptedCredentials: string;
	region: string;
	endpoint: string | null;
	bucket: string | null;
	publicUrl: string | null;
}

function baseCookieOptions() {
	return secretCookieOptions(60 * 60 * 24 * 30);
}

const KEY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

/**
 * Resolves the key for a WRITE path (add/update connections, rotation).
 * Guarantees ONE key per request so inner credential blobs and the outer
 * cookie are always encrypted under the same secret:
 *
 * 1. explicit override (key rotation),
 * 2. the visitor's key cookie,
 * 3. a newly provisioned random per-visitor key (first write ever), or
 *    the dev-only default in `vite dev`.
 *
 * The legacy env secret is never returned here — new data is never
 * encrypted under a shared server secret. Memoized on the request-scoped
 * ctx because mid-request cookie reads don't reflect mid-request
 * `cookies.set` in SvelteKit.
 */
export async function resolveWriteKey(
	ctx: ServerContext,
	overrideKey?: string,
): Promise<string> {
	if (ctx.writeKeyCache) return ctx.writeKeyCache;

	let key: string;
	if (overrideKey) {
		key = overrideKey;
	} else {
		const keyCookie = readCookie(
			ctx.cookies,
			KEY_COOKIE_NAME,
			LEGACY_KEY_COOKIE_NAME,
		);
		key = keyCookie ?? generateEncryptionKey();
	}

	ctx.writeKeyCache = key;
	return key;
}

/**
 * Resolves the key for READ paths: visitor key → legacy shared env secret
 * (read-only fallback for data created before per-visitor keys) → dev-only
 * default → throw. Never use for writes — use `resolveWriteKey`.
 */
export async function resolveEncryptionKey(
	ctx: ServerContext,
	overrideKey?: string,
): Promise<string> {
	if (overrideKey) return overrideKey;

	const keyCookie = readCookie(
		ctx.cookies,
		KEY_COOKIE_NAME,
		LEGACY_KEY_COOKIE_NAME,
	);
	if (keyCookie) return keyCookie;

	if (ctx.envKey) return ctx.envKey;

	if (dev) {
		return "default-dev-key-do-not-use-in-prod";
	}

	throw new Error(
		"No encryption key configured. Set the ENCRYPTION_KEY secret or set an encryption key in Settings.",
	);
}

export async function readConnections(
	ctx: ServerContext,
	encryptionKey?: string,
): Promise<StoredConnection[]> {
	const cookie = readCookie(
		ctx.cookies,
		COOKIE_NAME,
		LEGACY_COOKIE_NAME,
	);
	if (!cookie) return [];

	const key = await resolveEncryptionKey(ctx, encryptionKey);
	try {
		const decrypted = await decrypt(cookie, key);
		if (!decrypted) return [];
		return JSON.parse(decrypted) as StoredConnection[];
	} catch {
		return [];
	}
}

export async function writeConnections(
	ctx: ServerContext,
	connections: StoredConnection[],
	encryptionKey?: string,
): Promise<void> {
	// Explicit key (key rotation): use as-is, never touch the key cookie —
	// the rotation flow sets it itself after the data is migrated.
	if (encryptionKey) {
		const jsonStr = JSON.stringify(connections);
		const encrypted = await encrypt(jsonStr, encryptionKey);
		ctx.cookies.set(COOKIE_NAME, encrypted, baseCookieOptions());
		return;
	}

	const key = await resolveWriteKey(ctx);
	const primaryKeyCookie = ctx.cookies.get(KEY_COOKIE_NAME);
	const existingKeyCookie = readCookie(
		ctx.cookies,
		KEY_COOKIE_NAME,
		LEGACY_KEY_COOKIE_NAME,
	);

	if (key !== existingKeyCookie || !primaryKeyCookie) {
		// Persist the resolved key under the primary name. Two cases:
		// - first write ever (or dev default): key differs from any cookie;
		// - legacy-name visitor: key value came from the legacy cookie
		//   (reused for data continuity) but the legacy cookies are cleared
		//   below — re-persist the same value under the primary name, or the
		//   key would be stranded and the data undecryptable.
		ctx.cookies.set(
			KEY_COOKIE_NAME,
			key,
			secretCookieOptions(KEY_COOKIE_MAX_AGE),
		);
	}

	if (key !== existingKeyCookie) {
		// Legacy migration: existing connections may come from an outer
		// cookie encrypted under a shared secret (env key, or the dev
		// default), which is the only way data can exist without a key
		// cookie. Re-encrypt their inner credential blobs under this
		// visitor's key. Runs only on same-origin write paths, where
		// SameSite=strict guarantees an existing key cookie would have
		// been sent — so "absent" genuinely means "never provisioned".
		const legacyKey = ctx.envKey ?? (dev ? "default-dev-key-do-not-use-in-prod" : undefined);
		if (legacyKey && connections.length > 0) {
			const migrated: StoredConnection[] = [];
			for (const conn of connections) {
				// A blob already under this request's key (e.g. the connection
				// added moments ago) needs no migration; probing it with the
				// legacy key would fail and log a spurious error.
				const underWriteKey = await decrypt(conn.encryptedCredentials, key, {
					quiet: true,
				});
				if (underWriteKey !== null) {
					migrated.push(conn);
					continue;
				}
				const inner = await decrypt(conn.encryptedCredentials, legacyKey);
				migrated.push({
					...conn,
					encryptedCredentials:
						inner !== null
							? await encrypt(inner, key)
							: conn.encryptedCredentials,
				});
			}
			connections = migrated;
		}
	}

	const jsonStr = JSON.stringify(connections);
	const encrypted = await encrypt(jsonStr, key);

	// Migration: clear the legacy (unprefixed) cookies so the __Host- pair
	// becomes the only copy. In dev the primary names ARE the unprefixed
	// ones, so deleting unconditionally would remove the cookies just set
	// (SvelteKit lets a later delete overwrite a pending set) — stranding
	// the visitor key and leaving an undecryptable connections cookie.
	if (LEGACY_COOKIE_NAME !== COOKIE_NAME) {
		ctx.cookies.delete(LEGACY_COOKIE_NAME, { path: "/" });
	}
	if (LEGACY_KEY_COOKIE_NAME !== KEY_COOKIE_NAME) {
		ctx.cookies.delete(LEGACY_KEY_COOKIE_NAME, { path: "/" });
	}

	ctx.cookies.set(COOKIE_NAME, encrypted, baseCookieOptions());
}

function toConnectionInfo(c: StoredConnection): ConnectionInfo {
	return {
		id: c.id,
		name: c.name,
		type: c.type,
		region: c.region,
		endpoint: c.endpoint,
		bucket: c.bucket,
		publicUrl: c.publicUrl,
	};
}

export async function addConnection(
	ctx: ServerContext,
	data: CreateConnectionInput,
): Promise<{ success?: boolean; error?: string; id?: string }> {
	const result = createConnectionSchema.safeParse(data);
	if (!result.success) {
		return { error: result.error.issues[0].message };
	}

	// Write key: one key per request, shared by the inner blob and the
	// outer cookie. Never the shared env secret.
	const key = await resolveWriteKey(ctx);
	const credsJson = JSON.stringify({
		accessKeyId: result.data.accessKeyId,
		secretAccessKey: result.data.secretAccessKey,
	});
	const encryptedCredentials = await encrypt(credsJson, key);

	const stored: StoredConnection = {
		id: crypto.randomUUID(),
		name: result.data.name,
		type: result.data.type,
		encryptedCredentials,
		region: result.data.region,
		endpoint: result.data.endpoint || null,
		bucket: result.data.bucket || null,
		publicUrl: result.data.publicUrl || null,
	};

	const connections = await readConnections(ctx);
	connections.push(stored);
	await writeConnections(ctx, connections);

	return { success: true, id: stored.id };
}

export async function listConnections(
	ctx: ServerContext,
): Promise<ConnectionInfo[]> {
	const connections = await readConnections(ctx);
	return connections.map(toConnectionInfo);
}

export async function getConnection(
	ctx: ServerContext,
	id: string,
): Promise<ConnectionInfo | null> {
	const connections = await readConnections(ctx);
	const found = connections.find((c) => c.id === id);
	return found ? toConnectionInfo(found) : null;
}

export async function getDecryptedConnection(
	ctx: ServerContext,
	id: string,
): Promise<DecryptedConnection | null> {
	const connections = await readConnections(ctx);
	const stored = connections.find((c) => c.id === id);
	if (!stored) return null;

	const key = await resolveEncryptionKey(ctx);
	const decrypted = await decrypt(stored.encryptedCredentials, key);
	if (!decrypted) return null;

	const creds = JSON.parse(decrypted) as {
		accessKeyId: string;
		secretAccessKey: string;
	};

	return {
		id: stored.id,
		name: stored.name,
		type: stored.type,
		region: stored.region,
		endpoint: stored.endpoint,
		bucket: stored.bucket,
		publicUrl: stored.publicUrl,
		accessKeyId: creds.accessKeyId,
		secretAccessKey: creds.secretAccessKey,
	};
}

export async function updateConnection(
	ctx: ServerContext,
	id: string,
	data: UpdateConnectionInput,
): Promise<{ success?: boolean; error?: string }> {
	const result = updateConnectionSchema.safeParse(data);
	if (!result.success) {
		return { error: result.error.issues[0].message };
	}

	const connections = await readConnections(ctx);
	const index = connections.findIndex((c) => c.id === id);
	if (index === -1) {
		return { error: "Connection not found" };
	}

	const existing = connections[index];
	// Write key: one key per request — see addConnection.
	const key = await resolveWriteKey(ctx);

	const hasNewCredentials =
		result.data.accessKeyId && result.data.secretAccessKey;

	let encryptedCredentials = existing.encryptedCredentials;
	if (hasNewCredentials) {
		const credsJson = JSON.stringify({
			accessKeyId: result.data.accessKeyId,
			secretAccessKey: result.data.secretAccessKey,
		});
		encryptedCredentials = await encrypt(credsJson, key);
	}

	connections[index] = {
		...existing,
		name: result.data.name,
		encryptedCredentials,
		region: result.data.region,
		endpoint: result.data.endpoint || null,
		bucket: result.data.bucket || null,
		publicUrl: result.data.publicUrl ?? existing.publicUrl,
	};

	await writeConnections(ctx, connections);

	return { success: true };
}

export async function removeConnection(
	ctx: ServerContext,
	id: string,
): Promise<{ success?: boolean; error?: string }> {
	const connections = await readConnections(ctx);
	const filtered = connections.filter((c) => c.id !== id);

	if (filtered.length === connections.length) {
		return { error: "Connection not found" };
	}

	await writeConnections(ctx, filtered);

	return { success: true };
}
