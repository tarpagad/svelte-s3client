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
