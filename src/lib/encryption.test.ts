import { describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  generateEncryptionKey,
} from "./encryption";

const SECRET = "test-passphrase-with-entropy-42";

describe("generateEncryptionKey", () => {
  it("returns 43-char base64url (32 bytes, no padding)", () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(43);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is random across calls", () => {
    const keys = new Set(Array.from({ length: 100 }, generateEncryptionKey));
    expect(keys.size).toBe(100);
  });
});

describe("encrypt/decrypt round-trip", () => {
  it("recovers plaintext", async () => {
    const plaintext = "secret-access-key w/ unicode: héllo 世界 🔑";
    const ciphertext = await encrypt(plaintext, SECRET);
    expect(ciphertext).not.toContain(plaintext);
    expect(await decrypt(ciphertext, SECRET)).toBe(plaintext);
  });

  it("handles empty string", async () => {
    const ciphertext = await encrypt("", SECRET);
    expect(await decrypt(ciphertext, SECRET)).toBe("");
  });

  it("is non-deterministic (fresh IV per call)", async () => {
    const a = await encrypt("same plaintext", SECRET);
    const b = await encrypt("same plaintext", SECRET);
    expect(a).not.toBe(b);
  });

  it("rejects the wrong secret (tamper detection)", async () => {
    const ciphertext = await encrypt("data", SECRET);
    expect(await decrypt(ciphertext, "different-passphrase")).toBeNull();
  });

  it("returns null for tampered ciphertext (GCM auth)", async () => {
    const ciphertext = await encrypt("data", SECRET);
    const raw = atob(ciphertext.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 0x01; // flip one bit of the tag
    const tampered = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await decrypt(tampered, SECRET)).toBeNull();
  });

  it("returns null for truncated input", async () => {
    const ciphertext = await encrypt("data", SECRET);
    expect(await decrypt(ciphertext.slice(0, 8), SECRET)).toBeNull();
  });
});
