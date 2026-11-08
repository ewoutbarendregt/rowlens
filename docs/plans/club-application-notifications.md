# Initial admission, notification decision links and multi-club training overview

Status: approved by Ewout ("Ja, voer het aangepaste volledige plan uit", 2026-11-08).
Implemented locally with migration 0026 and ADR-0025; final checks/PR are being recorded.
No production deployment or actual administrator email has been performed.

## Product flow

1. A new user verifies email and initially chooses at most **one** existing active club (or the
   existing no-club option). Enforce the one-club intent server-side; reject extra/array choices.
   Email proof creates the verified account; club membership still requires admission.
2. For the initial verified club application only, notify every current verified administrator
   member of that club. Send individual NL/EN messages through existing SMTP, with club name,
   notice and separate **Accept application** / **Reject application** links. No email before proof.
   Platform administrators retain the global overview; do not implicitly subscribe them to every
   club's mail unless they hold that club's administrator membership.
3. After club rejection the user may explicitly submit an application **without a club**, routed
   to RowLens administrators. Do not silently convert the rejection into such a request. The
   RowLens administrators explicitly accept/reject this request and each receives an individual
   localized notification with both decision links. Initial no-club registration also routes to
   this same platform review process. Approval does not create a club membership.
4. From Clubs, an existing user may request additional clubs using the same account, retaining
   approved memberships and roles. The owner explicitly limits this email decision procedure to
   new-user applications: additional-club requests remain in the relevant club's in-app queue and
   the platform administrator overview; do not apply initial-signup mail automation to them.
5. Trainings shows **all trainings the account is authorized to see across its clubs**, with a
   club filter (All clubs / one accessible club) and independent **Only trainings I participate in**
   filter. Default includes all authorized trainings. The participation filter refers to the
   account linked to a lineup/crew seat (including cox), not training creator or text/name matching.

Owner confirmed: clubless admission is an explicit platform-admin decision with notification mail
and accept/reject links. A pending/rejected clubless request does not revoke the verified account,
existing club memberships or profile/status access, and acceptance grants no club content rights.
The user can see their request's pending/accepted/rejected state. Platform administrators alone
can view the global decision queue and make audited decisions; club administrators cannot.

## Safe email decision links

Links identify the exact application and proposed decision, using shared base-path helpers. They
lead to an authenticated protected review screen; preserve the review destination through sign-in.
Show applicant details there and require inline confirmation. A GET never changes membership:
email-scanner/prefetch visits cannot admit or reject someone. Final POST reuses current club-scoped
permission checks, CSRF protection, active-club validation and pending-state decision transaction.
Forwarded links confer no authority. Decided/withdrawn/inaccessible applications show safe localized
states; repeat clicks never repeat a decision. Existing role-assignment defaults remain unchanged.
The message contains no OTP/session/bearer-admission credential, applicant personal data or other
recipient addresses. The approved Resend processor/SMTP sender is reused.

## Data and reliability impact

- Existing `rowlens_submit_application` serves both registration and later club requests. It cannot
  by itself determine new-user notification eligibility. Persist explicit initial-admission origin
  and lifecycle identity under protected writes; an existing account repeating public registration
  must not impersonate a new signup or duplicate administrator emails. Preserve decided applications,
  cooldowns and existing memberships. No retrospective emails/backfill of invented signup events.
- Add a durable tenant-owned notification outbox and migration. Store application/club/recipient IDs,
  delivery state, lease/retry metadata and safe failure states; avoid copied applicant
  names/emails/secrets. Unique keys deduplicate concurrent/repeated issuance for the same initial
  application and recipient. Enqueue atomically with the verified initial application transaction.
- A small web-process mail dispatcher sends only committed work with bounded retry/backoff, leases
  and graceful shutdown. Resolve recipient address/locale at delivery and recheck current verified
  club-admin membership, active club and pending initial application. An SMTP outage must not roll
  back the account/application. Persist acceptance/failure honestly: SMTP acceptance is not delivery.
  SMTP crash ambiguity means at-least-once delivery, not a promise of exactly-once receipt.
- Tenant tables get club_id, RLS, restrictive role policies and cross-club tests; repositories always
  use TenantContext/withTenant. Any initial claim capability is narrow/service-only, fixed-search-path
  and modeled on existing job claims. No general app-role global profile reads or application RLS
  bypass. Global no-club requests use protected global account state and narrow platform-authorized
  projections/decisions; never invent a fake club/null tenant row.
- Add protected global clubless-admission state (account ID, origin, pending/approved/rejected,
  timestamps and audited decision actor), plus global notification delivery storage.
  These are global authentication/admission records, not tenant content; follow existing protected
  account tables with no direct app-role reads/writes and narrow self/platform-authorized wrappers.
  Enqueue platform notifications atomically with a new valid clubless request, deduplicate pending
  repeats, recheck current persisted platform grants and pending state before send/decision, and
  use the same bounded dispatcher/lease discipline as tenant notifications. Preserve historical
  registrations without fabricating review requests or sending retrospective notifications.
  No global account lock or membership revocation follows from a rejected clubless application.

## Multi-club training access impact

The current `/api/sessions` path uses one selected tenant, and SessionsPage calls it once. Preserve
that route's selected-club behavior for existing consumers. Add an account-authorized aggregate list
repository/API for the overview, deriving current eligible clubs and roles from protected server
state. Query each permitted club under its own TenantContext/RLS and project only already-visible
training summaries. Platform administrators may include all active clubs via their persisted grant.
A filter's client club ID never grants visibility. Return explicit club ID/name/current capabilities
on each row; links/opening trainings carry the matching club context. Keep creation tied to an
explicit authorized club and existing write permissions. Account/club switches must not let stale
results or form data drift between clubs.

Extend list filters/URL state for club and own participation, preserving existing sorts/search.
Compute participation using linked user IDs through lineup records, not name/email similarity or
creator identity. Do not create mappings for unlinked legacy people. Empty/no-club/role-revocation
states fail closed. Private feedback and note counts retain existing per-club authorization; list
aggregation does not broaden content reads/writes or trigger media side effects. Add pagination/
bounded querying as needed so the overview does not become an unbounded cross-club data export.

## Implementation and verification scope after approval

- Focused ADR superseding the affected ADR-0021/0024 selected-club overview/mail exclusions; update
  schema/migration, repositories, initial request lifecycle, localized mail templates/dispatcher,
  protected decision page and login return handling, Clubs fallback UI, Users/global Requests and
  training overview/API/filters. No new dependency/processor, media-worker mail secret or production
  configuration required for the stated design. Include protected global admission and notification
  storage in the migration; test tenant/global isolation and current persisted platform authority.
- Tests: verified initial-only mail eligibility, one-club signup, no unverified/login/repeated signup/
  later-club notifications; multiple admins/languages; relevant club only; duplicate/concurrent/rolled
  back submission; retry/lease/shutdown; recipient permission/email changes; archived clubs; denied
  club followed by explicit no-club fallback; platform authority and forbidden cross-club/global reads.
- Email links: base path, sign-in return, authorized confirmations, unauthorized/forwarded/scanner GET,
  CSRF, withdrawn/decided application, concurrent clicks and stale authority. No automatic GET mutation.
- Training list: zero/one/multiple clubs, all-club and single-club filters, own participation including
  cox versus creator-only sessions, unrelated accessible trainings, unlinked legacy seats, platform
  authority, role/membership revocation, private notes, tenant-aware opening/creation and stale UI.
- Relevant unit/database/browser checks and required PR checks; measure iPhone WebKit and 1000x540
  review/list/filters/Clubs UI. Use local synthetic recipients/fake delivery; do not email real admins.
- No production merge/deploy/migration is authorized by this planning exchange. User acceptance and
  explicit deploy request are still required. Existing DNS incident BUG-056 remains separately tracked
  until fresh mailbox receipt is confirmed; do not treat notification implementation as its repair.
