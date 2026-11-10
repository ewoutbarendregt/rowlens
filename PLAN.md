# PLAN

## Training video reuse deployed (2026-11-09)

PR #175 merged as 8a401c9 after green CI and is deployed as sha-8a401c9 via run 42640926073.
Readiness/DB are healthy with 28 migrations. Existing 4 trainings, 6 videos, 83 annotations and
21 media files/352,880,017 bytes are preserved; neighbouring services are unchanged and HTTP200.
Public low-laptop/iPhone WebKit checks pass. Deployment is complete; see docs/HANDOFF.md and
docs/runbooks/server-setup.md. Further releases require a new explicit request.

## Own trainings and reused-video annotation workspaces (2026-11-09)

Approved by Ewout ("Ja"). Implemented creator filtering, same-club ready-video reuse, independent
training feedback/analysis and read-only source annotation references with personal layer switches.
ADR-0026/migration 0028 preserve physical storage, old URLs, quota and deletion/worker isolation.
PR [#175](https://github.com/ewoutbarendregt/rowlens/pull/175) is merged and deployed; see TEST.md and
docs/plans/training-video-reuse.md. Original worktree's uncommitted club-editor/address and research
changes remain separate.


## Initial admission notifications and multi-club overview — local implementation (2026-11-08)

Approved scope implemented on `codex/feat/club-application-notifications` (ADR-0025, migration 0026,
27 migrations locally). New verified club signup queues individual NL/EN mail for current club
admins only; later club applications do not send these emails. Initial clubless signup and an
explicit clubless fallback after initial club rejection enter protected platform review, with
notifications/accept/reject links for RowLens admins. Decisions preserve account and unrelated
membership rights. Link GETs are read-only; sign-in preserves the review target and decisions need
inline confirmation/current authority/CSRF. Durable leases, deduplication and bounded retry survive
restarts; accepted means SMTP acceptance, not inbox delivery.

Training overview aggregates authorized clubs under separate TenantContext/RLS, with club and
actual-participation filters (cox seat 0 included), stable microsecond cursor pagination and explicit
club context when opening/creating. Existing profile completion and private feedback rules remain.
Local API readiness is healthy; dev UI: http://localhost:5174/projects/rowlens/. With SMTP absent,
the local entry point logs protected decision URLs as `development admission notification` in
/tmp/rowlens-unified-dev.log; synthetic injected delivery is used for tests.

Checks: **621** full web/DB, **38** focused, **34** browser (1000x540 Chromium and iPhone13 WebKit),
**50** worker and **77** deploy-script tests pass; typecheck/lint/build and formatting checked.
Browser screenshots inspected; checkbox uses the existing 44px touch label. The first browser run
found a bypassed name gate, duplicate email text and an unlabeled filter; fixed before final green
34/34. An introduced pagination precision error was fixed (BUG-057). Local function definition was
refreshed after the final platform-authority locking change; fresh test databases run the full
migration. No production merge/deploy, actual email or shared-server change performed.

## Revised initial admission and multi-club overview scope (2026-11-08)

Owner corrected the initial proposal: email/decision links apply to NEW-user applications only;
one initial club choice; explicit no-club fallback after rejection routes to platform admins;
additional-club applications remain available from Clubs. Trainings must aggregate all authorized
clubs, with club and own-participation filters. Current training list is single-tenant, so new
aggregation must use per-club TenantContext/RLS and context-aware links, preserving private notes
and write permissions. Revised design: docs/plans/club-application-notifications.md.
Owner confirmed explicit RowLens-admin accept/reject for clubless applications, with individual
notification mail and both authenticated decision links. Include protected global request and
notification storage, no fake club and no implicit account lock/membership revocation. Final
revised architecture/migration plan awaits approval; no implementation or production action.

## DNS repair verified — 2026-11-08

Ewout added the two TXT records himself and confirmed "toegevoegd". Both exact values now resolve
from all three authoritative servers (ns3/ns4.firstfind.nl, ns5.firstfind.net) and public resolvers
1.1.1.1/8.8.8.8: **10/10 checks pass**. Next: owner requests one fresh code through Account aanmaken;
inspect the resulting Resend delivery status and confirm actual receipt. Existing bounced codes
are not evidence of post-repair failure. No test message was sent by the agent; BUG-056 remains
in progress until receipt is confirmed. No application deployment/restart is required.

## Registration mail incident — BUG-056 (2026-11-08)

Registration route failure is confirmed, superseding the earlier login-only diagnosis. Read-only
checks: HTTP202 request, recent registration proof, below-limit counters; no SMTP error. Resend
records 3 registration bounces, Microsoft550 5.7.1 AS9031519. Authoritative/public DNS lacks send
SPF and DMARC, while DKIM is present. Exact proposed 2 TXT additions and acceptance checks:
docs/security/bug-056-registration-mail-auth.md. Owner approval/DNS access requested; no DNS,
server, account or mail change made. Receipt after repair is unverified; BUG-056 stays open.

## Completed production repair — 2026-11-07 20:17 UTC

Ewout explicitly approved the pinned kernel update and whole-server reboot. After an initial
unsuccessful authentication attempt, the retried native Terminal operation exited 0 and scheduled
the reboot. Fresh SSH confirms **6.8.0-149-generic**, a changed boot ID, all four packages at
**6.8.0-149.149**, retained 147 image/initrd and an empty dpkg audit. All **8** containers returned
on their same images; Docker/UFW are active. RowLens readiness is **sha-a47111c**, DB ok; all
aggregate counts and permission checks match the pre-reboot baseline, including **26 migrations**.
Five public HTTP checks pass: readiness, trustable.nl, API health, AudioScribe and signup club
listing (WVIJburg). No production signup/email was sent. BUG-054 is fixed for this host; BUG-055
and other maintenance findings remain open. No staging host was checked or modified.

## BUG-054 kernel fix — ready for exact host-change approval

The verified stable-channel kernel 6.8.0-149.149 contains the fix despite stale CVE-page status.
See docs/security/bug-054-kernel-remediation.md for the pinned four-package helper, exact commands,
old-kernel preservation, shared-server reboot impact, post-boot checks and recovery boundaries.
Ten safety tests, four real package hashes and read-only production simulation pass. No change
has been applied; AGENTS.md requires separate approval of this exact shared kernel/reboot action.

## Production security review — open maintenance findings 2026-11-07

Our registration release is deployed as sha-a47111c with 26 migrations. Ewout rejects unsolicited
external changes; bot PRs #72–79 are closed unmerged and auto-merge is off. Read-only review found
existing host/image issues independent of Dependabot, including Canonical's critical IPv4/TCP
kernel advisory BUG-054. Review the security report and prepare owner-approved mitigation/patch
plans; no shared firewall/kernel/Docker changes are authorized or applied. Do not accept bot patches
as an implicit part of future own releases. BUG-055 tracks the separate maintenance backlog.

## Explicit registration and optional club request — approved/implemented 2026-11-07

Ewout approved `docs/plans/registration-onboarding.md` with "Ja, voer het volledige plan uit".
ADR-0024/migration 0025 adds distinct registration, email-proof-bound optional club intent,
atomic registration/application and global versus club-scoped request review. Clubless accounts
need no platform admission; club access waits for the existing audited club approval. Local stack
has 26 migrations; 608 web/DB plus final focused 42/42 and 28 laptop/iPhone WebKit checks pass. Production now runs sha-a47111c with 26 migrations after the explicit merge/deploy request. Further
deployments require a fresh request. Deployment and security review are logged in the handoff.

## Unified users and multi-club membership — approved 2026-11-07

Ewout approved the expanded implementation with "ja uitvoeren": account requests, real verified
accounts first, additive club memberships/roles, club-admin admission and global RowLens-admin club
management/full access, including private feedback. First club is **WVIJburg**; logo/design selection
is a later change. This supersedes earlier no-account roster/name-claim goals and deferral of
multi-club work. See `docs/plans/unified-users-impact.md` and ADR-0021.

Implementation is on `codex/feat/unified-club-users`, based on main 799dfbe, behind paired
`UNIFIED_USERS=true` / `VITE_FEATURE_UNIFIED_USERS=true` flags. Existing history is retained in a
compatibility mapping while canonical account references backfill. All seven production roster
entries are unlinked (read-only aggregate inspection); administrators must explicitly map these to
verified accounts/admitted club members before a later contract migration removes old identifiers.
PR #157 is merged and deployed as sha-dd71f78 (2026-11-07), with 25 migrations and both unified-user flags enabled. The separately approved production bootstrap completed; further production actions require fresh authorization.

## Club administration follow-up — approved 2026-11-07

Members, additive club roles and membership decisions belong under Club administration. The RowLens
administrator sees all clubs under Clubs and can create, rename, archive and restore them. Ewout
approved the reversible archive model and migration 0023 with "Ja, archiveren en kunnen herstellen".
See ADR-0022. Accounts, other club memberships and historical references remain intact; permanent
deletion and club branding are outside this change.

## Users navigation — requested 2026-11-07

A separate Users page shows all accounts to RowLens administrators, including accounts with zero
memberships. Club administrators see only members of the selected club. Profile/preferences remain
global; club admission/roles remain scoped to one selected club. Existing storage supports zero or
more memberships, so this follow-up requires no migration. Requests stay under Club administration.

## Full user directory/editor — approved and implemented locally 2026-11-07

Ewout requests a table/list with field-level filtering/sorting and a complete account editor.
`docs/plans/user-directory-and-account-editor.md` makes the UI, tenant scope, verified email-change
flow and global-role management concrete. Ewout approved with "Ja, voer het volledige plan uit". Migration 0024 implements protected email
proofs, owner confirmation for club-initiated changes, global role controls and the scoped directory.
The local stack has 25 migrations. No production action is authorized; see ADR-0023 and TEST.md.

## What we're building

RowLens: a multi-tenant web platform where rowing clubs upload video of rowing sessions, play them back
in slow motion frame by frame, discuss them between rowers and coaches, and get traceable, AI-supported
analysis of rowing technique.

- **Users**: rowers and coaches. Start: ~30 users at one club (coastal rowing, CX4+). Goal: clubs
  onboarding themselves, thousands of users.
- **First release**: coaches upload; rowers find their sessions and watch them in slow motion.
- **Footage**: from a boat, from the bank, from a drone; ~2 min clips, up to 4K, up to 60 fps (more for slow-mo).
- **Languages**: NL + EN from day one. **Devices**: phone, tablet, laptop (responsive web/PWA).

## Goals

1. A player that feels instant and frame-accurate on phones (the core of the product).
2. One place per session for the crew's conversation, linked to exact moments in the video.
3. Analysis that is honest: every number traceable to frames and model versions; refuse when unsure.
4. Self-service growth: clubs onboard without us (M3).

## Approach

- Small, reviewable increments; trunk-based; tests as definition of done; ADRs for decisions.
- Prototype on production behind feature flags; isolated from the other apps on the server.

## Milestones

| Milestone | Scope |
|---|---|
| **M0 Foundation** | repo, CI/CD, base-path hello-world deploy, storage decision, auth |
| **M1 MVP** | clubs/crews, invitations, upload, transcoding, player, conversation, annotations, notifications, GDPR basics |
| **M2 Analysis** | pose, stroke phases, stroke rate, sync, traceability, explanations, eval suite |
| **M3 Growth** | club self-onboarding, comparisons, trends, more languages, own domain |

## Delivery order (updated 2026-11-05)

1. Finish and harden the complete product flow for the first club, **centred on the coach and the
   rower** (epic #102): one real account per person, club memberships/roles and per-session lineups; notes
   assigned to rowers, shown in the video and shared with a teammate or the crew; a rower's own
   sessions and notes; plus authentication, stroke marking, notifications, auditability, quota and
   real-device checks.
2. First make the existing editing tools dependable on laptops and iPhones: creating, selecting,
   moving and saving lines, angles and boat lines, including zoom, fullscreen and a low laptop
   window (~1000×540). Oar arcs and stern-camera work are deferred (Ewout, 2026-11-05).
3. Add automated analysis only where results stay traceable to source frames.
4. Updated 2026-11-07: account requests, club-admin admission and multiple club memberships are
   included in the unified-user change. Club-specific logos and interface design follow later.

## Club training visibility and editing by role (#154)

Approved and implemented locally: all members can view all trainings in their current club. Rower-only users keep
existing editing rights in their own (self-created) trainings; foreign trainings are fully read-only,
including no feedback mutations. Coaches/admins may edit every club training, including those
created by others; combinations retain those elevated rights. Keep private notes private to rowers
and preserve cross-club/account-administration boundaries. One permission-policy migration, no
new table/dependency. Ewout approved the revised plan with "voer het plan uit". See
docs/plans/154-club-training-readonly.md and ADR-0020. All local checks and the WebKit/low-laptop
matrix pass; implementation is ready in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155). No merge/deployment is authorized for #154.

## Admin user settings (#151, approved 2026-11-06)

Ewout requests inspection/editing of all existing user settings. The inventory includes profile,
multiple simultaneous roles/access and five currently device-local preferences. One central user
register/profile/settings set per person (Ewout's clarification); role combinations grant permissions.
Rower-only users see Trainings and their own settings, without Rowers navigation or standalone
roster access; rower+coach retains coach rights. See
[the accepted plan](docs/plans/151-admin-user-settings.md) and ADR-0019. Implemented locally: central account settings, additive role sets, tenant-scoped audit and protected admin/profile operations. Local/edge checks and the phone/laptop regression matrix pass; PR review is next. Production remains unchanged.

## Out of scope (for now)

Sensor data, public sharing/social, payments, native apps, accounts for minors.

## Open questions

See [docs/phase-0/summary.md](docs/phase-0/summary.md#decisions-needed-from-you).
