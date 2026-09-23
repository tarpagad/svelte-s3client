import { describe, expect, it } from "vitest";
import { validateEncryptionKey } from "./utils";

describe("validateEncryptionKey", () => {
  it("accepts server-generated base64url keys", () => {
    // 43-char base64url of 32 random bytes — mixed classes by construction
    expect(validateEncryptionKey("Ab3dEf6hIj9kLm2nOp4qRs5tUv8wXy0z-_")).toBeNull();
  });

  it("accepts a strong passphrase", () => {
    expect(validateEncryptionKey("correct-horse-BATTERY-9")).toBeNull();
  });

  it("rejects empty/short keys", () => {
    expect(validateEncryptionKey("")).toMatch(/at least 16/);
    expect(validateEncryptionKey("Sh0rt!k3y")).toMatch(/at least 16/);
  });

  it("rejects long but single-class keys", () => {
    expect(validateEncryptionKey("aaaaaaaaaaaaaaaaaaaa")).toMatch(/3 of/);
    expect(validateEncryptionKey("AAAAAAAAAAAAAAAAAAAA1")).toMatch(/3 of/);
  });

  it("requires 3 of 4 character classes (boundary)", () => {
    // 2 classes → rejected
    expect(validateEncryptionKey("onlylowercaseandupper")).toMatch(/3 of/);
    expect(validateEncryptionKey("lowercase1234567890")).toMatch(/3 of/);
    // 3 classes → accepted
    expect(validateEncryptionKey("lowercase-with-123")).toBeNull();
    expect(validateEncryptionKey("lowercase-123!@#")).toBeNull(); // lower+digit+symbol
  });

  it("treats symbols and digits as distinct classes", () => {
    expect(validateEncryptionKey("Ab1!Ab1!Ab1!Ab1!")).toBeNull();
  });
});
