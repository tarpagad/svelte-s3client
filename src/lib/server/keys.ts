import { decrypt, encrypt } from "$lib/encryption";
import { dev } from "$app/environment";
import { validateEncryptionKey } from "$lib/utils";
import {
	CONNECTIONS_COOKIE_NAME,
	KEY_COOKIE_NAME,
	secretCookieOptions,
	type ServerContext,
} from "./context";
import { readConnections, writeConnections, resolveEncryptionKey, type StoredConnection } from "./connections";

const KEY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

function keyCookieOptions() {
	return secretCookieOptions(KEY_COOKIE_MAX_AGE);
}

export async function setEncryptionKey(
	ctx: ServerContext,
	key: string,
): Promise<{ success?: boolean; error?: string }> {
	const keyError = validateEncryptionKey(key);
	if (keyError) return { error: keyError };

	const connectionsCookie = ctx.cookies.get(CONNECTIONS_COOKIE_NAME);

	if (!connectionsCookie) {
		// No stored data — the key cookie is safe to set directly.
		ctx.cookies.set(KEY_COOKIE_NAME, key, keyCookieOptions());
		return { success: true };
	}

	// Data exists: it is encrypted under the current key (visitor key,
	// legacy env key, or dev default). Setting a new key without migrating
	// would strand it, so treat "set" as a full rotation of existing data.
	return changeEncryptionKey(ctx, "", key);
}

export async function getEncryptionKeyStatus(ctx: ServerContext): Promise<{
	hasCookieKey: boolean;
	hasEnvKey: boolean;
}> {
	const keyCookie = ctx.cookies.get(KEY_COOKIE_NAME);
	return {
		hasCookieKey: !!keyCookie,
		hasEnvKey: !!ctx.envKey,
	};
}

/**
 * Removes the visitor's key cookie — only safe when no data would be
 * stranded. Data encrypted under the legacy env key (or the dev default)
 * stays readable without the cookie, so removal is allowed in those
 * cases; otherwise refuse while connections exist.
 */
export async function removeEncryptionKey(
	ctx: ServerContext,
): Promise<{ success?: boolean; error?: string }> {
	const keyCookie = ctx.cookies.get(KEY_COOKIE_NAME);
	const existing = await readConnections(ctx);
	const hasConnections = existing.length > 0;

	// Data exists and nothing but this cookie key can read it → refuse.
	if (
		hasConnections &&
		keyCookie &&
		!ctx.envKey &&
		!dev // dev fallback key still decrypts without the cookie
	) {
		return {
			error:
				"Cannot remove the encryption key while connections exist that only it can decrypt. Delete the connections first.",
		};
	}

	ctx.cookies.delete(KEY_COOKIE_NAME, { path: "/" });
	return { success: true };
}

export async function changeEncryptionKey(
	ctx: ServerContext,
	currentKey: string,
	newKey: string,
): Promise<{ success?: boolean; error?: string }> {
	const keyError = validateEncryptionKey(newKey);
	if (keyError) return { error: keyError };

	const connectionsCookie = ctx.cookies.get(CONNECTIONS_COOKIE_NAME);

	if (!connectionsCookie) {
		ctx.cookies.set(KEY_COOKIE_NAME, newKey, keyCookieOptions());
		return { success: true };
	}

	// Resolve the key the data is currently encrypted under: the supplied
	// currentKey first, then the normal read chain (visitor key cookie →
	// legacy env key → dev default). Empty currentKey is legitimate for
	// legacy data that never had a user-chosen key.
	let oldKey: string | null = null;
	if (currentKey) {
		oldKey = currentKey;
	} else {
		try {
			oldKey = await resolveEncryptionKey(ctx);
		} catch {
			return {
				error:
					"No encryption key available to decrypt the existing connections.",
			};
		}
	}

	const connections = await readConnections(ctx, oldKey);

	if (connections.length === 0) {
		// The cookie exists but yielded nothing: it either decrypted to an
		// empty list (fine) or failed to decrypt (wrong key). Distinguish
		// by decrypting directly.
		const parsed = await decrypt(connectionsCookie, oldKey);
		if (parsed === null) {
			return {
				error:
					"Failed to decrypt connections with the current key. Please verify it is correct.",
			};
		}
	}

	// Atomic migration: decrypt every inner credential blob BEFORE writing
	// anything. Aborting here (instead of keeping undecryptable entries)
	// guarantees the data is never left encrypted under a mix of keys.
	const migrated: StoredConnection[] = [];
	for (const conn of connections) {
		const inner = await decrypt(conn.encryptedCredentials, oldKey);
		if (inner === null) {
			return {
				error: `Failed to decrypt credentials for connection "${conn.name}". Key change aborted; nothing was modified.`,
			};
		}
		migrated.push({
			...conn,
			encryptedCredentials: await encrypt(inner, newKey),
		});
	}

	// Both Set-Cookie headers (data + key) are emitted together with the
	// response, so the data and its key change atomically.
	await writeConnections(ctx, migrated, newKey);
	ctx.cookies.set(KEY_COOKIE_NAME, newKey, keyCookieOptions());

	return { success: true };
}
