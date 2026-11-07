# Explicit registration with optional club application

Status: proposed, awaiting Ewout's architectural approval (2026-11-07).
Branch: `codex/feat/registration-onboarding`, based on the deployment-log branch for PR #158.
Production remains `sha-dd71f78`; this plan does not authorize a further deployment.

## Observed problem

`LoginGate` combines login and account creation. Entering an email only sends an OTP; a verified
account is created when the code is accepted. No club application is created by either step.
`HomePage` then redirects an account without a club to Clubs, but `RequireAuth` hides that page
behind mandatory name entry. Club choice therefore occurs late and is not part of registration.

`rowlens_manage_applications()` returns pending membership applications only. Accounts that never
applied, including registrations without a club, cannot appear there. Read-only production totals
at investigation: 6 accounts, all verified and with a membership, 0 pending club applications.
These totals establish no completed additional registration; no personal mailbox record or OTP was
read, and no production write was performed.

## Proposed user flow

1. The entry screen has distinct **Sign in** and **Create account** actions, localised in NL/EN.
2. Create account presents email plus a required explicit choice: an active existing club, or
   **No club for now**. Only club IDs/names are public; no users, membership counts or settings.
3. Send a code and confirm email ownership. Explain clearly that submitting an email is not yet
   a completed registration. Invalid/expired/unconfirmed codes create no visible application or
   account access. Preserve existing OTP limits, generic responses and session safeguards.
4. Successful verification atomically records the registration and, if selected, creates the
   pending club application. No membership or club role is granted before approval. Choosing no
   club creates an account with zero memberships; it needs no separate platform approval.
5. Show the result immediately, before asking for a name: selected club and Pending approval,
   or Account created without a club. Club selection and application status remain accessible
   without mandatory profile completion. Name entry remains required for sporting contributions.
6. Existing accounts keep their identity, roles, profile and club memberships. Retrying registration
   does not duplicate an account, registration or pending club request. They can request additional
   clubs through their verified account. Sign in itself creates no new registration/application.

## Administrator views

- Club administrators see and approve/reject only applications to their selected active club,
  including applicants who are not yet members. Other-club and clubless registrations stay hidden.
- RowLens administrators see all verified registrations and club applications across clubs,
  including explicit No club registrations, independent of the currently selected club.
- Show email, registration time, optional club and a clear type/status. Distinguish completed
  clubless registration from a pending club decision; do not offer a club-approval button without
  a club. Link approved/rejected requests to their current status rather than losing the record.
- Preserve the existing Users directory for all verified accounts. Club approval uses the existing
  tenant-scoped, audited membership decision and creates membership atomically. No global role is
  implied by registration or by selecting a club.
- Existing accounts remain visible under Users. Do not fabricate historical registration events
  or applications for them. A verified existing user can explicitly submit a club request.
- "Goes to the club administrator" means appearing in that club's requests overview. New email
  notification delivery is outside this change.

## Required implementation and architectural change

An additive migration is needed: the current schema records only login proofs and club applications,
not an explicit registration without a club or an OTP-bound registration choice.

- Extend protected account OTP state with registration purpose and optional requested club,
  bound to the current proof. A resent/replaced code cannot reuse stale intent; verification does
  not trust a changed club ID supplied by the browser. Separate login from explicit registration.
- Add protected global authentication registration storage keyed to the real account ID, with
  timestamp and optional requested-club reference. Keep email in the account, not a duplicate
  registration copy; identity changes retain the account link. No fake club or membership for
  clubless registrations. Reuse `membership_application` for actual club decisions.
- This registration record is global authentication state, like account proofs, not a tenant
  content table. Deny direct app-role access; use narrow fixed-search-path protected operations.
  Club-owned applications continue to carry club_id and existing RLS/role policies. Any new
  tenant-owned storage must have club_id, RLS and cross-club tests.
- Verify proof, resolve the real account, record registration and submit the optional club request
  in one transaction. Preserve identity/mailbox/admission lock ordering, revoke/replay safeguards,
  existing invitation handling and last-admin/role protections. Recheck active club at verification;
  if archived meanwhile, report the unavailable choice and allow an explicit new selection.
- Public club list uses a minimal protected projection, with no account or tenant data disclosure.
  Bound and rate-limit unauthenticated endpoints. Global/club request projections recheck persisted
  authority before returning rows. Use existing base-path helpers and localised strings/mail.
- Preserve historical data, existing accounts/sessions and zero/multiple-club membership. Feature-off
  authentication remains compatible. No shared-server configuration or external dependency needed.

## Verification and completion

- Database/API: registration with/without club; no creation before proof; invalid/expired/replayed/
  replaced codes; concurrent resend/verification; duplicate submissions; existing account identity;
  failed/archived club choice; no automatic membership; approve/reject and current status.
- Authorization: account without membership sees its result/club choices; club A cannot see B or
  clubless registrations; RowLens administrator sees all from any selected club and without one;
  direct app-role access denied; ordinary user cannot list or decide other applications.
- Real browser tests at laptop 1000x540 and iPhone 13 WebKit: registration, optional club choice,
  code confirmation, result before profile, global/club review and admission. Measure overflow and
  tap targets; local synthetic accounts/mail only. No real email or mail code in source/artifacts.
- Run required repository checks, log results and expose the change on the local stack for Ewout.
  Open a PR with a security review note. Merge/deploy require a new explicit user instruction.
