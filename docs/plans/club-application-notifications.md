# Club application email notifications

Status: explored and specified; awaiting owner approval of architecture/migration under AGENTS.md.
No implementation, migration, production change or email delivery has been performed.

## Requested behavior

When a verified user submits a new pending club membership application, notify every current
verified administrator member of that club. Cover both first registration with a club choice and
an existing account applying to another club. Never send an administrator notification before
email verification. Clubless registration has no club recipient. Platform administrators receive
this notification only if they also hold administrator membership of the relevant club; their
existing global requests view remains unchanged.

Each recipient gets an individual operational email in their saved NL/EN language, through the
existing Resend SMTP sender. Minimal content: club name, a new application notice, and distinct
**Accept application** / **Reject application** links. Applicant details are available only after
opening the protected application page. No OTP, session cookie or reusable admission credential
is embedded in the email; recipients are not exposed to one another.

Both links target the exact application and select the proposed decision. The recipient signs
in if needed, with that review destination preserved. A small protected review screen shows the
applicant and requires explicit inline confirmation. GET requests never change membership;
link scanners/prefetching cannot approve or reject. Final decisions use the existing guarded,
CSRF-protected tenant admission/rejection operation, checking current authority, active club and
pending state. Forwarded links grant no authority. Already-decided, withdrawn, archived or
inaccessible applications yield a localized safe state rather than another mutation. Existing
role-assignment defaults are preserved. All URLs use the shared base-path helpers.

## Impact and proposed architecture

- Existing application creation is centralized in `rowlens_submit_application`, called during
  verified registration and authenticated club application. Its current boolean result prevents
  duplicate pending submissions but has no delivery event. Existing invitation SMTP sends do
  not offer durable retry for this requirement.
- Add a tenant-owned durable notification outbox and migration. Store application/club/recipient
  IDs and an application-generation identifier, delivery state, lease/retry metadata and safe
  error categories, not copied applicant names/emails or SMTP secrets. A unique key prevents
  repeated signup/login or concurrent attempts from enqueueing duplicate notifications.
- Enqueue within the same protected transaction that creates a pending application or legitimately
  reopens a cancelled/rejected one. A rolled-back submission creates no notification. A new
  pending generation may notify again; repeated submissions while already pending do not.
- Every new tenant table has club_id, RLS, restrictive role policies and cross-club tests. Data
  operations go through repositories with TenantContext/withTenant. Any initial dispatch/claim
  capability is narrow, service-only, fixed-search-path and modeled on existing job dispatch;
  no general app-role access to all profiles/memberships and no RLS bypass in application code.
- A small web-process mail dispatcher claims pending deliveries, resolves current recipient
  email/locale via a narrowly scoped repository, and sends only after commit. It rechecks current
  admin membership, verified address, active club and pending application before dispatch. Graceful
  shutdown, leases and bounded retry/backoff preserve queued work across restarts. It shares the
  configured SMTP transport; no new dependency, processor or media-worker credential is needed.
- SMTP acceptance is not mailbox delivery. Persist operational acceptance/failure states honestly;
  mail failure must never roll back the verified account or membership request. Retry transient
  failures, bound attempts and log safe identifiers/categories. This is at-least-once dispatch:
  an ambiguous SMTP response/crash can produce a duplicate; do not promise exactly-once delivery.
- Keep this behind existing unified-users feature gates. Supersede ADR-0024's explicitly excluded
  administrator mail scope with a focused new ADR. Update schema, migration, mail templates,
  repositories, lifecycle wiring, protected review UI, route/login return handling, tests and logs.
- Start with future submissions only. Do not bulk-notify historic applications or send production
  mail during implementation. Local fake delivery/synthetic accounts are the default. Production
  migration/deploy still requires a separate owner request.

## Acceptance checks

- Verified club signup and later club application enqueue all and only relevant club admins;
  multiple admins, recipient language, zero admins and zero-club signup covered.
- No notification for unverified/invalid proof, ordinary login, existing members, pending duplicate,
  rolled-back transaction or other clubs. Reopened application emits one new generation.
- Concurrency/deduplication, cross-club RLS, direct app-role denial, archived club, recipient role
  revocation/email change, lease expiry, retry, shutdown and terminal failure covered.
- Both email links resolve behind the production base path. Signed-out then signed-in return,
  authorized accept/reject confirmation, forwarded/unauthorized link, scanner GET, duplicate
  confirmation, decided/withdrawn application and CSRF rejection covered.
- NL/EN escaped text/HTML templates; no recipients, passwords, OTPs or addresses in logs/fixtures.
- Relevant unit/database/browser checks, required PR checks, and iPhone WebKit plus 1000x540 review
  screen checks. Actual production delivery remains unverified until separately approved testing.
