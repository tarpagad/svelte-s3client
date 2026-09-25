# 0006 — Activity (stars/recents) in localStorage, not cookies

- **Status**: Accepted
- **Date**: 2026-09-25
- **Area**: `src/lib/activity.ts`, explorer toolbar/star UI

## Context

Drive-parity work added favorites (stars) and a recents list. The
project's other client state lives in cookies (`user_prefs`,
`s3-connections`, `s3-key`) because server-side loads read them — but
stars and recents are **never read on the server**: only the explorer
uses them, purely to drive UI. Cookies are capped at ~4 KB per cookie,
which fits at most dozens of keys; a recents list alone would eat most
of that budget, and cookie contents are sent on every request.

## Decision

Store activity in `localStorage` under one key (`s3-client-activity`):

- **Caps**: 100 stars, 50 recents, LRU-trimmed; one bucket scope per
  entry (`connectionId`, `bucket`, `key` — no credentials, no object
  data).
- **SSR-safe**: all reads/writes are guarded no-ops outside the browser
  (the store is only touched from event handlers and effects).
- **Best-effort persistence**: quota/privacy-mode failures are swallowed;
  activity degrades to empty rather than breaking the UI.

## Consequences

- Activity is per-browser and disposable: clearing site data wipes stars
  and recents — acceptable because they are navigation conveniences, not
  user data (ADR-0001's "no stored state" posture holds; nothing
  sensitive is stored either way).
- The server never sees activity, so it adds zero requests and zero
  cookie weight.
- If a future feature needs stars server-side (e.g. cross-device sync),
  this decision must be revisited — that would require a persistence
  mechanism the architecture currently avoids.
