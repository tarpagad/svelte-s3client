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

### ISSUE-001 — ZIP listing still expands up to 800 folders without a prefix budget
- Severity: low
- Status: open
- Area: `src/routes/api/download-zip/+server.ts`

`MAX_FILES_PER_ZIP` (800) caps entries, but `expandKeys` keeps listing until it
has 800 items or exhausts pagination — a pathological bucket could still burn
many listing subrequests before the cap trips. The bulk-delete paths are
bounded (`MAX_BULK_DELETE_OBJECTS`); this one is only bounded by the 800-file
result cap. Candidate fix: stop expanding once `items.length >= 800`.

### ISSUE-003 — `wrangler types --check` cannot run in CI (entrypoint absent in fresh clone)
- Severity: medium
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
