export const ENCRYPTION_ALGORITHM = "AES-GCM";

/**
 * Generates a cryptographically random 256-bit key, base64url-encoded.
 * Used to provision a unique per-visitor encryption key so no shared
 * server secret can ever decrypt one user's stored credentials.
 */
export function generateEncryptionKey(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	// base64url (RFC 4648 §5): URL/cookie safe, no padding
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(secret);
	// Hash the secret to ensure it's 32 bytes (256 bits) for AES-256
	const hash = await crypto.subtle.digest("SHA-256", keyData);
	return crypto.subtle.importKey(
		"raw",
		hash,
		{ name: ENCRYPTION_ALGORITHM },
		false,
		["encrypt", "decrypt"],
	);
}

export async function encrypt(text: string, secret: string): Promise<string> {
	const key = await getCryptoKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoder = new TextEncoder();
	const encoded = encoder.encode(text);

	const ciphertext = await crypto.subtle.encrypt(
		{
			name: ENCRYPTION_ALGORITHM,
			iv,
		},
		key,
		encoded,
	);

	// Combine IV and ciphertext for storage
	const ivArr = Array.from(iv);
	const ciphertextArr = Array.from(new Uint8Array(ciphertext));
	const combined = new Uint8Array([...ivArr, ...ciphertextArr]);

	// Return base64url encoded string
	return btoa(String.fromCharCode(...combined));
}

export async function decrypt(
	encryptedText: string,
	secret: string,
	options?: { quiet?: boolean },
): Promise<string | null> {
	try {
		const combinedStr = atob(encryptedText);
		const combined = new Uint8Array(combinedStr.length);
		for (let i = 0; i < combinedStr.length; i++) {
			combined[i] = combinedStr.charCodeAt(i);
		}

		// Extract IV (first 12 bytes)
		const iv = combined.slice(0, 12);
		const ciphertext = combined.slice(12);

		const key = await getCryptoKey(secret);

		const decrypted = await crypto.subtle.decrypt(
			{
				name: ENCRYPTION_ALGORITHM,
				iv,
			},
			key,
			ciphertext,
		);

		const decoder = new TextDecoder();
		return decoder.decode(decrypted);
	} catch (error) {
		// `quiet` probes (e.g. "is this blob already under the new key?")
		// expect failures and must not spam the server log.
		if (!options?.quiet) {
			console.error("Decryption failed:", error);
		}
		return null;
	}
}
