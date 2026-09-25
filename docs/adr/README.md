# Architecture Decision Records

ADRs capture *why* the codebase is shaped the way it is. An agent (or human)
changing architecture-level behaviour should check here first; a decision that
contradicts an ADR must either update the ADR or be reconsidered.

## Conventions

- **Format**: lightweight Michael Nygard style — Status / Context / Decision /
  Consequences. One file per decision, numbered `NNNN`.
- **Filename**: `NNNN-kebab-case-title.md` (e.g. `0001-no-auth-no-database.md`).
- **Statuses**: `Proposed` → `Accepted` → `Superseded by NNNN` / `Deprecated`.
  Superseded ADRs stay in place — they are history, not garbage.
- **When to write one**: the decision is expensive to reverse, closes an
  alternative, or a future agent would otherwise ask "why is it like this?".
  Styling, naming, and per-feature choices do **not** get ADRs.
- **Where decisions live instead**: patterns and structure go in the root
  `AGENTS.md`; open problems go in `issue.md`; work items in `todo.md`.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-no-auth-no-database.md) | No authentication, no database | Accepted |
| [0002](0002-per-visitor-encryption-keys.md) | Per-visitor encryption keys instead of a shared server secret | Accepted |
| [0003](0003-same-site-strict-and-write-only-provisioning.md) | SameSite=strict cookies; provision keys only on same-origin writes | Accepted |
| [0004](0004-generic-client-errors.md) | Generic client-facing errors; AppError as the safe-message channel | Accepted |
| [0005](0005-trash-prefix-soft-delete.md) | Trash as a hidden self-describing prefix (soft delete) | Accepted |
| [0006](0006-activity-in-localstorage.md) | Activity (stars/recents) in localStorage, not cookies | Accepted |
