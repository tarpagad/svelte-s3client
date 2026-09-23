# TODO

Working backlog for agent-driven development. Rules:

- One `in progress` item at a time; move finished items to Done with the commit hash.
- An item that needs a design trade-off first gets an ADR (see `docs/adr/README.md`).
- Bug-shaped items move to `issue.md` while being worked, then back here as Done.
- Keep this file current in the same commit as the work it describes.

## Now

Nothing in progress. Clean checkpoint.

## Next

- [ ] **CI pipeline** — GitHub Actions: `bun install`, `bun run check`, `bun run build` on every push/PR. No tests exist yet, so CI is typecheck + build only until the test task below lands.
- [ ] **Unit tests for crypto/cookie core** — `vitest` over `src/lib/encryption.ts` (round-trip, tamper detection, key format), `validateEncryptionKey` class matrix, and `sanitizeZipPath` adversarial inputs (currently verified by hand-rolled scripts only).
- [ ] **Production `__Host-` verification** — after first deploy: confirm `__Host-s3-key` / `__Host-s3-connections` set correctly over HTTPS, legacy cookies migrate on first write, and no dev fallback key leaks (`ENCRYPTION_KEY` unset in prod).

## Later

- [ ] **Integration smoke suite** — scripted curl flow against `bun run preview`: connection add → list → key rotation → delete, asserting on cookie names, Origin gates, and error shapes (formalizes the manual phase-verification matrices).
- [ ] **Key-change UI affordance for legacy data** — surface "migrated to your key" feedback after first write when legacy migration path ran (`writeConnections` migration branch).
- [ ] **Observability** — structured server-side logging for S3 op failures (currently `console.error`); consider Workers Logpush or Tail Consumers.
- [ ] **Rate limiting / abuse controls** — the tool is auth-less by design (ADR-0001); evaluate Cloudflare WAF rate rules on `/api/*` rather than in-worker counting.
- [ ] **Upload UX** — progress reporting for the streaming multipart upload (`lib-storage` emits progress events server-side; needs an SSE or chunked channel).

## Done

- [x] Security audit → 6-phase remediation plan (2026-09-23)
- [x] Phase 1 — security headers, per-visitor key foundation (`1a8d508`)
- [x] Phase 2 — passphrase strength policy, safe key lifecycle (set/remove/change) (`51161e3`)
- [x] Phase 3 — strict Origin checks on all JSON endpoints (`192d396`)
- [x] Phase 4 — zip-slip sanitisation for download-zip entries (`89025c6`)
- [x] Phase 5 — bounded folder expansion, ACL skip on custom endpoints, generic client errors (`fcb6eb3`)
- [x] Phase 6 — `__Host-` cookie prefixes with read-old/write-new migration (`fcb6eb3`)
- [x] Agentic workflow scaffolding: `todo.md`, `issue.md`, `docs/adr/`
