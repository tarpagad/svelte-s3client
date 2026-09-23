# Issues

Open problems, bugs, and risks. Format per issue:

```
## <ID> — <title>
- Severity: high | medium | low
- Status: open | investigating | fixed (see <commit>)
- Area: <file or subsystem>
```

Rules:

- New issues go at the bottom of Open with the next sequential ID.
- An agent that hits an unexpected behaviour mid-task should record it here first, then continue or flag.
- Fixed issues move to the Resolved section with their commit hash — keep them as a paper trail.

## Open

### ISSUE-006 — CSP blocked Vite 8's blob: SharedWorker (dev HMR reconnect dead)
- Severity: medium (dev-only; no prod impact)
- Status: fixed (live browser verification)
- Area: `src/hooks.server.ts`, `src/lib/security-headers.ts` (extracted)

The strict CSP (`script-src 'self' 'unsafe-inline'`, no `worker-src`) predates
Vite 8.3's dev client, which runs its server-reconnect ping
(`waitForSuccessfulPing`) in a **SharedWorker built from a `blob:` URL**.
Worker scripts have no `worker-src` fallback target containing `blob:`
(falls back to `script-src`), so the browser blocked the worker —
asynchronously, so `new SharedWorker()` did not throw and Vite's ping promise
never settled. Symptom: after a dev-server restart, a stuck tab could never
reconnect, and any page interaction (e.g. browsing R2 buckets) silently did
nothing. Trigger: `bun install` for the vitest work re-resolved `^8.0.16` →
Vite 8.3.0 in `bun.lock`. Fix: emit `worker-src 'self' blob:` **only in dev**
(`buildSecurityHeaders(dev)` extracted to a unit-tested module); prod CSP is
unchanged and static `_headers` mirrors it, with the divergence documented.

### ISSUE-004 — Legacy-cookie migration stranded the visitor key (data loss)
- Severity: high
- Status: fixed (smoke suite)
- Area: `src/lib/server/connections.ts` (`writeConnections`)

When a visitor carried a pre-`__Host-` legacy `s3-key` cookie, `resolveWriteKey`
reused its **value** for data continuity — but `writeConnections` then
unconditionally cleared the legacy cookies, and the "persist key under primary
name" branch was gated on `key !== existingKeyCookie`, which was false. Result:
the key existed under **no** cookie name → every future read threw → the data
was permanently undecryptable. Surfaced by the new smoke suite; earlier manual
prod verification was invalid because a malformed jar file never actually sent
the legacy cookies (two printf lines concatenated into one). Fix: persist the
key under the primary name whenever `!primaryKeyCookie` (value re-used from the
legacy name) OR the key differs from any cookie (first write ever).

### ISSUE-005 — `__Host-` cookie deletion rejected by browsers (no Secure attr)
- Severity: high
- Status: fixed (smoke suite)
- Area: `src/lib/server/keys.ts` (`removeEncryptionKey`), plus stale-connections cleanup

`cookies.delete(name, { path: "/" })` serializes `Set-Cookie: name=;
Max-Age=0; ... SameSite=Lax` — **without `Secure`**. The `__Host-` prefix rules
apply to *every* Set-Cookie including deletions, so browsers (and modern curl)
reject these headers: key removal and legacy-cookie clearing silently never
took effect. Second latent bug in the same handler: a stale
`__Host-s3-connections` cookie with no readable key survived `keys/remove`,
resurfacing as undecryptable junk on every request. Fix: delete the `__Host-`
names with `secretCookieOptions(0)` (emits `Secure; SameSite=Strict` on the
Max-Age=0 header), and clear both connections-cookie names in the same pass.

### ISSUE-001 — ZIP listing still expands up to 800 folders without a prefix budget
- Severity: low
- Status: open
- Area: `src/routes/api/download-zip/+server.ts`

`MAX_FILES_PER_ZIP` (800) caps entries, but `expandKeys` keeps listing until it
has 800 items or exhausts pagination — a pathological bucket could still burn
many listing subrequests before the cap trips. The bulk-delete paths are
bounded (`MAX_BULK_DELETE_OBJECTS`); this one is only bounded by the 800-file
result cap. Candidate fix: stop expanding once `items.length >= 800`.

### ISSUE-003 — `wrangler types --check` cannot run in CI (entrypoint absent in fresh clone)- Severity: medium
- Status: fixed
- Area: `package.json` (build/check scripts), `worker-configuration.d.ts`

`wrangler types --check` hashes the Env types including `GlobalProps.mainModule`,
which wrangler only emits when the `main` entrypoint file exists. That file is
`.svelte-kit/cloudflare/_worker.js`, produced by `vite build` — so in a fresh
clone (Cloudflare Workers Builds) the check ran before the file existed, produced
a different hash, and failed every deploy. Local runs always passed because
`.svelte-kit/` existed. Fix: removed `wrangler types --check` from `build` and
`check`; types regen stays manual (`bun run gen`) after `wrangler.jsonc` changes.
Unresolved follow-up: if someone wants the check restored, it must run *after*
`vite build` (e.g. a post-build step), not before.

### ISSUE-002 — `user_prefs` cookie is not integrity-protected
- Severity: low
- Status: open
- Area: `src/lib/prefs.ts`, `src/routes/(dashboard)/dashboard/settings/+page.svelte`

`user_prefs` is written client-side via `document.cookie` (by design, no
round-trip). Values are validated with Zod on read, so tampering is bounded to
"malformed prefs are discarded", but a visitor (or XSS, if one ever existed)
can set arbitrary valid pref values for themselves — no integrity issue beyond
self-affecting state. Acceptable for a credential-isolating tool; recorded so
the decision is explicit.

## Resolved

### ISSUE-000 — Weak passphrase policy stranded or corrupted key-lifecycle data
- Severity: high
- Status: fixed (see `51161e3`)
- Area: `src/lib/server/keys.ts`, `src/lib/utils.ts`

Original key lifecycle had three data-safety bugs: setting a new key stranded
existing data under the old one, removing the key silently orphaned
connections, and key change kept undecryptable blobs (corrupting the cookie).
All replaced by: shared 16-char/3-class passphrase policy, set-as-rotation,
remove-refusal while data exists, atomic per-connection abort on change.

<!-- Template:
### ISSUE-00X — <title>
- Severity:
- Status:
- Area:
<what happens, expected vs actual, reproduction hint>
-->
