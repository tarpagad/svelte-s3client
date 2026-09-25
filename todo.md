# TODO

Working backlog for agent-driven development. Rules:

- One `in progress` item at a time; move finished items to Done with the commit hash.
- An item that needs a design trade-off first gets an ADR (see `docs/adr/README.md`).
- Bug-shaped items move to `issue.md` while being worked, then back here as Done.
- Keep this file current in the same commit as the work it describes.

## Now

Nothing in progress. Clean checkpoint.

## Next

- [ ] **Deploy ISSUE-004/ISSUE-005/ISSUE-007/ISSUE-008 fixes** — all are local-only; push to ship them, then re-run `./scripts/smoke.sh` against prod URL once green (ISSUE-008 also fixes existing live R2 connections with no cookie migration).

## Later

- [ ] **Integration smoke suite** — scripted curl flow against `bun run preview`: connection add → list → key rotation → delete, asserting on cookie names, Origin gates, and error shapes (formalizes the manual phase-verification matrices).
- [ ] **Key-change UI affordance for legacy data** — surface "migrated to your key" feedback after first write when legacy migration path ran (`writeConnections` migration branch).
- [ ] **Observability** — structured server-side logging for S3 op failures (currently `console.error`); consider Workers Logpush or Tail Consumers.
- [ ] **Rate limiting / abuse controls** — the tool is auth-less by design (ADR-0001); evaluate Cloudflare WAF rate rules on `/api/*` rather than in-worker counting.
- [ ] **Upload UX** — progress reporting for the streaming multipart upload (`lib-storage` emits progress events server-side; needs an SSE or chunked channel).

## Done

- [x] Live R2 listing failure: `getS3Client` signed with the stored `us-east-1` (pre-`8302629` default) instead of R2's required `auto` → SignatureDoesNotMatch on every call; R2 connections now always sign `auto` (see ISSUE-008).
- [x] Dev cookie collision: `writeConnections` deleted the key cookie it had just set (legacy names == primary names in dev), orphaning `s3-connections` — every later add logged two `Cipher job failed` errors and dropped existing connections; migration also probed the just-added blob with the legacy key (spurious error) (see ISSUE-007).
- [x] Security audit → 6-phase remediation plan (2026-09-23)
- [x] Phase 1 — security headers, per-visitor key foundation (`1a8d508`)
- [x] Phase 2 — passphrase strength policy, safe key lifecycle (set/remove/change) (`51161e3`)
- [x] Phase 3 — strict Origin checks on all JSON endpoints (`192d396`)
- [x] Phase 4 — zip-slip sanitisation for download-zip entries (`89025c6`)
- [x] Phase 5 — bounded folder expansion, ACL skip on custom endpoints, generic client errors (`fcb6eb3`)
- [x] Phase 6 — `__Host-` cookie prefixes with read-old/write-new migration (`fcb6eb3`)
- [x] Agentic workflow scaffolding: `todo.md`, `issue.md`, `docs/adr/`
- [x] Deploy failure: `wrangler types --check` fails in CI because `.svelte-kit/cloudflare/_worker.js` (the entrypoint the hash covers) doesn't exist in a fresh clone — removed `types --check` from `build`/`check` (wrangler stays pinned at `4.136.3`) (see ISSUE-003).
- [x] Typecheck gate for deploys — `build` now runs `bun run check && vite build`, so svelte-check failures block Cloudflare deploys (`cdec3db`).
- [x] Unit tests for crypto/cookie core — `vitest` (`bun run test`, 19 tests): `encryption.ts` round-trip/tamper/truncation, `validateEncryptionKey` class matrix, `sanitizeZipPath` adversarial inputs (extracted to `src/lib/zip-path.ts` so tests don't import the S3 SDK) (`b55d9ff`).
- [x] Production `__Host-` verification against the production deployment (URL omitted from the public repo) — 10-point matrix: headers, no env-key leak, `__Host-s3-key`/`__Host-s3-connections` attributes over HTTPS, legacy-jar migration on first write (legacy names cleared), dashboard decrypt round-trip, Origin 403, remove-key guard refusal.
- [x] Integration smoke suite — `scripts/smoke.sh` (40 assertions, exit-code driven): headers, Origin matrix, key lifecycle incl. weak-key rejection, form-action add with legacy-jar migration, dashboard decrypt round-trip, dispatcher error shapes, rotation, delete + remove-guard. Found and fixed ISSUE-004/ISSUE-005.
- [x] CSP fix for Vite 8 dev client — emit `worker-src 'self' blob:` in dev only (headers extracted to unit-tested `src/lib/security-headers.ts`); unblocks Vite's blob: SharedWorker reconnect ping that broke dev HMR after bun.lock resolved Vite 8.3.0 (see ISSUE-006).
