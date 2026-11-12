# RowLens handoff — 2026-11-12

## Completed CI-feedback release — 2026-11-12

Ewout explicitly requested "Merge en deploy" for #182. All nine PR checks passed in
CI 42882969569 (8m59s), then #182 squash-merged as dd617c6 with the reviewed tree unchanged
and a clean conflict-marker scan. Main CI 43199453228 passed in 6m50s; both image jobs passed
in 43199453539 (2m27s). Deploy 43200553850 completed at 10:28:17 UTC in 41s (server step 26s).
Production now serves 0.0.61/sha-dd617c6, DB ready, 28 migrations unchanged. Both RowLens images
use the new tag. RowLens readiness, trustable.nl, API health and AudioScribe all return HTTP 200.
All seven protected containers (RowLens DB, five trustable/AudioScribe, Feelz) have identical
IDs, start times and image references before/after. The deploy wrote its normal DB backup;
no server configuration or shared-service changes were made.

This release enables conservative documentation-only CI and independent concurrent suites.
Full main coverage: 660 web/DB, 51 general browser, 6 reuse laptop/iPhone WebKit, 34 unified
laptop/iPhone WebKit, 42 edge, 50 worker, 77 deploy checks plus real deploy/rollback rehearsal,
and 13 selector regressions. Run times vary with preparation; historical 27m54s main CI is not
a controlled benchmark. Next possible work: browser separation and fixture/build reuse.

Release log worktree /Users/ewout/src/rowlens-ci-feedback, branch codex/docs/182-deploy.
Original dirty club/research checkout and separate log PRs #176/#178/#181 remain untouched.
Only #182 was merged; no bot change was accepted. Further merges/deployments require a new
request. Historical in-progress/authorization statements below are superseded by this result.

## CI feedback improvement (2026-11-10)

Owner asked why testing/deployment takes so long and to make it smarter. Measured current Actions:
main CI 42824190007 27m54s, images 42824189834 1m19s, deploy 42828663375 37s; docs-only
CI 42829445158 13m19s. Most waiting is CI/setup and serialized web → edge, not production deploy.
On codex/ci/shorten-feedback in /Users/ewout/src/rowlens-ci-feedback, added conservative Markdown
change selection and removed edge/images' dependency on web completion. All code/config changes
still get every suite. No dependency/server/deploy-workflow change; original dirty checkout and
other worktrees preserved. See BUILD.md for evidence/limits and TEST.md for validation. No new
merge/deploy is authorized. Historical release-in-progress text below is superseded by successful
main CI/images and deploy 42828663375; complete release log remains in open PR #181.

## Authorized combined release in progress — 2026-11-10

Ewout explicitly requested "Merge en deploy" for #179/#180. #179 is merged as 7ed27be after
all eight checks passed in CI 42793330184. #180 CI 42795678658 hit its 15-minute web timeout
(no test failure: 660 web/DB, 51 general and 6 reuse browser cases had passed). Integrated main
into #180, retaining both log sections; no source conflict. Web timeout increased to 25 minutes
for slow dependency preparation. Fresh local formatting/lint/typecheck, 660 web/DB and six critical
low-laptop/iPhone WebKit cases pass; marker scan is clean. Require new head CI to pass before merging #180, then main
CI/images green before one combined manual deployment. No additional approval is needed for
that normal release. Production remains sha-b9c983c/28 migrations; no deployment yet.
Worktree /Users/ewout/src/rowlens-training-video-reuse, codex/fix/sequential-version. Separate
logs #176/#178 and unrelated dirty original checkout stay untouched. Historical checkpoints below
are superseded by this release authorization. Record the actual numeric image release after build;
#179 itself publishes the previous-format build, so the final number need not be 0.0.59.

## Sequential numeric versions — local fix (2026-11-10)

Owner explicitly corrected the version requirement: digits and sequential numbers, no SHA suffix.
Implemented on codex/fix/sequential-version in /Users/ewout/src/rowlens-training-video-reuse,
based on main b9c983c. Standalone PR [#180](https://github.com/ewoutbarendregt/rowlens/pull/180) is open; implementation
head 63d36de. Check CI on the latest push before a separately authorized merge/deploy.
Existing image-workflow run_number replaces the root version's patch:
next from current build58 is 0.0.59, then 0.0.60; reruns preserve the same number. Vite validates
APP_RELEASE and bakes it into client/build-info; workflow labels both images with that number.
Login/header display only the numeric release; health SHA and deployment gates are unchanged.
ADR-0027 explains build gaps, rollback and preserving the workflow counter. Local builds default
numerically to root 0.0.0. No schema/dependency/server/permission change or production action.

660 web/DB, four focused login/header and two unified laptop/iPhone WebKit checks pass; screenshots
inspected and no overflow. Actual Docker image verifies 0.0.59 in metadata/bundle while retaining
diagnostic tag sha-1234567. Invalid generator/build values are refused. Formatting/lint/typecheck
and flagged builds pass, plus 50 worker and 77 Linux deploy checks. Development :5174/API :3100 is healthy. Drawing PR #179 is independent,
with its clean worktree/preview :5184 preserved. Deployment logs #176/#178 stay open separately;
production remains sha-b9c983c/28 migrations (#177/deploy42789959357). No new merge/deploy asked.

## Drawing autosave/direct deletion — local implementation (2026-11-10)

Owner requested final-point autosave and a small selected-object trash control without confirmation.
Implemented on codex/fix/drawing-autosave in /Users/ewout/src/rowlens-version-display, reusing the
clean checkout from origin/main b9c983c. PR [#179](https://github.com/ewoutbarendregt/rowlens/pull/179) is open against main; implementation
head b4bc11d. Check CI on the latest push before any subsequently authorized merge.
No new table/dependency/server/permission change. Notes,
manual boat lines and joint measurements use existing scoped routes. Failed saves keep the preview
and original frame for retry; failed deletion retains the object. Source drawings remain read-only;
generated boat lines are correctable and only their manual corrections are deletable. 641 web/DB
tests and all 48 editing/6 reuse browser cases pass, including laptop/low-laptop/iPhone WebKit.
Fifty worker and 77 Linux deploy checks pass, plus formatting/lint/typecheck and the flagged build.
Screenshots inspected, 44px targets measured. One failed interception setup was corrected; the
three affected cases pass on rerun (see TEST.md). Preview :5184
(API :3124) is healthy; edge test stack :8080 uses the real worker. No new merge/deploy requested.
Production remains sha-b9c983c/28 migrations, deployed #177/run42789959357; deployment logs are in
open documentation PR #178 (and prior #176). Preserve original dirty club/research checkout.

## Restore missed version/header work (2026-11-10)

Owner reported versioning/display already built but absent from production. Original own commit
eace60b (brand, tagline, semantic release + health build and home link) stayed on the dirty local
club-editor branch and was omitted when #175 was isolated. The agent acknowledged that omission.
Restored only those existing product files in isolated worktree /Users/ewout/src/rowlens-version-display
on codex/fix/version-display, based on main 8a401c9. No new schema/dependency/version-numbering policy.
Root release remains 0.0.0; the displayed build makes each deployment identifiable.

641 web/DB, 34 unified, 8 focused and 32 general browser checks pass. The focused checks include
production-length SHA and semantic release labels, low laptop/iPhone WebKit layouts and 44px logo
targets; screenshots inspected. Initial two checks were red before restoration. Flagged builds,
format/lint/typecheck pass. The fixed tagline is in both NL/EN catalogs.
Production is sha-8a401c9 with DB healthy and 28 migrations; #175 is merged/deployed (run 42640926073).
Deploy log #176 is open separately. No new production action is authorized/performed in this repair;
follow AGENTS.md's separate explicit per-deploy instruction. Original club/address/research changes
remain untouched. Restore preview: http://localhost:5184/projects/rowlens/ (API :3124), using the local stack with
healthy DB. The existing :5174 preview remains unchanged. Standalone PR [#177](https://github.com/ewoutbarendregt/rowlens/pull/177) is open against main;
implementation head 8ecdf49. CI must be green before a subsequently authorized merge.

## Own-training/video reuse implementation (2026-11-09)

PR [#175](https://github.com/ewoutbarendregt/rowlens/pull/175) targets main and is ready for review;
no merge or deployment was requested. Feature implementation head e9fbbba. GitHub CI status must
be checked on the latest push before any future authorized merge.

Owner approved docs/plans/training-video-reuse.md with "Ja"; do not ask for architecture approval
again. Implementation on codex/feat/training-video-reuse: Created by me filter, tenant media assets
and independent ready-video entries, source feedback discovery/read-only references and personal
creator/source switches. ADR-0026/migration 0028 document privacy, media lifecycle, old-image guard
and independent worker jobs. Local validation complete: 641 web/DB, 6 focused browser, 34 unified, 32 general browser, 38 edge,
50 worker and 77 Linux deploy-script checks pass, plus actual local deploy rehearsal. Local UI
http://localhost:5174/projects/rowlens/ and API :3100 run from this isolated worktree with unified
users enabled; DB readiness is healthy and migration count 28. Source reads already return HTTP200
on the local app. BUG-062 quota regression was red before excluding rejected assets; the unreleased
helper is refreshed locally and fresh DB tests apply final SQL. No production change or deploy.

The isolated worktree is /Users/ewout/src/rowlens-training-video-reuse. Original worktree remains
codex/fix/club-editor-feedback with existing uncommitted club-editor/address migration 0027 and
turn probe untouched. Feature branch is rebased onto main 037899e; unrelated committed research/brand/club work is not
part of this feature. Conflict-marker checks are clean. Feature migration 0028 follows journal 0026; reconcile journal,
snapshot ancestry and timestamps before integrating the separate address migration. Production
remains sha-037899e/27 migrations. No bot/third-party change was accepted.

For any agent (opencode, Claude Code, Codex). Read `AGENTS.md` first; `DOCUMENTATION.md` is the
newest-first detailed log. Update this file at the end of a session.

## Authorized release in progress — 2026-11-08

Ewout requested "Merge en deploy". #160 merged as 4e8061b, branch retained. #161 retargeted to main;
main integration conflicts resolved by restoring its own reviewed tree, marker scan clean, pushed
3892e2e; wait for CI 42468683540 before merging it. Then retarget/integrate #162, and #163 last.
Feature head ea40edb CI 42468395663 failed on 3 Linux WebKit tests: screenshot >32767 pixels and
shared synthetic directory quota. BUG-058 fixes capture only relevant request cards, keeps production
30/minute and configures 1000 only in E2E, with a configured-limit DB regression. Focused config and
registration checks: 35 pass; CI-mode local browser rerun: 34/34 pass. Do not merge #163 until
its corrected head's CI passes. No deploy yet; previous no-deploy authorization wording is superseded.
Production baseline files: /tmp/rowlens-admission-predeploy-{containers.txt,data.json}; sha-a47111c,
26 migrations, kernel149, 7 accounts/memberships, 4 sessions, 6 videos, 1 registration, 1 global admin.
Post-deploy SQL is prepared at /tmp/rowlens-admission-postdeploy.sql. Preserve shared container IDs.

## PR and deployment rehearsal checkpoint — 2026-11-08

Feature PR [#163](https://github.com/ewoutbarendregt/rowlens/pull/163) is stacked on DNS documentation
[#162](https://github.com/ewoutbarendregt/rowlens/pull/162), then kernel/audit #161/#160. No merge/deploy
was requested. Local actual deploy rehearsal **passes**: migrations, backup, normal update, failed
release rollback, explicit rollback and status. Temporary rehearsal containers/images were cleaned
by the script; local dev remains healthy (HTTP200 and DB ready).

CI run **42468102702**: policy/secrets/deploy-script pass; worker stopped before tests because
setup-uv's release download returned **HTTP504 three times**. This is a download failure, not a
worker test failure; all 50 worker checks pass locally. GitHub refused an individual rerun while
the full workflow was still in progress. The documentation push starts a fresh full run; inspect
that latest head before claiming green or merging. Local validation remains 621 full web/DB,
38 final focused, 34 laptop/iPhone WebKit, 50 worker and 77 deploy-script checks, with format,
lint, typecheck and build passing. Production/actual notification receipt remains unverified.

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

Implementation approval was explicit: "Ja, voer het aangepaste volledige plan uit". No need to
ask for architecture approval again for this scope. The feature PR is stacked on DNS documentation PR #162, which is stacked on #161/#160.
When merging, retain each lower branch until its child has been retargeted and CI is green.
Historical pending-approval entries elsewhere describe earlier checkpoints. Production stays
sha-a47111c/26 migrations/kernel149; BUG-056 mailbox receipt remains unverified and BUG-055 open.

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

## Latest investigation — new-address OTP report (2026-11-08)

Read-only check: unified mode active, live bundle includes Account aanmaken and registration OTP.
The inspected production log window had 3 login OTP requests, 0 registration OTP requests and 0
OTP mail failures (aggregate output only; no address/code exposed). ADR-0024 intentionally does
not mail login codes to unknown accounts. Direct new users to Account aanmaken, choose a club
or no club, then request/confirm the registration code. No production mail was sent for testing;
registration mailbox delivery is not yet verified. No app/server change or deploy was made.
An earlier question asks whether the user tried login versus registration; no explicit choice
was received, so do not claim a user-confirmed path or rule out a later registration-mail issue.

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

The operation is complete; do not re-run the Terminal helper. Logs/baselines remain under
/tmp/rowlens-kernel-review locally. PR #161 records the repair; it is not merged. Historical
preparation and pending-approval text below describes earlier checkpoints.

## Earlier preparation — BUG-054 verified kernel repair

- Ewout asked "kun je dit issue oplossen?". Prepared on `codex/fix/054-kernel-remediation`, based
  on the still-open audit/policy docs PR #160. No host mutation/reboot authorized/applied yet;
  show exact action and obtain the separate approval AGENTS.md requires for shared components.
- **Correction**: the earlier CVE-page WIP status is stale/incomplete. Fresh signed Canonical
  metadata and the production mirror offer **6.8.0-149.149 in noble-updates**. Downloaded module
  changelog contains `ipv4: free inet_opt and ireq_opt after an RCU grace period` in that release.
  No proposed source, firewall workaround or distro/kernel-family switch is needed.
- `scripts/admin/fix-production-kernel-054.sh`: check is read-only; apply needs hidden root su
  access, pins four reviewed packages/payload hashes, rejects unrelated/removal/version drift,
  retains 147, backs up GRUB/inventory and validates boot entries before reboot in one minute.
  Exact scope, commands and recovery plan: docs/security/bug-054-kernel-remediation.md.
- Checks: **10 parser**, ShellCheck/Bash syntax, **4 real payload hashes**, production read-only
  APT/helper check (2 new/2 upgraded/0 removed, 63 untouched). All eight containers restart
  unless-stopped; Docker/UFW enabled, GRUB default 0, >75 GB free. No VM kernel boot test run.
- Root password must be entered by Ewout in native Terminal, never chat/argv/env. After approval,
  verify uploaded helper checksum before su; collect pre-reboot boot/service/data baselines,
  execute only the reviewed helper, wait for fresh SSH + kernel149 and all app health checks.
  Provider console should be available for manual old-kernel recovery if SSH does not return.
- Production still sha-a47111c/26 migrations/kernel147. Do not mark BUG-054 fixed until the new
  kernel is running; BUG-055 and other unrelated maintenance findings remain separate.

## Current production and security follow-up — 2026-11-07

- Our registration PR #159 is merged as **a47111c**; lower docs #158 merged as ca0b7af with its
  branch retained. PR CI **42403762182**, main CI **42404700506** and images **42404700521** pass.
  Deploy **42405660947** succeeded at 19:20 UTC: **sha-a47111c**, **26 migrations**, web/worker
  running with zero restarts. Earlier in-progress/no-new-deploy wording below is historical.
- Before/after retained: 6 accounts/memberships, 4 sessions, 5 videos, 13 compatibility people
  (7 unlinked), 10 seats, 8 angles, 1 platform administrator. Registration count and pending application count zero;
  no fabricated backfill. New private table/helper direct privileges denied. No repeat bootstrap.
- Production public signup form passes laptop 1000x540/iPhone WebKit checks (WVIJburg/No club,
  disabled incomplete submit, no overflow). No OTP sent or actual email/signup round-trip tested.
  All five shared container identities/start times/images are unchanged; three neighbour URLs 200.
- Ewout rejects all unsolicited external/bot changes. All Dependabot PRs #72–79 were unmerged
  and are now closed (branches retained). Auto-merge false; Dependabot secrets 0. Version-update
  proposal scheduling remains configured; do not claim the bot itself was disabled. AGENTS.md
  records no acceptance of external proposals; generic own-release approval does not cover bots.
- **URGENT BUG-054**: Canonical confirms critical CVE-2026-98432 in IPv4/TCP for the running
  Noble kernel family (6.8.0-147). A supported Noble fix is still in progress. No exploit tested.
  XFRM/kernel advisories and shared Docker maintenance also need owner-directed review. Nothing
  was changed to firewall, kernel, shared Docker/other apps. Any mitigation/update needs exact
  command/diff and separate approval per AGENTS.md. Do not execute vendor firewall text blindly:
  UFW is active and nftables service inactive; preserve that manager and Docker forwarding/
  container namespaces.
- Audit: `docs/security/2026-11-07-production-dependabot-review.md`. Exact local image scans,
  no production scanner installation or secret/media export. Raw matches are not confirmed exploits:
  current web 29 (1 critical/10 high), worker 853 (11 critical/326 high, repeated library matches),
  DB 5 (1 critical), current-kernel host inventory 7342 (30 critical matches/15 IDs). Vendor review
  reduces several apparent critical paths (e.g. missing tiffcrop, runc advisory not exploitable
  through Docker); do not downplay the separately confirmed core IPv4 kernel advisory.
- Review/remediation is open in BUGS.md, not fixed by this deployment. No evidence attributes it
  to Dependabot. Local scanner files: /tmp/rowlens-security-audit; Grype v0.121.2 DB 2026-11-07.
  Local dev :5174/API :3100 remains available; prod is not declared free of vulnerabilities.

## Authorized registration release — in progress

- Ewout requested "merge en deploy" for the signup implementation. PR #158 passed all eight jobs
  (run 42398940884) and is merged as ca0b7af; its branch is retained to protect the stack.
- PR #159 is retargeted to main. A new documentation/authorization head triggers fresh CI against
  this base. Wait for all checks, merge #159, wait for both main images and CI, then deploy only
  that implementation merge tag. Do not deploy the intermediate docs-only merge.
- Production preflight remains sha-dd71f78/25 migrations: 6 accounts, 6 memberships, 4 sessions,
  5 videos, 13 compatibility identities (7 unlinked), 10 seats, 8 angles, 1 platform administrator,
  0 pending club applications. No account-registration table exists before migration 0025.
- Shared-container IDs/start times/images captured read-only. Compare after deployment; verify the
  three neighbouring URLs, readiness/new tag, public minimal club directory and 26 migrations.
- Existing global administrator must survive unchanged; no repeat bootstrap or server .env/compose
  change is needed or authorized. This request supersedes earlier no-merge/deploy wording only for
  this registration release. Log its completed deployment in a subsequent documentation PR.

## Current follow-up — explicit registration implemented locally

- Ewout approved the full signup plan with "Ja, voer het volledige plan uit". Implemented on
  `codex/feat/registration-onboarding`, in PR [#159](https://github.com/ewoutbarendregt/rowlens/pull/159),
  stacked on deployment-log PR #158 (all eight CI jobs green).
  Implementation CI is pending on the final head. Do not merge either without a request. If merging the stack later, keep #158's branch alive,
  retarget this implementation to main, and wait for new green CI before its merge/deploy.
- ADR-0024/migration 0025: separate existing-account login and explicit signup, optional club
  choice bound to purpose/challenge/email HMAC; proof creates account/registration/request/session
  atomically. New global auth table has no direct app-role access; tenant applications retain RLS.
  A private shared submission helper keeps verified users, pending decisions and rejection cooldown.
  Real mailbox-lock concurrency and rollback tests cover proof replacement and failed application.
  Final review fixed BUG-053: own confirmation prefers the latest verified choice; initial signup
  history remains immutable. Local unreleased function definition refreshed; fresh DB migration
  tests validate the final SQL. Local SMTP is unset: confirmation codes are in dev server output.
- New Registration form has explicit No club; own club/status page works before names. Global
  Requests sees clubless registrations and all application statuses across clubs; club admins see
  only their active selected club. Only pending live-club rows offer admit/reject. No platform
  approval for clubless accounts, fabricated old signups, auto membership or new admin mail.
- Checks: full 608 web/DB plus final focused 42/42, **28** laptop 1000x540/iPhone 13 WebKit, worker 50 + Ruff/mypy, deploy scripts 77
  and actual Docker migration/rollback rehearsal pass. Format/lint/typecheck/feature-on build/schema
  journal pass. TEST.md retains initial fixture/static failures and legacy full 47 pass/75 skip/2
  lineup timing failures; isolated desktop/mobile lineup rerun passes 2/2. Edge/real worker passes
  **39 cases, 23 skipped**, with isolated output artifacts.
- Local :5174/API :3100 uses 26 migrations and enabled unified flags. Dev stack remains available;
  feature-on build restored after legacy testing. E2E uses throwaway synthetic accounts/mail only.
  Physical iPhone and production signup are not tested; no actual mailbox/address/code captured.
- Production remains sha-dd71f78 with 25 migrations; no new production action, merge or deploy is
  authorized. The reported personal email is excluded from repository logs.

## Current production — deployed 2026-11-07

- PR [#157](https://github.com/ewoutbarendregt/rowlens/pull/157) merged as **dd71f78** after
  corrected-head CI **42396990030** passed all eight jobs. Main CI **42397829809** and release
  images **42397829884** passed; deploy **42398709787** released **sha-dd71f78**.
- Unified accounts are enabled in client/runtime release images. Readiness reports the expected
  version with DB ok; anonymous auth status reports unified/enabled true and access false.
  Production has **25 migrations**. No .env or installed compose edit was needed.
- Preserved **6 accounts, 6 memberships, 4 sessions, 5 videos, 7 historical people, 10 seats,
  8 angles**. WVIJburg retains the pilot UUID/slug. All **7** historical identities remain unlinked:
  an administrator must explicitly map them to real verified admitted accounts before any future
  compatibility contraction; no identity is guessed from a name/email.
- Ewout explicitly approved the image-bound one-time production bootstrap and entered the
  verified address through a hidden native Terminal prompt, then said "done". Script exit **0**;
  aggregate verification: **1 platform administrator, 1 operator-bootstrap audit**. No email/secret
  was put in commands/chat/repository. Global authority is separate from club roles/allowlists.
- Shared trustable/Caddy/AudioScribe container IDs, start times and images exactly match preflight;
  their three public URLs return **200**. No shared component was changed/restarted.
- The known release-please job **42397829796** failed only because Actions cannot create PRs;
  this is unrelated to the successful images/CI/deploy. Original missing-SMTP smoke failure
  **42390255322** was corrected before merge without weakening production validation.
- Next: Ewout verifies Users/Clubs while authenticated on production. No manual authenticated
  production browser or physical iPhone verification was performed. Further deploys require a
  fresh request; the completed authorization applies only to this release/bootstrap.
- Deployment records are in the follow-up documentation branch/PR, not committed directly to main.

## Current task — full user table and account/identity editor

- Ewout approved the full plan with "Ja, voer het volledige plan uit". Implemented on
  `codex/feat/unified-club-users`, in PR #157; ADR-0023 records the final permission/identity model.
- Users is now a 17-field server-filtered/sorted/paged table, with column selection and an editor
  covering names/preferences, verified email, selected-club membership/roles and global authority.
  RowLens admins see every verified account, including zero clubs, and all pending requests. Club
  admins receive only current-club members, metadata/memberships and requests; scope precedes counts,
  choices and filters. Account/club/authority keys and late-response guards isolate UI data/drafts.
- Migration 0024: protected global pending proofs, explicit null/type/permission/revision checks,
  UUID-only audits, ordered admission locks and email-keyed grant sync, old session/code revocation.
  A club admin cannot confirm another account's change: its existing authenticated owner must use
  the mailed new-mailbox code/link, preventing other-club/global takeover. Configured source and
  destination addresses cannot be changed in the app. Global role changes require a persisted
  RowLens admin, expected state, inline confirmation and serialized self/last-admin protection.
  The hidden operator bootstrap remains first-admin/recovery and uses the same authority lock.
  Account-ID-bound admissions and identity/mailbox locks also coordinate OTP verification, legacy
  adoption, allowlist provisioning, approval and initial-admin writers. A real lock-wait regression
  proves a changed/recycled email cannot redirect a role grant.
- Checks: **593** web/DB, latest **29** focused identity/permission cases, **16** laptop/iPhone WebKit,
  legacy local **49 pass/65 skipped**, final auth/permission compatibility **16/16**, proxy
  **39 pass/17 skipped**, worker **50** + Ruff/mypy,
  **77** deploy checks and real Docker migration/rollback rehearsal pass. Format/lint/typecheck/build
  and generated-schema consistency pass. TEST.md records all diagnostic/mixed-build/trace failures
  and isolated successful reruns; do not describe them as product fixes. Physical iPhone untested.
- Local dev :5174/API :3100 is healthy, **25 migrations**. Unreleased function definitions were
  refreshed as verification hardened them; fresh DB tests/rehearsal validate full SQL application.
  Edge stopped with data retained. Feature-on build restored after legacy checks (local Vite dev
  remains feature-on independently). No real identity/mailbox or production mutation was performed.
- Implementation notes below describe the pre-release verification; the completed release above supersedes their earlier no-production-action status.

## Current follow-up — Users page and zero-or-more club memberships

- Included in PR #157 on `codex/feat/unified-club-users`. Ewout requested a Users tab: all accounts
  for RowLens admins, only current-club members for club admins; accounts may have zero or more clubs.
- `/users` is now separate navigation, protected for administrators. Platform mode uses the existing
  protected global verified-account directory, optionally combined with selected-club role controls.
  Club mode uses only the tenant member API. Users outside the selected club get account settings,
  without invented club roles; explicit admission is available when a club is selected.
- Clubs no longer embeds a global user-settings selector; its verified-user dropdown remains only
  for appointing a club administrator. Club administration now holds Requests and Roles. Legacy
  feature-off administration remains compatible. No new table, migration or dependency.
- BUG-046 fixed: global account settings no longer require a selected club for platform actors.
  Only the exact administrative settings route gets this account scope; club admins retain tenant
  validation and SQL membership checks. Read/save audits contain actor/target UUIDs and commit with
  settings work; revision conflicts do not create a successful-save event.
- Checks: 546 full web/DB tests, 38 focused authorization/settings tests, 10 laptop/iPhone WebKit
  cases, 6 legacy admin/settings browser cases and lint/typecheck/format/build pass. Prior proxy,
  worker and migration/rollback evidence belongs to the preceding archive change; not rerun here.
  Local :5174 remains healthy with 24 migrations. Refresh `/users` to review. No production change,
  merge or deployment authorization; CI for the new head is on PR #157.

## Current follow-up — club administration and reversible club archiving

- On branch `codex/feat/unified-club-users`, included in PR #157. Ewout requested members/roles and
  admission under Club administration, full club management under Clubs, and approved archiving
  with restoration: "Ja, archiveren en kunnen herstellen" (ADR-0022; migration 0023).
- Club administration has Club members, Requests and Roles tabs. Unified member lists exclude
  unused allowlist addresses; all actual memberships are listed and membership-only roles editable.
  The platform Clubs directory includes archived clubs and inline-confirmed archive/restore.
- Archive denies new club content/API/direct tenant SQL and applications; accounts, other club
  memberships, pending requests and history remain. Restore re-enables the same club and memberships.
  Background jobs can finish; no permanent deletion or branding was added.
- Latest checks: 545 web/DB, 50 worker + Ruff/mypy, 8 laptop/iPhone WebKit cases, 49 legacy local
  browsers (57 skipped), 39 proxy browsers (14 skipped), 77 deploy checks and real local migration/rollback rehearsal pass. Edge stopped with data retained. Schema
  consistency passes. TEST.md records a Testcontainers startup timeout followed by an 8/8 rerun.
- Local dev readiness is healthy, now **24 migrations**. Refresh `/admin` and `/clubs` for review.
  No real club was archived by the agent; lifecycle tests use synthetic clubs. Production remains
  unchanged. No merge/deploy authorization; latest CI status is on PR #157.

## Current task — unified users and multi-club admission (2026-11-07)

- Operator bootstrap BUG-044 is fixed: audit parameter explicitly typed UUID before conversion to
  text. The real CLI reproduced 42P08 before the fix; 20 focused CLI/authorization tests pass after.
  Operator should rerun `bash scripts/admin/grant-platform-admin.sh` with hidden verified email;
  the original failed transaction rolled back. No real account was granted by the agent.

- PR [#157](https://github.com/ewoutbarendregt/rowlens/pull/157) is open and mergeable. All eight jobs in CI run 42368522411 succeeded, confirmed on 2026-11-07 after “ga door”. Local readiness reports database health. Next is operator local review/bootstrap with the hidden terminal prompt below; historical mappings require real account selection. No merge/deploy authorization.
- Ewout approved with "ja uitvoeren". Branch `codex/feat/unified-club-users`, from main 799dfbe;
  planning docs copied without incorporating separate deployment-log PR #156. Production remains
  sha-799dfbe, as previously explicitly deployed; no new merge/deploy is authorized.
- Implemented paired-feature-flag account requests/verification, account-only sessions/settings,
  club applications/admission, multi-club context and UI, separate global RowLens authority/full
  private-content access, club create/rename/initial admin, and WVIJburg display name with old IDs.
- Migration 0020 adds protected global auth/platform storage and tenant applications; 0021 adds
  canonical account refs with same-club derivation/backfill. Existing IDs, sessions and history are
  preserved. Production read-only preflight: 7 roster people, all unlinked; 10 seats, 1 assignment,
  0 shares, 1 historical log and 8 angle measures. Admin explicit mapping UI waits for real verified
  accounts/admission and refuses collisions. Do not invent accounts, infer matches or drop history.
- Platform bootstrap is `bash scripts/admin/grant-platform-admin.sh`: hidden terminal email prompt,
  owner connection and existing verified account. Existing server admins are not auto-promoted.
  Logos/club interface design remain deferred. Flags default off for production; local dev runs on.
- Final guard hardening rejects content reads/writes without an explicit club when several clubs are available; account-only operations and single-club compatibility remain. Focused 18 integrations + 6 laptop/iPhone cases pass. CI status for the new head is on PR #157.
- PR CI run 42367425246 exposed an upload reply-before-COMMIT race (BUG-042; web 538 pass/2 fail). Fixed with a deterministic deferred-commit test; local uploads 13/13, full suite 541/541 and 6 upload/permissions browser cases pass. The next CI run 42368018365 passed web and deploy-script; do not use the earlier failed run as release evidence. Check the latest PR head for current status.
- Final checks: **541 web/DB** (18 unified cases + upload commit regression), **50 worker** with Ruff/mypy, format/lint/typecheck,
  feature-on build and schema consistency pass. Local unified **6/6** and proxy **6/6** (1000×540
  Chromium + iPhone WebKit) pass; screenshots and >=44 px/no-overflow checks inspected. Legacy
  local **49 pass/53 skipped**. Legacy proxy first run **38 pass/1 transient lineup fail/12 skipped**;
  targeted repeat **1/1** passed, followed by final full **39 pass/13 skipped**, no failures. Deploy-script **77** and real
  Docker deploy/rollback rehearsal pass. See TEST.md for failed diagnostic iterations as well.
- Local dev :5174/API :3100 is healthy, UNIFIED_USERS=true, **23 migrations**. Unreleased function
  definitions were refreshed locally as SQL evolved; fresh DB tests/rehearsal validate migration
  application. Edge is stopped after final regression, with data retained.
- Global bootstrap: existing server admins remain club admins. The local operator runs
  `bash scripts/admin/grant-platform-admin.sh` after signing in once; hidden input and protected
  owner connection keep the address out of chat/arguments. No production bootstrap was run.
- Older task snapshots below are historical and do not authorize another release.

## Current task — #154, club-wide reading and role-based editing

- Ewout approved the revised plan and its one policy migration: "voer het plan uit".
  Branch `codex/feat/154-club-training-readonly`, based on main `b000ca4`; implementation local.
- All roles read all current-club trainings. Rower-only writes remain creator-owned, not crew-owned;
  foreign trainings are fully read-only, including old own feedback, assignment and sharing.
  Coaches/admins edit every club training; combined roles retain elevated rights. Private feedback
  stays private to rowers, and creator/account administration stays admin-only. See ADR-0020.
- Migration 0019 (20 total locally) separates read/write RLS. APIs return resource capabilities and
  pre-authorize media effects under a parent lock with a fresh ownership recheck after lock waits.
  BUG-032 regression reproduces a concurrent creator-transfer/upload race, then passes after fix.
- Ready in PR [#155](https://github.com/ewoutbarendregt/rowlens/pull/155). Final code is 44b4062 plus
  verification documentation; check current CI on the PR. No merge/deploy authorization.
- BUG-034 compatibility is included in the same migration: new `withTenant` transactions set fixed
  `app.training_permissions=owner-or-staff`. Absent context keeps the prior role-set-aware image's
  aligned legacy read/write scope during upgrade/authorized rollback; unknown modes deny training
  access. No second migration/table/dependency, server reconfiguration or coordinated stop is needed.
  Scalar-role images remain incompatible with ADR-0019. Legacy/new contract tests pass together.
- Final verification after that change: 522 web/DB (30 new permission cases), 50 worker with Ruff/mypy,
  format/lint/typecheck/build, schema-generation consistency, 77 deploy-script tests and repeated
  real local deploy/rollback rehearsal pass. Full local E2E 49 passed/49 skipped; full edge 39 passed/
  10 skipped. Local phone/1000×540 matrix 6/6; edge matrix 14/14 (permissions/live roles/private
  feedback, angle measurements, line movement, 0.25×/0.5×, pause and inline stroke tools).
  Screenshots inspected; no document overflow. Earlier diagnostic runs are retained in TEST.md.
- Local dev :5174/API :3100 is healthy with 20 migrations. Its already-applied 0019 helpers/policy
  were updated non-destructively with data retained; edge bootstrapped the revised migration on a
  fresh test database and is stopped after verification. No local check is running; dev stays on.
  Next: Ewout tries the local stack. Merge/deploy require new explicit requests.
- Production is **sha-b000ca4**, #152 merged/deployed 2026-11-06 18:18 UTC, verified healthy with
  19 migrations and retained accounts/sessions. Deployment log PR **#153** is separate and open;
  older #148/#150 and the OWASP review branch remain untouched. No merge/deploy authorization
  carries over to #154. No production changes were made.
- The sections below are earlier snapshots from main. This current section supersedes their older
  production/task status; deployment evidence is in #153. Do not repeat that deployment.

## Admin user settings implementation — #151

- Approved by Ewout: "Ok voer maar uit". Branch `codex/feat/151-admin-user-settings`, based on
  main `e5960c7` plus the three approved proposal commits. No new merge/deployment authorization.
- One global account/profile and five central display/video preferences; seven non-empty role
  combinations. Current-club admins inspect/edit accounts; unknown preferences remain explicit.
  User e-mail remains read-only. Additive role arrays replace scalar grants (migration 0018);
  settings writes use revisions, protected SQL functions and a scoped immutable admin audit.
- Rower-only: Trainings and own settings; no standalone Rowers directory or roster writes. API/RLS
  enforce this; scoped crew names omit e-mails and identify only the current member with `mine`.
  Existing permitted note sharing, assignment and lineup interactions remain.
- Client account caches are isolated; late responses are ignored, legacy device import requires
  confirmation and fills only null fields. Focus/reload sync does not remount the player. Open
  profile/admin drafts cannot silently overwrite newer changes. Transport/server failures preserve
  the last confirmed auth state; explicit access denial still closes it (BUG-030). ADR-0019 records the decision.
- Unsaved role choices retain their original conflict snapshot through profile/list refreshes
  (BUG-031). Explicit reload/cancel discards the draft; stale saves report a conflict.
- Verification: 492 web/DB + 50 worker tests, format/lint/typecheck/build, 77 deploy-script tests and
  Docker rehearsal pass. Full local E2E: 47 passed/49 skipped; full edge: 38 passed/10 skipped.
  Local low-laptop/iPhone settings matrix: 6/6; edge regression matrix: 24/24 (settings, playback,
  angles/drawing, stroke controls). Screenshots inspected; 44 px controls and no document overflow.
  Final outage/rejection checks: 12 Chromium + 10 low-laptop/iPhone cases pass.
  Separate output paths avoid Playwright trace collisions. PR [#152](https://github.com/ewoutbarendregt/rowlens/pull/152) is open against main; The PR carries the current CI status; no merge/deploy is authorized.
- Production stays `sha-e5960c7` (deploy 42195631449). Separate log PRs #148/#150 and the local
  OWASP review branch remain separate. Local dev :5174 is migrated and running (19 migrations); edge is stopped after tests. Oar arc/stern camera remain deferred.

## Inline stroke controls — 2026-11-06

- Current work: `codex/feat/85-inline-stroke-tools`, based on `main` `ddb90fd`; pending PR review.
  No merge/deployment is authorized for this new change. Production stays `sha-ddb90fd`.
- Per Ewout's screenshot/clarification, the separate mark editor is replaced by a trash action on
  each stroke row. Open it, choose one catch/finish/half-slide moment, then confirm inline. Never
  delete the whole stroke; exclude the next catch. Loose marks stay individually removable.
- ↓ Catch / ↑ Finish tools sit immediately above the picture, with Notes open too, on phone and
  in fullscreen. They pause, exit point placement and toggle the current frame's mark; keyboard
  support and pointer-release activation are retained. No API, schema, dependency or role changes.
- Table layout/44 px actions and fullscreen contrast were checked; BUG-027 records the prototype's
  internal table scrolling, corrected before review. Final matrix: 12 passed across laptop,
  1000×540 and iPhone WebKit; 451 web / 50 worker tests; full edge 36 passed (10 skipped).
  Local E2E: 43 passed (49 edge-only skipped); 2 isolated iPhone visual checks passed.
  See TEST.md for diagnostic iterations.
- Local dev stays available on :5174; edge is stopped after final visual verification.
- Deployment log PR #148 is still separate; the local OWASP review branch
  `codex/docs/owasp-security-review` is preserved and is not part of this UI change.

## State

- `main`: **`ddb90fd`**, including merged PRs [#144](https://github.com/ewoutbarendregt/rowlens/pull/144),
  [#145](https://github.com/ewoutbarendregt/rowlens/pull/145),
  [#146](https://github.com/ewoutbarendregt/rowlens/pull/146) and
  [#147](https://github.com/ewoutbarendregt/rowlens/pull/147).
- Production: **`sha-ddb90fd`**, deployed 2026-11-05 23:41 UTC (2026-11-06 00:41 CET),
  [run 42131217348](https://github.com/ewoutbarendregt/rowlens/actions/runs/42131217348).
  Final main CI 42128677789 and images 42128677869 passed. Readiness: expected version and DB ok;
  five public URLs returned 200. Web/worker use the new tag; 18 migrations. The deploy recreated
  the RowLens DB container (healthy, PostgreSQL 16.15); five shared-service container IDs and
  start times are unchanged. The standard pre-deploy backup succeeded.
- Merge order was #144 → #145 → #146 → #147, preserving lower branches while retargeting each next
  PR. Squash conflicts were resolved using the repository procedure, keeping each reviewed tree;
  fresh CI passed before every merge. Final main is byte-for-byte equal to tested source `cdd51ee`.
- Database: 18 migrations; this release adds no migrations, dependencies or permission changes.
- Deployment log branch: `codex/docs/147-production-deploy`; docs only, not authorized for a later
  merge or deployment by this session's instruction. Production verification is complete.
- Local stack: dev Postgres :5434 + worker and web :5174. Edge was stopped after E2E; keep its data.

## Changes in the merged release

- #144 / BUG-021: drawing and measurement controls below the picture, also in fullscreen; explicit
  44 px buttons/selects leave points unobstructed on iPhone and low laptop windows.
- #145 / BUG-022: speed and play/pause activate once on valid pointer release, preserving keyboard
  activation; drawing drags release capture on up/cancel and clear abandoned drags on lost capture.
  This fixes a reproduced missing-click failure mode. The original physical iPhone gesture is not
  fully reproduced: keep BUG-022 in progress until Ewout confirms 0.25×, 0.5× and pause after drawing.
- #146 / BUG-023: Halen / Strokes has an expandable mark editor. Catch, finish and half-slide marks
  can be deleted explicitly with inline confirmation, independently of the playback cursor.
- #147 / BUG-024: first drawing point appears immediately; no point-progress menu between taps.
  After all two or three points, adjustment, Save/Redo/Cancel and measurement choices remain.

## Validation and limits

- Format/lint/typecheck/build, 451 web tests and worker checks / 50 tests passed. Latest combined
  source: 43 local E2E passed (47 edge-only skipped), 35 full edge passed (10 skipped).
- Focused checks passed on 1440×900, 1000×540 and iPhone 13 WebKit: editing/playback 33; stroke-mark
  deletion NL/EN 9 plus 3 final target-size checks; drawing/angle point placement 15. Details and
  earlier transient quota/setup failures are in TEST.md and the PR descriptions.
- WebKit uses native touch taps; Playwright's mouse API supplies dragging. Physical iPhone finger
  dragging and the originally reported playback sequence remain unverified.
- CI infrastructure BUG-025: Ubuntu package downloads intermittently stall before browser tests.
  Affected jobs were retried on fresh runners, preserving successful checks. No tests or CI gates
  were weakened. The release workflow's known permission failure is unrelated and harmless.

## Earlier production features retained

- Saved drawings, angle measurements and coach/automatic boat lines can be selected and moved by
  dragging their point rings. Drawings show on their own frame; measurement rower/joint chosen in
  the picture (#142, ADR-0017 addendum).
- Angles per rower/phase and crew differences (ADR-0017); worker boat-waterline tracking with
  OpenCV, no external model; a coach correction wins on its frame and restarts tracking (ADR-0018).
- Stroke timings, previous/next stroke moment, zoom, account names/default boat, session renaming
  and videos first on the session page.

## Open and next work

1. Await architecture approval for #151; the concrete proposal is above. #149 is already deployed
   as sha-e5960c7 (see deployment-log PR #150), so do not repeat that merge/deploy.
2. Confirm on a physical production iPhone: create/edit a line and angle, tap 0.25× / 0.5× and pause;
   verify selected speed and actual playback. Confirm moving points with a finger, deletion of
   catch/finish marks and direct drawing without the progress menu. Basics remain the priority.
3. Other open bugs: BUG-012 and BUG-017 (WebKit E2E flakes), BUG-014 (merging roster entries across
   sessions the merger cannot see), BUG-015 (tools wrap at 1000 px with classic scrollbars), BUG-016
   (picked rower sometimes missing after lineup save) and BUG-025 (CI package downloads).
4. "My notes" across sessions (#109) and notifications remain later work.
- **Deferred by Ewout**: oar arc and stern-camera perspective (#127, 2026-11-04 comment). No go-ahead.
  First needs a stern-camera sample on the local stack; the proposed `oar` enum migration needs
  architectural approval. No work on this in the merged release.
- Boat speed/acceleration needs the club's sensor-device decision; ghost riders after a pose spike.
- Leave unrelated old docs PRs #83/#89/#117 and Dependabot #74–#79 alone; #72/#73 (Node 26/Python
  3.15 images) should not be merged as part of this work.

## Working agreements

- Dutch or English matching Ewout; short reports with numbers, limits and PR links. Verify iPhone
  WebKit and ~1000×540. Local review by default; merge/deploy only when explicitly requested each time.
- One PR per change; no direct commits/pushes to main. No shared-server or configuration changes.
- WebKit compatibility clicks can target a newly mounted element; SVG non-scaling strokes can break
  small hit areas in Chromium. Keep both browser engines covered (BUG-018/019).
