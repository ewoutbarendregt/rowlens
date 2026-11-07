# ADR-0023: Scoped user directory, identity changes and global role management

- **Status**: accepted (Ewout: "Ja, voer het volledige plan uit", 2026-11-07)
- **Date**: 2026-11-07
- **Decider**: Ewout
- **Related**: ADR-0005, ADR-0011, ADR-0019, ADR-0021, ADR-0022

## Context

Users must be a filterable/sortable table with an account editor for names, email, roles and
preferences. RowLens administrators see all verified accounts including zero memberships; club
administrators see only their selected club's members and requests. The previous global settings
picker and membership cards were insufficient. The approved concrete plan is
`docs/plans/user-directory-and-account-editor.md`.

## Decision

Use an allowlisted shared directory schema with 17 fields, typed filters, stable UUID tie-breaking
and bounded pages. A pinned protected SQL projection establishes authorization before the server
filters, sorts, counts and pages. Club choices derive from that authorized projection. Club actors
never receive other-club memberships, activity, requests or hidden preference rows. Unknown values
remain explicit. The UI has selectable columns, sort controls, an internally scrolling table and
an editor. Global role and club roles are distinct. Account IDs/system timestamps remain read-only.

Reuse existing profile/preference revision checks and tenant-scoped membership operations, naming
one club per role/admission action. Preserve immutable configured grants and self/last-club-admin
checks; extend expected-role conflicts to membership-only admission updates. Each section reports
its own result. Remount the directory when account/club/authority scope changes, and ignore late
list responses. A proof page never shows another account's cached identity data.

Migration 0024 adds protected global `account_email_change` proofs and narrow definer functions.
Its nullable `scope_club_id` records the initiator's authorization scope; it is global authentication
state, not a tenant-owned content table. The app role has no direct table privileges. Hash codes
with the existing secret pepper and request UUID; expire after ten minutes and refuse after five
incorrect attempts. Request/confirmation have additional per-actor/IP limits. No email/code values
are stored in the audit. The existing SMTP transport gets distinct NL/EN verification templates.

A new address is inactive until confirmed. Require an existing verified account, current revision,
unique normalized email and no unrelated grant/historical-email collision. Never merge accounts.
Lock identity changes per target, old/new mailboxes in order, all affected club-admission locks in
UUID order, then the account. OTP verification, legacy-session adoption, provisioning, request
approval and initial club-admin assignment join this order. Bind editor admission to account ID,
not just its potentially changed/recycled email, and compare expected membership state.
Recheck the requester's actual authority, proof, expiry, attempts, revision and reserved addresses.
Confirmation preserves account ID, memberships and history, synchronizes email-keyed grants without
changing roles, and revokes old account/legacy sessions and login codes atomically.

**Club-initiated changes require confirmation by the target's existing authenticated account**, in
addition to the new-mailbox code. Knowing the new code must not let a club administrator take over
another club's administrator or a RowLens administrator. The mailed link opens a dedicated owner
confirmation page. RowLens administrators, with explicit global identity authority, can also confirm
their own initiated operation through the editor. A withdrawn initiator or archived originating club
invalidates confirmation. Server-configured source/destination addresses stay immutable: a separate
operator-approved environment change would be needed to avoid leaving the old allowlist privileged.

Global role changes are a dedicated persisted-platform-only operation. Serialize them with the
operator bootstrap, recheck authority after waiting, compare expected state and protect self/last
administrator removal. Reject null authority/proof parameters in SQL as well as invalid HTTP input.
Audit actor/target UUIDs. Club administrators can inspect a member's global role but cannot grant it.
This supersedes ADR-0019's immutable-email UI and ADR-0021's operator-only routine global assignment;
operator bootstrap remains the first-admin/recovery path. No arbitrary owner access reaches routes.

## Consequences

One additive migration, no new dependency. Old images ignore the new global authentication state;
existing content tables/history and old APIs remain compatible. All new UI/routes remain behind the
paired unified-user flags. Local review is the default; this decision authorizes no production
changes, real invitations, merge or deployment. Tests cover every filter/sort field, actor scope,
zero/multiple clubs, authority races, reserved/duplicate email, proof failures, null SQL arguments,
owner confirmation, session revocation and laptop/iPhone WebKit workflows.
