import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("dev CSP allows blob: workers (Vite 8 reconnect ping)", () => {
    const csp = buildSecurityHeaders(true)["Content-Security-Policy"];
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("prod CSP keeps worker-src unset (falls back to script-src)", () => {
    const csp = buildSecurityHeaders(false)["Content-Security-Policy"];
    expect(csp).not.toContain("worker-src");
  });

  it("clickjacking protection present in both modes", () => {
    for (const dev of [true, false]) {
      const headers = buildSecurityHeaders(dev);
      expect(headers["Content-Security-Policy"]).toContain(
        "frame-ancestors 'none'",
      );
      expect(headers["X-Frame-Options"]).toBe("DENY");
    }
  });

  it("preview asset protections present in both modes", () => {
    for (const dev of [true, false]) {
      const headers = buildSecurityHeaders(dev);
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Referrer-Policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(headers["Content-Security-Policy"]).toContain("img-src");
      expect(headers["Content-Security-Policy"]).toContain("media-src");
    }
  });
});
