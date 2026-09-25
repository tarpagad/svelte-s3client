# 0005 — Trash as a hidden self-describing prefix (soft delete)

- **Status**: Accepted
- **Date**: 2026-09-25
- **Area**: `src/lib/server/s3.ts`, `src/lib/trash-path.ts`, trash route, delete dialogs

## Context

Google-Drive-parity work required recoverable deletion: an Undo affordance
right after deleting, a Trash view with Restore / Delete forever, and a
30-day retention window. The project has no database and no authentication
(ADR-0001), so any trash implementation had to derive all state from the
bucket itself. A cron-based purge looked attractive until it became clear a
scheduled Worker invocation has **no request** — and therefore no cookies —
so it cannot decrypt the visitor's connections at all.

## Decision

Deletion **moves** objects to `.s3client-trash/<UTC-stamp>/<originalKey>`:

- **Self-describing paths.** The original location and deletion time are
  encoded in the key itself (`src/lib/trash-path.ts` round-trips them), so
  restore needs no metadata, tags, or database — and works on any
  S3-compatible endpoint.
- **One stamp per batch.** All objects of one delete operation share a
  stamp, so the Trash view groups them as one row ("Deleted <time>").
- **Lazy purge.** Opening the Trash view calls `purgeTrash`, which lists
  stamp folders and batch-deletes any older than 30 days. Retention is
  enforced at read time instead of by schedule.
- **Root hiding.** `listObjects`/`searchObjects` filter the exact root
  prefix `.s3client-trash/` so the namespace never appears as a user folder.
- **Cost model.** Trash/restore are copy-based (`CopyObject` is per-object),
  so requests are capped at 400 objects and the client pages; "Delete
  forever" reuses the batched `DeleteObjects` path (1000/request).

## Consequences

- Deletes become non-destructive by default; the confirm dialogs and toasts
  now promise 30-day recoverability instead of permanence.
- A user folder literally named `.s3client-trash/` at the bucket root is
  adopted as the trash namespace (and hidden). This is documented and
  accepted; the name is deliberately unlikely.
- Trash counts against storage until purged — users see "Empty trash" for
  immediate reclaim.
- A partial failure (copy succeeded, source delete failed) leaves a
  duplicate; restore overwrites the original key, which is the safe
  direction.
