# ADR-0005: Tenancy and authorization enforced in the data-access layer

- **Status**: proposed
- **Date**: 2026-11-01

## Context

Clubs are tenants. Cross-club access must be impossible and provably so. A user may later belong to
several clubs. Visibility inside a club is crew-based: a rower sees sessions of crews they row in, a coach
sees sessions of crews they coach. Roles must extend later (club admin, guest coach, guardian).

## Decision

**Model**
- `user` is global (e-mail, display name, locale). `membership(user, club, role)`; `crew_member(crew,
  user, crew_role ∈ {rower, coach})`. Every tenant-owned table has a non-null `club_id`.
- Club context comes from the URL (`/projects/rowlens/c/:clubSlug/…`), resolved server-side to a membership.
  No membership → 404 (not 403), so club existence doesn't leak.

**Two layers of enforcement**
1. **Application layer (primary)**: all data access goes through repositories that take a `TenantContext
   {userId, clubId, roles}`; there is no exported way to get a raw DB handle in route code (lint rule +
   review). Authorization is a pure, unit-tested policy module (`can(ctx, action, resource)`).
2. **PostgreSQL Row-Level Security (defence in depth)**: the app connects as `rowlens_app` (no `BYPASSRLS`,
   not table owner). Each request runs in a transaction that does
   `SET LOCAL app.user_id = …; SET LOCAL app.club_id = …`. Policies on every tenant table require
   `club_id = current_setting('app.club_id')::uuid`; session/video/message tables additionally require crew
   visibility via a `SECURITY DEFINER` helper `rowlens_can_see_session(session_id)`.
   Migrations run as the owner role `rowlens_owner`.

**Proof (tests that must stay green)**
- A "two clubs" integration fixture; for every repository function and every API route, a test asserts
  club B data is invisible/unmodifiable from club A, and crew-scoped data is invisible to non-members.
- A schema test fails if any table with a `club_id` column lacks `relrowsecurity = true` and a policy.
- A route inventory test fails if a new route has no authorization declaration.

**Audit log**: append-only `audit_event(actor, club, action, target, at, metadata)` for deletions,
permission/role changes, invitations, data exports, account deletion.

## Consequences

- Slight per-request overhead (transaction + `SET LOCAL`) — negligible at this scale.
- The worker also uses `rowlens_app` and sets the club context from the job payload.
- Adding roles = adding enum values + policy rules; the policy module is the single place to change.

## Alternatives considered

- Schema- or database-per-tenant: strong isolation, painful migrations at "thousands of clubs". Rejected.
- App-layer checks only: one forgotten `WHERE` leaks data. Rejected as sole mechanism.
