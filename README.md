# S3 Web Client (SvelteKit + Cloudflare Workers)

Stateless S3/R2 browser — the SvelteKit port of the original Next.js app, built for
Cloudflare Workers (paid plan). No auth, no database — credentials are AES-256-GCM
encrypted and stored in an HTTP-only cookie.

## Stack

SvelteKit 2 (Svelte 5 runes) · TypeScript · Tailwind CSS 4 · Bun · AWS S3 SDK
(client-s3, s3-request-presigner, lib-storage) · fflate · Zod · adapter-cloudflare

## Run

```bash
bun install
bun run dev        # vite dev (platform.env available via getPlatformProxy)
bun run build      # wrangler types --check && vite build
bun run preview    # wrangler dev on the built worker (real workerd runtime)
bun run check      # svelte-check
```

## Deploy

```bash
bun run build
bunx wrangler deploy
bunx wrangler secret put ENCRYPTION_KEY   # optional server-side key fallback
```

## Structure

```
src/
  lib/
    api.ts                 # typed client helpers (callS3, uploadToS3, callKeyApi)
    encryption.ts          # AES-256-GCM encrypt/decrypt (Web Crypto)
    prefs.ts               # getUserPrefs(cookies) — user_prefs cookie
    types.ts               # TS types + zod schemas
    utils.ts               # cn(), getPublicObjectUrl()
    server/
      context.ts           # getServerContext(event) → { cookies, envKey }
      connections.ts       # cookie-backed connection CRUD (s3-connections cookie)
      keys.ts              # encryption key management (s3-key cookie)
      s3.ts                # S3 client factory + all S3 operations
  routes/
    +page.svelte           # landing (prerendered)
    (info)/privacy|terms   # static pages (prerendered)
    (dashboard)/           # app shell: sidebar + topbar
      dashboard/           # connections grid
        connections/new    # ?/add form action
        connections/[connectionId]           # bucket grid, ?/delete action
          edit/            # ?/default form action
          buckets/[bucketName]/              # FileExplorer
        settings/          # prefs + encryption key management
    api/
      s3/[op]/+server.ts   # POST JSON dispatcher (allowlist of S3 operations)
      s3/upload/+server.ts # FormData → streaming multipart upload
      download-zip/+server.ts  # GET, fflate streaming ZIP
      keys/[op]/+server.ts # encryption key management
  lib/components/
    ui/                    # Button, Card family, Input, Label (Svelte)
    s3/                    # FileExplorer, dialogs, upload, preview, etc.
```

## Architecture

- **No authentication** — anyone can use the tool with their own credentials.
- **Credentials** — encrypted with AES-256-GCM (Web Crypto). Key lives in the
  HTTP-only `s3-key` cookie, falling back to the `ENCRYPTION_KEY` Workers secret.
- **Multi-connection** — encrypted JSON array in the `s3-connections` cookie
  (HTTP-only, 30 days). 4 KB cookie size applies.
- **Server modules** — plain modules under `src/lib/server/`; every function takes
  a `ServerContext` (`{ cookies, envKey }`) built from the request event via
  `getServerContext(event)`.
- **Client calls** — UI components `fetch()` JSON endpoints instead of server
  actions; mutations are followed by `invalidateAll()`.
- **Preferences** — view mode and page size in the plain `user_prefs` cookie,
  written client-side (Settings) and read server-side (loads).

## Workers-specific behavior

| Concern | Behavior |
|---|---|
| Uploads | Streamed via `@aws-sdk/lib-storage` (multipart, constant memory). 100 MB request cap (Cloudflare edge limit) enforced with a clear error. |
| ZIP downloads | `fflate` store-mode streaming (near-zero CPU); **max 800 files per zip** (paid Workers cap of 1000 subrequests/invocation, minus listing calls); 10 GB guard. |
| CPU | `limits.cpu_ms: 300000` in wrangler.jsonc (paid plan). |
| Node APIs | `nodejs_compat` flag; Web Crypto/btoa used wherever possible. |
| env | `event.platform.env.ENCRYPTION_KEY` (secret); dev fallback key only in `vite dev`. |

## Key decisions

- **No DB, no auth** — a server breach leaks zero stored credentials.
- **HTTP-only cookies** — credentials inaccessible to JavaScript.
- **fflate over archiver** — Workers-safe streaming ZIP without Node streams.
- **JSON op dispatcher** — one allowlisted endpoint mirrors the original server
  actions 1:1, keeping the imperative client logic intact.
