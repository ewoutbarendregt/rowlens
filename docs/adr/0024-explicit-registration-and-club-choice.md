# ADR-0024: Explicit verified registration and optional club choice

- **Status**: accepted (Ewout: "Ja, voer het volledige plan uit", 2026-11-07)
- **Date**: 2026-11-07
- **Decider**: Ewout
- **Related**: ADR-0011, ADR-0021, ADR-0022, ADR-0023

## Context

Production feedback showed that the combined email/login form did not submit a club application.
Club selection required completing a name first, and clubless registrations were not represented
in the requests overview. Ewout approved `docs/plans/registration-onboarding.md`: a distinct signup
form, explicit club/no-club choice, email confirmation and global versus club-scoped review.

## Decision

In unified mode, sign in accepts existing verified accounts only. Explicit registration collects
email and an active club ID or an explicit no-club choice. The public club projection returns only
IDs/names, behind an IP rate limit. Login and registration share existing email/IP OTP limits.
Both return generic accepted responses without exposing account existence. Invalid/unavailable
club choices may be refused because the club directory is intentionally public.

Migration 0025 binds the registration challenge UUID and optional club to protected account OTP
state. Its HMAC includes purpose, email and challenge ID. Verification accepts the stored choice,
never a browser replacement club ID. Resending replaces the challenge; login/registration proofs
cannot be exchanged. Preserve expiry, five wrong attempts, single-use verification, identity and
mailbox locking, and acquire club admission locks before club/application writes. Recheck the
club under a shared row lock at verification. An archived club produces a recoverable error
without consuming the proof or partially creating an account.

After proof, one database transaction verifies/creates the real account, inserts its idempotent
registration record, optionally submits a tenant club application and creates the account session.
The private application helper preserves pending decisions, existing memberships and the rejected
application cooldown. It cannot be called by the app role; authenticated account and verified
registration wrappers invoke it as the owner. No name is needed to submit a request. Names remain
required by the UI before sporting pages; account club/status/profile navigation stays available.
Existing configured invitations continue to be honored only after proof of email ownership.

`account_registration` is global authentication state, keyed to account ID with initial requested
club and time; it contains no copied email. Like account proofs/sessions, it has no direct app-role
privileges. Fixed-search-path definer functions expose only the caller's own record or records
visible to persisted platform authority. This is not tenant content: no fake tenant is created
for a clubless signup. Actual club requests remain in `membership_application`, retaining club_id,
RLS and protected approval. Email changes preserve the registration's account link.

Global Requests shows all current club request statuses, including archived-club records, and
explicit account registrations without a club. A registration whose initial club already has an
application is represented by that application, avoiding duplicate rows. If an existing member
registers with that club and needs no application, show the registration without approval actions.
Club administrators receive only their active selected club's applications, never global or other
club registrations. Only live pending club requests offer admit/reject; existing approval remains
tenant-scoped and audited. No extra platform approval is needed for a clubless verified account.

## Consequences

New users can understand signup and club admission as distinct states; administrators can see
clubless signup and retain decided requests. Existing accounts keep their IDs, profile, authority,
history and memberships. Retrying signup is idempotent; existing applications are not reset.
Do not fabricate past registration records for existing accounts. Additional applications after
registration use the same account/tenant admission route, including before name completion.

Feature-off authentication stays unchanged. Additive storage survives rollback; older unified
images cannot start a new explicit registration but existing accounts/session proofs remain usable.
No production configuration, shared component, external processor or dependency is changed. New
mail notifications to administrators are outside this decision: routing means scoped in-app queues.
A future deploy still needs Ewout's explicit request.

## Alternatives considered

- Only move club choice after login: still no explicit signup or clubless registration record.
- Create applications before email proof: allows arbitrary addresses to enter administrator queues.
- Browser-only remembered club intent: can be changed independently of the issued proof.
- Invent a club for clubless users: violates zero-membership accounts and tenant isolation.
- Infer historical signups from all existing accounts: fabricates events never explicitly submitted.
