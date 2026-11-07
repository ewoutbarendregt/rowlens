# ADR-0021: Unified accounts, club admission and full platform administration

- **Status**: accepted (Ewout: "ja uitvoeren", 2026-11-07)
- **Date**: 2026-11-07
- **Decider**: Ewout (product owner)
- **Related**: ADR-0005, ADR-0011, ADR-0013, ADR-0014, ADR-0019, ADR-0020

## Context

The separate roster identity permits people without accounts and is referenced by lineups, feedback,
sharing and angle measurements. Ewout requires only users with roles, real accounts first, account
requests, club-admin admission and membership of multiple clubs. RowLens admins manage clubs and
have access to everything. WVIJburg is the first club. Club logos and interface design come later.

The present global account/tenant membership structure is reusable, but authentication/session
resolution is coupled to the pilot club. Platform authority does not yet exist. The detailed
impact analysis is `docs/plans/unified-users-impact.md`.

## Decision

- One global verified account/profile/preferences set per person; additive rower/coach/club-admin
  roles belong to individual clubs. A separate global platform grant identifies RowLens admins;
  club administrators cannot confer platform authority.
- Account creation/request and email OTP verification are independent of club admission. A verified
  user without memberships may access their own profile and application status, not club content.
  Existing users apply to more clubs through the same account. Club administrators decide admission
  and assign club roles; approval and membership creation are atomic and audited.
- RowLens admins manage clubs, appoint initial club administrators and have full read/write access
  to all selected-club content, including private feedback, plus global administration. No ordinary
  membership is needed for authorized platform access. Keep actual administrator attribution;
  impersonation is unnecessary. This expands ADR-0019's club-only administration scope.
- All content access still uses server-validated `TenantContext` and tenant RLS. Elevation is verified
  against protected persisted platform authority, never a client role or forgeable transaction flag.
  Each operation has one selected club. Narrow protected operations handle global club/account
  administration; ordinary users retain cross-club denial and ADR-0020 training rights.
- Use explicit club request context/URLs so two tabs can work in different clubs safely. Role lookup,
  application approval and revocation are current-club scoped; global preferences remain account
  scoped. Switching cannot transfer drafts, late responses or upload operations into another club.
- Preserve the existing pilot club's identity/history when mapping it to WVIJburg. Inventory before
  renaming or changing URLs; do not assume its current production name/slug or create a duplicate.
- Replace roster references only after verified account mappings are resolved. No name-only dummy
  accounts, synthetic email, name-based automatic merge or history deletion. Keep historical data
  through an expand/backfill/switch/contract transition and prove rollback compatibility.
- Later branding uses validated per-club assets and theme tokens/presets, preserving accessibility,
  dark/high-contrast preferences and Classical fallback. Do not implement logo uploads or arbitrary
  custom code as part of this first change.

## Consequences

New protected platform-authority and tenant-application storage, auth/session transition, admission
APIs/UI, club management and switching precede complete roster retirement. New tenant tables require
club IDs, RLS, restrictive authorization where relevant and two-club tests. Existing sessions,
historical recipients, role changes and media side effects require migration/rollback coverage.

Account requests supersede ADR-0011's no-self-signup product restriction once implemented. RowLens
full-content access is an explicit exception to ordinary private-feedback visibility; privacy docs
and audit behavior must reflect it. Club-admin access stays within the selected club. Existing
shared-server restrictions, irreversible-action approvals and per-deploy authorization remain.

Implementation approval covers migrations 0020–0022, independent protected account sessions/codes,
platform grants/audit, tenant membership applications and canonical account references. A temporary
account-backed compatibility projection preserves old IDs until all legacy identities are mapped;
contract removal is deliberately deferred. All 7 production roster identities were unlinked in the
read-only aggregate preflight (10 lineup seats, 1 assignment, 0 shares, 1 historical event, 8 angle
measures). No identity is inferred by name or silently admitted. Local feature flags keep the old
image behavior available; old sessions are accepted by the unified guard without granting platform
rights. The platform grant bootstrap is operator-only and audited, never inferred from allowlists.
This records the approved architecture, not a completed security review or deployment authorization.

## Alternatives considered

- Only remove the menu: leaves duplicate identities and cannot satisfy account requests/multi-club.
- Name-only placeholder accounts: conflicts with the confirmed account-first requirement.
- A fourth role in club membership: lets club authority be confused with global platform authority.
- Unscoped database-owner access for RowLens admins: violates tenant-context/RLS requirements.
- Full branding editor in this change: deferred explicitly; prepare the design boundary only.


## Upgrade and revocation details

Migration 0022 protects membership/access writes with restrictive RLS. Active old session proofs are
adopted into independent account sessions; adoption locks the old row and cannot revive a revoked
account token. Old logout updates revoke its adopted proof too. New logout-others keeps the current
proof and revokes other account/legacy sessions. Old images cannot resolve newly minted account-only
tokens, so a rollback may require signing in again; old session format remains supported by the new
image. Platform content contexts retain effective API roles but install no trusted role snapshot in
SQL: the protected persisted grant is rechecked at statement time, including after withdrawal.
