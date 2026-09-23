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
 * - `worker-src 'self' blob:` (dev only) — Vite 8's dev client runs its
 *   reconnect ping (`waitForSuccessfulPing`) in a SharedWorker built from
 *   a `blob:` URL. Without an explicit `worker-src`, worker scripts fall
 *   back to `script-src`, which has no `blob:`, so the worker is blocked
 *   and the dev page never recovers after a server restart. Production
 *   builds don't ship the Vite client and the app never creates workers,
 *   so prod keeps the stricter policy (static `_headers` mirrors it).
 */
export function buildSecurityHeaders(dev: boolean): Record<string, string> {
  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    ...(dev ? ["worker-src 'self' blob:"] : []),
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

  return {
    "Content-Security-Policy": CSP,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
