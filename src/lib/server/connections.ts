import type { Cookies } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { decrypt, encrypt } from "$lib/encryption";
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
import type { ServerContext } from "./context";

const COOKIE_NAME = "s3-connections";
const KEY_COOKIE_NAME = "s3-key";

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
	return {
		httpOnly: true,
		secure: !dev,
		sameSite: "strict" as const,
		path: "/",
	};
}

export async function resolveEncryptionKey(
	ctx: ServerContext,
	overrideKey?: string,
): Promise<string> {
	if (overrideKey) return overrideKey;

	const keyCookie = ctx.cookies.get(KEY_COOKIE_NAME);
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
	const cookie = ctx.cookies.get(COOKIE_NAME);
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
	const key = await resolveEncryptionKey(ctx, encryptionKey);
	const jsonStr = JSON.stringify(connections);
	const encrypted = await encrypt(jsonStr, key);

	ctx.cookies.set(COOKIE_NAME, encrypted, {
		...baseCookieOptions(),
		maxAge: 60 * 60 * 24 * 30,
	});
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

	const key = await resolveEncryptionKey(ctx);
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
	const key = await resolveEncryptionKey(ctx);

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
