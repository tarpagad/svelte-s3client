# S3 Web Client (SvelteKit + Cloudflare Workers)

A stateless web browser for S3-compatible object storage, deployed as a single
Cloudflare Worker. There is no account system and no database: your credentials
are encrypted with AES-256-GCM and stored in HTTP-only cookies, so every
visitor's connections live only in their own browser.

## Features

**Connections**
- Manage multiple named connections side by side — AWS S3, Cloudflare R2, or
  any S3-compatible service (MinIO, Wasabi, …) via a custom endpoint
- Credentials encrypted at rest in a single HTTP-only cookie; nothing is ever
  written to a server-side store
- R2 connections sign with region `auto` automatically; other endpoints use
  their configured region

**Buckets & objects**
- Bucket grid per connection with folder navigation and breadcrumbs
- Search within a bucket, object counts, and server-driven pagination
- Create folders, rename objects, bulk delete (with a dry-run object count
  before anything is removed)
- Toggle public access and copy the public URL for an object
- In-browser preview modal for images, PDFs, and text/code files

**Transfer**
- Drag-and-drop upload zone with streaming multipart upload (constant memory)
- Single-file downloads via presigned URLs (1 hour expiry)
- Streaming ZIP download of any selection — up to 800 files / 10 GB per archive

**App**
- Light/dark theme, list/grid view mode, and page-size preferences
- Encryption key management in Settings: set, rotate, or remove the key with
  automatic data re-encryption
- Landing, privacy, and terms pages (statically prerendered)

## Tech stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit 2 (Svelte 5 runes) + TypeScript |
| Styling | Tailwind CSS 4 |
| Runtime | Cloudflare Workers (`adapter-cloudflare`, paid plan) |
| Storage API | AWS SDK v3 (`client-s3`, `s3-request-presigner`, `lib-storage`) |
| ZIP | `fflate` (Workers-safe streaming) |
| Validation | `Zod` |
| Package manager / tests | Bun · Vitest |

## Getting started

```bash
bun install
bun run dev        # vite dev (platform env proxied via getPlatformProxy)
bun run build      # svelte-check && vite build
bun run preview    # run the built worker under wrangler (real workerd runtime)
bun run check      # svelte-check only
bun run test       # vitest run (unit + integration smoke suite)
```

## Deploy

```bash
bun run build
bunx wrangler deploy
bunx wrangler secret put ENCRYPTION_KEY   # optional legacy-key fallback
```

## How it works

- **No auth, no DB** — a server breach leaks zero stored credentials.
- **Encryption** — Web Crypto AES-256-GCM. Every visitor gets a unique random
  256-bit key cookie (`__Host-s3-key` in production), provisioned on first
  write. `ENCRYPTION_KEY` is a legacy fallback used only to decrypt data
  created before per-visitor keys existed.
- **Connections cookie** — all connections fit in one encrypted HTTP-only
  cookie (`s3-connections`, 4 KB limit, 30-day expiry).
- **Server modules** — every function under `src/lib/server/` takes an
  explicit `ServerContext` (`{ cookies, envKey }`) built from the request via
  `getServerContext(event)`; no ambient request state.
- **Mutations** — S3 reads/writes go through one allowlisted JSON dispatcher
  (`POST /api/s3/[op]`) called from the client, followed by `invalidateAll()`;
  connection CRUD uses SvelteKit form actions with progressive enhancement.
- **Preferences** — view mode and page size in a plain `user_prefs` cookie,
  written client-side and read server-side during loads.

### Security model

| Control | Implementation |
|---|---|
| Per-visitor key isolation | Random 256-bit key cookie (`__Host-` prefix in production), provisioned on first write |
| Clickjacking | CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Presigned-URL leakage | `Referrer-Policy: strict-origin-when-cross-origin` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| CSRF on JSON endpoints | Origin/Referer host must match the request host |
| Error leakage | Generic client-facing messages; SDK details logged server-side only |

## Cloudflare Workers constraints

| Concern | Handling |
|---|---|
| Uploads | Streamed via `@aws-sdk/lib-storage` (multipart, constant memory); 100 MB request cap enforced with a clear error |
| ZIP downloads | `fflate` store-mode streaming; max 800 files per archive (1000 subrequests/invocation cap, minus listing calls); 10 GB guard |
| CPU | `limits.cpu_ms: 300000` (paid plan) |
| Node APIs | `nodejs_compat` flag; Web Crypto used wherever possible |

## Project structure

```
src/
  lib/
    api.ts                 # client helpers (callS3, uploadToS3, callKeyApi)
    encryption.ts          # AES-256-GCM encrypt/decrypt (Web Crypto)
    prefs.ts               # getUserPrefs(cookies) — user_prefs cookie
    types.ts               # TS types + zod schemas
    utils.ts               # cn(), getPublicObjectUrl()
    server/
      context.ts           # getServerContext(event) → { cookies, envKey }
      connections.ts       # cookie-backed connection CRUD
      keys.ts              # encryption key management
      s3.ts                # S3 client factory + all S3 operations
    components/
      ui/                  # Button, Card, Input, Label
      s3/                  # FileExplorer, object actions, dialogs, upload, preview
  routes/
    +page.svelte           # landing (prerendered)
    (info)/                # privacy, terms (prerendered)
    (dashboard)/           # app shell (sidebar, topbar, theme toggle)
      dashboard/           # connections grid, bucket grid, file explorer, settings
    api/
      s3/[op]/             # POST JSON dispatcher (allowlist of S3 operations)
      s3/upload/           # FormData → streaming multipart upload
      download-zip/        # fflate streaming ZIP (GET)
      keys/[op]/           # encryption key management
```

## Documentation

- [`docs/adr/`](docs/adr/) — architecture decision records (index in
  `docs/adr/README.md`); read before changing architecture
- [`issue.md`](issue.md) — open bugs and risks (ISSUE-NNN) with resolved history
- [`todo.md`](todo.md) — working backlog (Now / Next / Later / Done)
