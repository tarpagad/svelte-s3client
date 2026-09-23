import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Minimum length for user-chosen encryption keys. The key material is
 * SHA-256(passphrase), so passphrase entropy IS the key strength — a
 * stolen `s3-key` cookie can be brute-forced offline. 16 chars + 3
 * character classes keeps weak passphrases out while staying usable.
 * Server-generated random keys (base64url, 43 chars) always pass.
 */
export const MIN_KEY_LENGTH = 16;

/**
 * Returns an error message if the encryption key is too weak, or null if
 * acceptable. Shared by the settings UI (client) and the key API (server)
 * so the rules can never drift apart.
 */
export function validateEncryptionKey(key: string): string | null {
	if (!key || key.length < MIN_KEY_LENGTH) {
		return `Encryption key must be at least ${MIN_KEY_LENGTH} characters`;
	}

	const classes = [
		/[a-z]/,
		/[A-Z]/,
		/[0-9]/,
		/[^a-zA-Z0-9]/,
	].filter((re) => re.test(key)).length;

	if (classes < 3) {
		return "Encryption key must mix at least 3 of: lowercase, uppercase, digits, symbols";
	}

	return null;
}

export function getPublicObjectUrl(
	bucketName: string,
	key: string,
	publicUrl?: string | null,
): string {
	if (publicUrl) {
		const baseUrl = publicUrl.replace(/\/$/, "");
		return `${baseUrl}/${key}`;
	}
	return `https://${bucketName}.s3.amazonaws.com/${key}`;
}
