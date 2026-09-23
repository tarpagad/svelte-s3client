# 0002 — Per-visitor encryption keys instead of a shared server secret

- **Status**: Accepted
- **Date**: 2026-09-23 (implemented in `1a8d508`–`fcb6eb3`; recorded retroactively)
- **Area**: `src/lib/encryption.ts`, `src/lib/server/connections.ts`, `src/lib/server/keys.ts`

## Context

Connection credentials in the cookie must be encrypted at rest. Two key
management models were possible:

1. **Shared server secret** (`ENCRYPTION_KEY` env var for everyone): simple,
   but every visitor's data is encrypted under the same key, so one leaked key
   decrypts every visitor's cookie, and anyone with read access to the env
   secret (logs, crash dumps, a misconfigured binding) becomes a global
   decryptor.
2. **Per-visitor key**: each visitor gets a random 256-bit key, stored only in
   their own HTTP-only cookie. The server holds no key material at rest.

The original implementation used the shared secret; the security audit flagged
it as the highest-severity finding.

## Decision

**Every visitor gets a unique random 256-bit key** (`generateEncryptionKey()`),
auto-provisioned on their first write (`resolveWriteKey`), stored in the
`__Host-s3-key` cookie (plain `s3-key` in dev — see ADR-0003 for the prefix
rationale). Both the outer connections cookie and the inner credential blobs
are encrypted under it.

`ENCRYPTION_KEY` survives **only as a legacy read fallback**: data written
before per-visitor keys existed can still be decrypted; on the visitor's next
write, `writeConnections` migrates it under the visitor's key. Reads resolve
the key in order: override → key cookie → legacy env key → dev-only default →
throw. Writes **never** use the env key.

Key lifecycle is data-safe (`keys.ts`):

- **Set** with data present = full rotation (data is migrated, never stranded).
- **Remove** refuses while connections exist that only the cookie key can
  decrypt.
- **Change** is atomic — every inner blob is decrypted before anything is
  written; a single failure aborts with no modification.

Passphrase policy (`validateEncryptionKey`, shared client/server): minimum 16
characters and at least 3 of 4 character classes.

## Consequences

- **Positive**: compromise of any server-side secret affects nobody's stored
  data; visitors own their keys; rotation and migration are well-defined.
- **Negative**: losing the key cookie (and having no legacy env data) means
  deleting and re-entering connections — accepted, because credentials are
  re-enterable by nature; the operator cannot recover anything for a visitor,
  ever.
- **Guardrails for agents**: never widen the write path to accept the env key;
  never write a "set key without migrating data" code path; any new
  credential-bearing cookie must use `secretCookieOptions` and the
  read-old/write-new helpers in `context.ts`.
