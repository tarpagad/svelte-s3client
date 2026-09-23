# S3 Web Client (SvelteKit)

Stateless S3/R2 browser for Cloudflare Workers (paid). No auth, no database —
credentials are AES-256-GCM encrypted and stored in HTTP-only cookies.

## Stack

SvelteKit 2 (Svelte 5 runes) · TypeScript · Tailwind CSS 4 · Bun · AWS S3 SDK +
lib-storage · fflate · Zod · @sveltejs/adapter-cloudflare

## Run

```bash
bun install
bun run dev        # vite dev (platform env proxied)
bun run build      # production build + adapter
bun run preview    # run the built worker under wrangler (workerd)
bun run check      # svelte-check
```

## Deploy

```bash
bun run build
bunx wrangler deploy
bunx wrangler secret put ENCRYPTION_KEY   # optional
```

## Folder Structure

```
src/
  lib/
    api.ts                 # client helpers: callS3(op, payload), uploadToS3, callKeyApi
    encryption.ts          # AES-256-GCM (Web Crypto) — portable as-is
    prefs.ts               # getUserPrefs(cookies)
    types.ts               # types + zod schemas
    utils.ts               # cn(), getPublicObjectUrl()
    server/
      context.ts           # getServerContext(event) → { cookies, envKey }
      connections.ts       # s3-connections cookie CRUD
      keys.ts              # s3-key cookie management
      s3.ts                # S3Client factory + all S3 operations
  routes/
    +page.svelte           # landing (prerendered)
    (info)/                # privacy, terms (prerendered)
    (dashboard)/           # app shell (sidebar, topbar, theme toggle)
      dashboard/           # connections grid; connections CRUD via form actions
      api/s3/[op]/         # POST JSON dispatcher (allowlist)
      api/s3/upload/       # FormData → streaming multipart upload (100 MB cap)
      api/download-zip/    # fflate streaming ZIP (800-file cap, 10 GB guard)
      api/keys/[op]/       # key set/remove/change/status
  lib/components/
    ui/                    # Button, Card family, Input, Label
    s3/                    # FileExplorer, object-actions, dialogs, upload, preview
```

## Architecture

```
Browser                    Server
┌───────────┐              ┌────────────────────────────────────┐
│ cookies:  │  ──fetch──→  │ routes/api/* or form actions       │
│ s3-conn.  │              │  getServerContext(event)           │
│ (encrypt) │              │   → { cookies, envKey }            │
│ s3-key    │              │      ↓                             │
│ user_prefs│              │ lib/server/connections.ts          │
└───────────┘              │   decrypt cookie array             │
                           │      ↓                             │
                           │ lib/server/s3.ts: getS3Client(ctx) │
                           │      ↓                             │
                           │ AWS SDK (upload = lib-storage      │
                           │ streaming; zip = fflate stream)    │
                           └────────────────────────────────────┘
```

- **No authentication** — anyone uses the tool with their own credentials.
- **Encryption** — Web Crypto AES-256-GCM. Every visitor gets a **unique
  random 256-bit key** (`s3-key` httpOnly cookie), auto-provisioned on the
  first write (add/edit connection) — never a shared secret. `ENCRYPTION_KEY`
  is **legacy/migration-only**: used to decrypt data created before
  per-visitor keys, and re-encrypted under the visitor's key on next write.
  Dev fallback key only in `vite dev`.
- **Security headers** — `src/hooks.server.ts` sets CSP
  (`frame-ancestors 'none'`), X-Frame-Options, nosniff, Referrer-Policy,
  Permissions-Policy on every response.
- **Server modules** — every exported function takes `ServerContext` first; no
  ambient request state. Key resolution is split read/write:
  `resolveEncryptionKey` (read; env fallback allowed) vs `resolveWriteKey`
  (write; provisions/memoizes the per-visitor key on the request ctx).
- **Mutations** — client calls JSON endpoints then `invalidateAll()`;
  connection add/edit/delete are SvelteKit form actions with `use:enhance`.
- **Preferences** — `user_prefs` written client-side (document.cookie), read
  server-side in loads.

## Coding Patterns

### Server operations

```ts
// src/lib/server/s3.ts
export async function listObjects(ctx: ServerContext, connectionId, bucket, ...) {
  const client = await getS3Client(ctx, connectionId); // decrypts cookie → S3Client
  ...
}
```

Exposed to the client through `routes/api/s3/[op]/+server.ts` (allowlist) and
called via `callS3(op, payload)` from `$lib/api`. Add a new op by adding the
server function and one `case` in the dispatcher.

### Dates over JSON

`S3ObjectInfo.lastModified` is `Date | string` — server actions serialize to ISO
strings; components parse with `new Date(...)`.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENCRYPTION_KEY` | No | **Legacy only** — decrypts connections created before per-visitor keys; migrated to the visitor's key on next write |

## Security Model

| Control | Implementation |
|---------|----------------|
| Per-visitor key isolation | random 256-bit key cookie (`__Host-s3-key` in prod), provisioned on first write (`resolveWriteKey`) |
| Clickjacking | CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY` (`src/hooks.server.ts`) |
| Presigned-URL leakage | `Referrer-Policy: strict-origin-when-cross-origin` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| CSRF on JSON endpoints | `assertSameOrigin` — Origin/Referer host must match request host (`/api/*`) |
| Subdomain cookie forgery | `__Host-` cookie prefixes in prod (plain names in dev: `__Host-` requires Secure) |
| Error leakage | generic client-facing messages; SDK/internal detail logged server-side only (`AppError` = safe message) |

## Workers constraints (paid plan)

- 1000 subrequests/request → ZIP selection capped at 800 files
- 100 MB request body → upload cap enforced in `/api/s3/upload`
- 128 MB memory → uploads stream via lib-storage, ZIP streams via fflate
- 30 s CPU default (300 s configured) → store-mode ZIP entries

## Key Decisions

- **No DB, no auth**: server breach leaks zero stored credentials.
- **HTTP-only cookies**: credentials inaccessible to JavaScript.
- **Single cookie array**: all connections in one encrypted cookie.
- **fflate over archiver**: Workers-safe streaming ZIP.
- **Explicit ServerContext threading**: stable SvelteKit API, no experimental
  ambient request context.
