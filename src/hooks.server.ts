import type { Handle } from "@sveltejs/kit";

/**
 * Security headers applied to every response.
 *
 * - `frame-ancestors 'none'` (+ X-Frame-Options) — the app performs
 *   destructive S3 actions with no re-auth, so it must never be framed
 *   (clickjacking protection).
 * - `img-src` / `media-src` / `frame-src https:` — object previews load
 *   presigned URLs from the user's S3/R2 provider; the origins are
 *   user-configured so arbitrary HTTPS endpoints must be allowed.
 * - `referrer-policy` — presigned URLs contain short-lived credentials;
 *   never leak them via Referer.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
};
