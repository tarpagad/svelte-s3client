# 0001 — No authentication, no database

- **Status**: Accepted
- **Date**: 2026-09-23 (initial commit `eb4af42`; recorded retroactively)
- **Area**: whole application

## Context

The tool lets visitors browse and manage their own S3/R2 buckets. The obvious
SaaS shape — accounts, a database of stored connections, shared infrastructure
— would make the operator custodian of every visitor's credentials. Any server
breach would leak a honeypot of access keys, and the operator would carry the
compliance burden of storing third-party secrets.

## Decision

There is **no authentication and no database**. All state lives in the
visitor's own browser as HTTP-only cookies:

- `__Host-s3-connections` (prod name) — the connection list, outer layer
  AES-256-GCM encrypted.
- `__Host-s3-key` (prod name) — the visitor's encryption key.
- `user_prefs` — non-sensitive UI preferences, client-side only.

The server is a stateless pass-through: every S3 operation resolves
credentials from the visitor's own cookie at request time
(`getDecryptedConnection`), uses them, and forgets them.

## Consequences

- **Positive**: a server breach leaks zero stored credentials (there are none);
  no account recovery, GDPR, or tenant-isolation surface; the Worker can be
  redeployed or destroyed without data-loss concerns.
- **Negative**: no cross-device sync; clearing cookies loses saved
  connections; per-visitor state cannot be audited or recovered by the
  operator; feature ideas that need shared state (history, sharing) are out of
  scope by construction.
- **Guardrails for agents**: never introduce server-side persistence of
  credentials or connection metadata; never add an auth layer that would make
  the server a credential custodian. If a feature seems to require either,
  stop and write a superseding ADR first.
