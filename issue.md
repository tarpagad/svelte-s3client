# Issues

Open problems, bugs, and risks. Format per issue:

```
## <ID> — <title>
- Severity: high | medium | low
- Status: open | investigating
- Area: <file or subsystem>
```

Rules:

- New issues go at the bottom of Open with the next sequential ID. IDs keep
  incrementing even though resolved issues are deleted — their analysis and
  fix commit live in git history, so a deleted ID must never be reused.
- An agent that hits an unexpected behaviour mid-task should record it here first, then continue or flag.
- Resolved issues are deleted from this file in the same commit as the fix.

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

<!-- Template:
### ISSUE-00X — <title>
- Severity:
- Status:
- Area:
<what happens, expected vs actual, reproduction hint>
-->
