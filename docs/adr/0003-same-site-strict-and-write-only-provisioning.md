# 0003 — SameSite=strict cookies; provision keys only on same-origin writes

- **Status**: Accepted
- **Date**: 2026-09-23 (implemented in `1a8d508`/`fcb6eb3`; recorded retroactively)
- **Area**: `src/lib/server/context.ts`, `src/hooks.server.ts`, `src/routes/api/**`

## Context

Credential cookies need CSRF resistance. Two mechanisms interact here:

1. **Cookie attribute**: `SameSite=strict` prevents the cookie being sent on
   any cross-site request (including plain navigations), which is what a
   credential cookie wants — but it also means a visitor arriving from an
   external link has *no cookies on the first request*.
2. **Key provisioning**: the naive place to provision the key cookie is the
   response hook (`hooks.server.ts`), which runs on every request. That is
   exactly wrong under SameSite=strict: setting cookies on a cross-site-
   navigated response gets them overwritten/blocked by the browser, and
   "cookie absent" stops being trustworthy evidence of "never provisioned".

Separately, SvelteKit's built-in CSRF check only blocks cross-origin
`text/plain` form posts; JSON endpoints can still receive same-site
(subdomain) requests with cookies attached.

## Decision

- All credential-bearing cookies use `secretCookieOptions`: `httpOnly`,
  `secure` (non-dev), `sameSite: "strict"`, `path: "/"`. Production names use
  the `__Host-` prefix (pinned to the exact host, `Secure` mandatory, no
  `Domain` attribute) so a sibling subdomain cannot overwrite them. Dev keeps
  plain names because `__Host-` requires `Secure`, which is incompatible with
  `http://localhost` in `vite dev`.
- **Key provisioning happens only on same-origin write paths** (form actions
  and `/api/*` POSTs) — never in the response hook. `hooks.server.ts` sets
  security headers only. SameSite=strict then guarantees that a key cookie
  absent on a write really means "never provisioned".
- Every `/api/*` POST runs `assertSameOrigin(event)` (`context.ts`): the
  Origin header (Referer fallback) host must equal the request host; missing,
  malformed, or mismatched → 403. Form actions rely on SvelteKit's built-in
  CSRF origin check.

## Consequences

- **Positive**: subdomain cookie forgery is impossible in prod; JSON CSRF is
  defence-in-depth; provisioning logic stays sound under strict SameSite.
- **Negative**: visitors coming from external links make one extra request
  before cookies flow (cosmetic); `__Host-` migration needed a
  read-old/write-new transition (`readCookie` helpers) — existing visitors
  migrate on their next write.
- **Guardrails for agents**: do not move provisioning into
  `hooks.server.ts`; do not relax `sameSite` or drop `secure`; new JSON
  endpoints must call `assertSameOrigin` first; new cookie names must go
  through the `KEY_COOKIE_NAME`/`CONNECTIONS_COOKIE_NAME` constants (with
  legacy fallback), not literal strings.
