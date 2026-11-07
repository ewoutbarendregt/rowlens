# ADR-0022: Reversible club archiving and separate administration screens

- **Status**: accepted (Ewout: "Ja, archiveren en kunnen herstellen", 2026-11-07)
- **Date**: 2026-11-07
- **Decider**: Ewout
- **Related**: ADR-0005, ADR-0019, ADR-0021

## Context

Club administrators need all current-club members, role assignment and pending membership decisions
under Club administration. RowLens administrators need a complete club directory with creation,
editing and removal under Clubs. Removing tenant rows would erase sporting history and shared
membership references. Ewout explicitly approved archiving with restoration and its migration.

## Decision

- Club administration owns the Club members, Requests and Roles tabs. Pending requests and explicit
  historical account linking move here from Clubs. Existing additive role editing, self/last-admin
  safeguards and protected account settings remain. In unified mode, the member list is based on
  actual membership, excluding unapplied allowlist addresses and grants without membership.
- Clubs retains ordinary account club selection/applications. RowLens administrators instead see
  the complete global directory including archived clubs, create/edit controls and inline confirmed
  Archive/Restore actions. These operations require persisted global authority and are audited.
- Migration 0023 adds nullable club.archived_at. Archived clubs disappear from active membership and
  application directories. Both API club selection and shared tenant RLS policies refuse their
  content, including access by RowLens administrators. Only platform-level lifecycle/settings
  management remains available. The protected club-admin helper also refuses archived contexts.
- Archiving keeps accounts, memberships, pending requests, media and historical references. Restore
  re-enables the same club ID/slug and existing memberships; it does not create duplicate identities.
  Existing background jobs may finish; archiving is not deletion of media or cancellation of an
  already open response. New content requests and membership applications are refused.
- Club URLs/slugs stay immutable when renaming, as in ADR-0021. Branding remains a later change.

## Consequences

No permanent deletion or production change is part of this implementation. The additive nullable
column and active-club policies remain compatible with the previous web image; a prior image cannot
restore an archived club, so operators retain the new version for lifecycle administration. Tests
cover multi-club isolation, retained history, protected functions/direct RLS and real UI lifecycle
flows at laptop and iPhone WebKit sizes. Local review remains the next step; merge/deploy require
explicit requests.
