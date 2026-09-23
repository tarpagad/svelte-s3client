import { decrypt, encrypt } from "$lib/encryption";
import {
	KEY_COOKIE_NAME,
	secretCookieOptions,
	type ServerContext,
} from "./context";
import { readConnections, writeConnections } from "./connections";

const KEY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

function keyCookieOptions() {
	return secretCookieOptions(KEY_COOKIE_MAX_AGE);
}

export async function setEncryptionKey(
	ctx: ServerContext,
	key: string,
): Promise<{ success?: boolean; error?: string }> {
	if (!key || key.length < 8) {
		return { error: "Encryption key must be at least 8 characters" };
	}

	ctx.cookies.set(KEY_COOKIE_NAME, key, keyCookieOptions());

	return { success: true };
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

export async function removeEncryptionKey(
	ctx: ServerContext,
): Promise<{ success?: boolean; error?: string }> {
	ctx.cookies.delete(KEY_COOKIE_NAME, { path: "/" });
	return { success: true };
}

export async function changeEncryptionKey(
	ctx: ServerContext,
	currentKey: string,
	newKey: string,
): Promise<{ success?: boolean; error?: string }> {
	if (!newKey || newKey.length < 8) {
		return { error: "New encryption key must be at least 8 characters" };
	}
	if (!currentKey) {
		return { error: "Current encryption key is required" };
	}

	const connectionsCookie = ctx.cookies.get("s3-connections");

	if (!connectionsCookie) {
		ctx.cookies.set(KEY_COOKIE_NAME, newKey, keyCookieOptions());
		return { success: true };
	}

	const connections = await readConnections(ctx, currentKey);

	if (!connections || connections.length === 0) {
		const parsed = await decrypt(connectionsCookie, currentKey);
		if (parsed === null) {
			return {
				error:
					"Failed to decrypt connections with the current key. Please verify it is correct.",
			};
		}
	}

	const migrated = [];
	for (const conn of connections) {
		const decryptedInner = await decrypt(conn.encryptedCredentials, currentKey);
		if (decryptedInner) {
			const reEncryptedInner = await encrypt(decryptedInner, newKey);
			migrated.push({ ...conn, encryptedCredentials: reEncryptedInner });
		} else {
			migrated.push(conn);
		}
	}

	await writeConnections(ctx, migrated, newKey);

	ctx.cookies.set(KEY_COOKIE_NAME, newKey, keyCookieOptions());

	return { success: true };
}
