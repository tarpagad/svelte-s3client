# 0004 — Generic client-facing errors; AppError as the safe-message channel

- **Status**: Accepted
- **Date**: 2026-09-23 (implemented in `fcb6eb3`; recorded retroactively)
- **Area**: `src/lib/server/s3.ts`, `src/routes/api/s3/[op]/+server.ts`, `src/lib/server/keys.ts`

## Context

Most S3 operations returned `error.message` straight from the AWS SDK to the
client. Those messages routinely contain internal detail — configured endpoint
URLs, bucket names, region-redirect hints, SDK stack context — which is
exactly the information a probe should not get for free. The security audit
flagged this as an information-disclosure gap.

But some errors are *written for the end user*: "Folder name cannot be empty",
"Connection not found", the bulk-delete cap message, all key-lifecycle errors.
Blanket-replacing everything with "Something went wrong" would make the UI
unusable.

## Decision

Two channels, enforced by convention:

- **`AppError`** (exported from `src/lib/server/s3.ts`): a message *written*
  for the client. It passes through to the response untouched.
- **Anything else** (SDK errors, unexpected throws): logged server-side with
  full detail (`console.error`), replaced by a generic fixed message in the
  response (`clientMessage(error, fallback)`).

Usage rules:

- Operations returning `{ error }` use `clientMessage(error, "<op-specific
  fallback>")` in their catch.
- Operations that throw (listBuckets/listObjects/searchObjects) re-throw
  `AppError` as-is and wrap everything else in their generic fallback.
- The API dispatcher catch sends `AppError.message` verbatim; anything else
  gets "The request could not be completed. Check the connection settings and
  try again.".
- Validation messages thrown *before* any external call (createFolder) are
  `AppError` because they are authored copy, not internal detail.

## Consequences

- **Positive**: no endpoint/bucket/SDK detail leaks in error responses; users
  still get actionable messages where they exist; server logs keep the full
  picture for debugging.
- **Negative**: every new operation must remember the convention — a plain
  `error.message` return silently reintroduces the leak. Reviewers and agents
  must check catches when adding ops.
- **Guardrails for agents**: when adding a server operation or a dispatcher
  `case`, classify every `throw`/`return { error }` — user-authored copy
  becomes `AppError`, everything else goes through `clientMessage`. Never log
  credentials or return SDK error detail to the client.
