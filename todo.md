# TODO

Working backlog for agent-driven development. Rules:

- One `in progress` item at a time; delete finished items when they complete — git history is the record.
- An item that needs a design trade-off first gets an ADR (see `docs/adr/README.md`).
- Bug-shaped items move to `issue.md` while being worked.
- Keep this file current in the same commit as the work it describes.

## Now

Nothing in progress. Clean checkpoint.

## Next

Nothing queued.

## Later

- [ ] **Key-change UI affordance for legacy data** — surface "migrated to your key" feedback after first write when legacy migration path ran (`writeConnections` migration branch).
- [ ] **Observability** — structured server-side logging for S3 op failures (currently `console.error`); consider Workers Logpush or Tail Consumers.
- [ ] **Rate limiting / abuse controls** — the tool is auth-less by design (ADR-0001); evaluate Cloudflare WAF rate rules on `/api/*` rather than in-worker counting.
- [ ] **Upload UX** — progress reporting for the streaming multipart upload (`lib-storage` emits progress events server-side; needs an SSE or chunked channel).
