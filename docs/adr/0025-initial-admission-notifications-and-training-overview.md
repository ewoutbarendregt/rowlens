# ADR-0025: Initial admission notifications and multi-club training overview

- **Status**: accepted (Ewout: "Ja, voer het aangepaste volledige plan uit", 2026-11-08)
- **Date**: 2026-11-08
- **Deciders**: Ewout, Codex
- **Related**: ADR-0005, ADR-0011, ADR-0020, ADR-0021, ADR-0024

## Context

New-user club applications need notification emails with accept/reject links. A rejected initial
club applicant may explicitly request admission without a club; platform administrators must
review it. Users retain multiple memberships, and their training overview must cover all authorized
clubs with club and own-participation filters. Detailed approved scope is in
`docs/plans/club-application-notifications.md`.

## Decision

Migration 0026 marks future truly new signups with protected `account_registration.initial_signup`.
Verified initial club requests atomically enqueue one notification per current verified club admin.
Repeating signup or requesting an extra club through Clubs does not invoke the new-user mail
procedure. Historical accounts are not backfilled. The existing single optional club proof binding
is retained; no registration request can submit multiple clubs.

`clubless_application` is global protected admission state, accessed only through narrow self and
persisted-platform-authority functions. Initial clubless signup creates a pending request. A rejected
initial club applicant can explicitly submit one clubless request from Clubs. RowLens admins get
individual localized mail/decision links and make an audited, serialized pending-to-approved/rejected
transition. A clubless decision grants no club membership or content rights and never implicitly
locks the account or revokes other memberships. Existing profile/application access is preserved.

`club_application_notice` has club_id, RLS and a restrictive deny policy; direct app-role access is
revoked. `clubless_application_notice` is protected global notification state, without fake tenant
rows. Both contain IDs/delivery metadata, not copied applicant names/emails. Narrow service-only
claim/finish functions run through a fixed service TenantContext. Each claim commits before SMTP;
recipient address/locale and current club/platform authority, pending request and active club are
rechecked. Leases, unique recipient keys, bounded exponential retry and terminal states survive
restarts. Stop the dispatcher in preClose before the database pool closes. SMTP acceptance is not
mailbox delivery; crash ambiguity permits a duplicate. No exactly-once guarantee is made.

Each NL/EN email goes individually through the existing Resend SMTP sender. It contains minimal
context and two protected review URLs, not applicant details, OTPs or bearer admission authority.
Sign-in happens on that review route, preserving the target. GET is read-only; explicit inline
confirmation invokes CSRF-protected current-authority decisions. Forwarding or automated mail-link
scanning grants nothing. No new dependency/processor or production setting is added. Without local
SMTP, the development entry point prints protected review links instead of emailing real recipients;
app/test instances may inject fake delivery independently.

A new account-scoped training-summary API enumerates currently eligible clubs and runs the shared
list repository under each separate TenantContext/RLS. Summary rows identify their club and current
capabilities; opening/creating a training captures that club. Existing resource APIs stay scoped.
Cursor pagination preserves PostgreSQL microsecond precision, with date/timestamp/UUID tie-breaking.
The UI collects pages, filters by club and optionally by linked account participation, including
cox seat 0; creation or note assignment alone does not count. Never infer legacy identity from names.
Private feedback and all mutation permissions remain governed by ADR-0020. The name-completion gate
is retained after admission; account/status screens remain available without names.

## Consequences

This supersedes ADR-0024's excluded administrator-mail scope and no-approval clubless signup, and
ADR-0021's single-selected-club constraint for the overview only. Additive migrations preserve
existing accounts/history. Application/mail failure does not roll back a verified signup. Old
images remain usable for existing workflows but cannot process the new clubless reviews. No
retrospective mail is sent; zero-recipient cases remain visible in administrator queues. New-user
and later-club application flows remain deliberately distinct.

Cross-club/global denial, initial-only notification eligibility, concurrency, leases/retries,
role revocation, decision links/GET/CSRF and multi-club list context require regression coverage.
Production deployment and actual recipient delivery testing require a separate owner request.

## Alternatives considered

- Inline best-effort SMTP: loses notification intent after failures/restarts.
- Reusing the media worker queue: expands media-worker secrets and unrelated processing scope.
- Single-click GET approval/bearer links: unsafe with mail scanners and forwarded messages.
- Fabricated no-club tenant or cross-club SQL reads: violates account/tenant isolation.
- Treating the training creator as participant: excludes real crew and includes non-rowing creators.
