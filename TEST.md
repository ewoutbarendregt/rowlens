## 2026-11-09 — Production deployment of training reuse

- PR CI 42634226543, main CI 42636448470 (attempt 2) and images 42636448533 pass. First main edge
  attempt was cancelled after an eight-minute package-preparation stall and retried alone; earlier
  passed jobs were retained. Deploy 42640926073 succeeds; public readiness sha-8a401c9/DB ok.
- 28 migrations, 6 backfilled assets with original IDs, zero missing assets/references/active jobs,
  RLS on both new tables and 4 restrictive reference policies. App-role asset SELECT returns 0;
  private trigger execution denied; guarded reference helper available. Read-only checks only.
- Exact pre/post sporting/account counters match (4 trainings, 6 videos, 83 annotations, 53 stroke
  marks, 8 angles, 9 manual boat lines and 7 accounts/memberships). All 21 media files and
  352,880,017 bytes/quota match. Pre-deploy DB backup exists (339,487 bytes).
- 7 non-replaced container IDs/start times/images match. Four public endpoints return HTTP200.
  Two production public sign-in checks pass at 1000x540 Chromium and 390x664 iPhone WebKit, with
  zero overflow/JS errors/POSTs; screenshots inspected. No production login, email or write-flow
  test/data creation. Authenticated behavior is covered by the local/CI tests below.

## 2026-11-09 — Independent training video reuse implementation

- **641 web/DB tests pass** after isolation onto main, including 17 focused reuse cases and the
  existing-data migration/old-image compatibility test. Creator filtering was red before its fix;
  rejected-asset quota regression was red (75 vs 60 bytes) before excluding rejected assets.
  Coverage includes same-club/tenant boundaries, private notes/sharing revocation, actual current
  membership, all seven role sets, independent strokes/angles/manual and automatic boat lines,
  concurrent reuse/deletion, deduplication/quota, original-training deletion and tus termination.
- **6 synthetic browser checks pass** at 1000x540 Chromium and iPhone 13 WebKit: filter/URL reload,
  existing-video picker, original attribution, individual references, persisted personal layer
  switches, same-frame local/source separation and delete safety. Measured 44px labels; screenshots
  inspected. **34 unified-account checks pass**, including member-created filtering across clubs
  and reload; **32 general browser checks pass** (106 context-specific skips in that run).
- **38 edge checks pass**, including actual upload/transcoding and a new real-worker reuse case:
  independent detector corrections leave the source result unchanged; deleting the source training
  preserves 206-range playback and local notes on the reused entry while removing source references.
  The edge run has 32 context-specific skips. The initially stopped edge stack was stopped afterward.
- Format, lint, typecheck and flagged builds pass. Worker Ruff/format/strict mypy and **50 worker
  tests pass**. **77 deploy-script checks pass** in Ubuntu; the native macOS invocation lacks flock
  and was replaced by that supported Linux run. Actual local Docker deploy rehearsal passes normal
  deployment/backups, failed-release rollback, explicit rollback and status; no production action.
- Local migration count: **28**; development UI remains on :5174 and API :3100, database readiness
  HTTP200. Refreshed the unreleased quota helper locally after BUG-062; fresh test databases run
  the final migration. Original worktree's pending address migration is not applied or copied.

## 2026-11-09 — Training reuse design review

- Documentation-only proposal; no application, schema or worker changes and no feature tests run.
  Reviewed existing creator projection/filtering, video/session foreign keys, annotation/moment
  policies, per-entry analysis data and media serving/deletion assumptions. Recorded the required
  isolation, source-visibility, lifecycle, migration and laptop/iPhone WebKit checks in
  docs/plans/training-video-reuse.md. Prettier checks on all six changed Markdown files and
  git diff whitespace checks pass; implementation awaits architecture approval.


# TEST

Test strategy, prompts and results. This file is the source of truth for testing.

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

## BUG-054 kernel repair preparation (2026-11-07)

- Fresh Canonical amd64 archive and production mirror both offer **6.8.0-149.149** in
  **noble-updates**, without proposed. Extracted downloaded modules changelog contains the exact
  relevant IPv4/RCU fix. Earlier CVE-page-only no-fix wording is superseded by this evidence.
- Production read-only solver/helper check: **2 new, 2 upgraded, 0 removed**, only the four
  pinned kernel packages; **63 untouched**. Docker/UFW enabled; all **8** running containers have
  unless-stopped policies. Current kernel remains **147** and no livepatch is active.
- Real canonical payload verification **4/4 SHA-256**. **10/10** parser safety checks, Bash syntax
  and ShellCheck pass locally in isolated Ubuntu. No local-container kernel boot test is claimed.
- Installer changes are approval-gated; no production apt update/install, firewall/boot mutation
  or reboot. Only helper `check` ran over SSH stdin; no script was copied to production yet.

## Registration production release and read-only security review (2026-11-07)

- Final PR CI 42403762182: all eight checks pass. Merge a47111c main CI 42404700506 and images
  42404700521 pass. Deploy 42405660947 succeeds; readiness sha-a47111c/DB ok, 26 migrations.
- Public production form **2/2** at laptop 1000x540 and iPhone 13 WebKit: account CTA, WVIJburg,
  No club, incomplete form disabled and no document overflow. No real signup/OTP mail sent.
- Preserved 6 accounts/memberships, 4 sessions, 5 videos, 13 compatibility people (7 unlinked),
  10 seats, 8 angles, 1 global administrator. New registration/helper direct privileges denied.
  All five shared-container identities/start times/images unchanged; neighbour URLs **3/3 HTTP 200**.
- Provenance review: eight bot PRs never merged, now closed; auto-merge false, Dependabot secrets 0.
  No manifest/lock/Dockerfile change between old/new own releases; worker filesystem layers equal.
- npm production audit: 131 dependencies, 2 moderate, zero high/critical; Python production audit:
  5 dependencies, no known vulnerabilities. These checks alone miss system/global-tool advisories.
- Exact image/host inventory scanned **locally** with Grype v0.121.2 and valid 2026-11-07 database,
  offline, no Docker socket/privileged scanner or production installation. Raw/triaged results and
  vendor references are in docs/security/2026-11-07-production-dependabot-review.md.
  Confirmed kernel advisory BUG-054 remains open; package findings BUG-055 need manual review.
- Diagnostic scan attempts started before database download finished and failed with missing DB;
  retried successfully after update. Initial host scan included removed/inactive kernels; filtered
  to installed/current-kernel inventory. No blanket safety or compromise conclusion is claimed.
  Initial image metadata template lacked DB-image labels; versions were obtained separately.
- No firewall/system update, reboot, exploit, actual mailbox/account mutation or extra bootstrap.
  Known release-please run 42404700571 fails on GitHub PR-creation permission only.

## Repeat-signup confirmation hardening (2026-11-07)

- Review found BUG-053: correct club requests could be paired with an initial-choice banner.
  Own projection now reads the latest confirmed intent, including explicit no-club, while global
  signup history stays immutable. No proof secret is exposed and no club role is changed.
- Final fresh database/migration regression: **42/42** registration/unified-account cases pass.
  Additional assertions cover both a new club and a later explicit no-club choice, retaining the
  first registration, names, memberships and history. Initial targeted repeat/login browser run:
  **4/4** across laptop/iPhone WebKit. Final full browser suite: **28/28**, including the
  repeat-choice regression and updated clubless confirmation copy, passes on both platforms.
- Local unreleased function refreshed with the same final definition; schema remains **26**.
  The prior Docker migration/rollback rehearsal passed before this read-projection adjustment;
  final fresh DB tests apply the entire final migration. Static/build/schema checks remain valid.

## Explicit registration and optional club choice (2026-11-07)

- Full unit/database suite: **607/607** across **58 files**, expanded with a deterministic
  concurrent resend/verify regression to **608/608**. Includes **13 registration DB/API cases**
  plus **29 existing unified-account cases** and NL/EN registration-mail checks.
- Coverage: minimal active public club projection, origin/rate controls, verified proof before any
  account/application, expired/wrong/exhausted/replayed/cross-purpose/challenge-swapped codes,
  proof-bound club selection, archived choice recovery, idempotency and preserved account/roles.
  Registration/application/session/proof consumption roll back together on actual SQL failure.
  A real mailbox-lock wait queues resend before old verification and proves only the new club
  intent is used. Clubless registrations stay global; club actors cannot see another club's rows.
  Approval/rejection/cooldown/current status, archived global visibility and direct app-role
  table/private-helper denials are covered.
- Browser: **26/26**, laptop **1000x540** and **iPhone 13 WebKit**. Covers registration with/without
  club, result before name completion, global review/admission and retained status, directory load
  retry, explicit required choice, archive-between-code-and-confirm recovery and existing login.
  Existing users/editor/email-change/club-isolation flows also pass. Form/result/review screenshots
  inspected; document width does not overflow and visible targeted controls measure at least
  **44 CSS pixels**. No physical iPhone or authenticated production verification performed.
- Diagnostic runs retained: first account suite **28 pass/1 fail** expected the former name gate;
  next expanded run **37 pass/1 fail** needed a named profile before sporting selectors, followed
  by **38/38**. Initial browser run **16 pass/6 fail**: a synthetic preparation helper overwrote
  an edited name, an old selector matched both signup and later club request, and expected status
  text differed. Fixed fixtures/assertions; final **26/26** passes. No unrelated product fix claimed.
- Legacy feature-off full browser run: **47 pass, 75 skipped, 2 fail** in the previously documented
  lineup-selection timing symptom; isolated desktop/mobile lineup rerun **2/2** passes. Edge uses
  a separate output directory to avoid artifact collisions. Initial edge launch wrappers were
  stopped before tests while correcting output isolation/origin; the final edge run is recorded
  below. Final proxy/real-worker run: **39 passed, 23 skipped**. No server or shared production
  component was touched.
- Worker: **50/50**, Ruff lint/format and mypy pass. Deployment-script checks **77/77** plus real
  Docker first deploy, upgrade, broken-image rollback, explicit rollback and status rehearsal pass.
- Final format/lint/typecheck, feature-on build and Drizzle schema/journal checks pass. Initial static
  checks caught formatting/callback style, an optional club-header type and a redundant promise
  truthiness guard; corrected. Synthetic E2E media generation passes. Local dev migration applies
  successfully (**26 total**, direct app-role registration SELECT denied); production remains **25**,
  sha-dd71f78. The local aggregate probe was rerun from the web package after root-level package
  resolution failed. No real mailbox was used.

## Production rollout verification (2026-11-07)

- Corrected PR head f88fdab: CI **42396990030**, all **8** jobs pass. Main merge dd71f78:
  CI **42397829809** passes (policy intentionally skipped on main), images **42397829884** pass.
- Deploy **42398709787** succeeds. Public readiness: **sha-dd71f78**, DB ok; auth status:
  enabled/unified true, anonymous access false. Both RowLens web/worker run the new tag.
- Schema: **25 migrations**, up from **20**. Before/after aggregate counts match:
  **6 accounts, 6 memberships, 4 sessions, 5 videos, 7 historical people, 10 seats, 8 angles**.
  WVIJburg name confirmed; **7** historical identities remain explicitly unlinked.
- Approved hidden-input production bootstrap exits **0**; aggregate **1 platform administrator**
  and **1 bootstrap audit**, with record counts unchanged.
- All **5** shared-container IDs/start times/images match preflight exactly; trustable website,
  trustable API health and AudioScribe return **200**. No server configuration changed.
- Config tests **12/12** pass. Direct synthetic-production config probe initially omitted the
  existing required PUBLIC_ORIGIN; corrected probe matches the smoke environment and passes.
- Known release-please run **42397829796** fails due to Actions PR-creation permissions only.
  Authenticated production UI and physical iPhone were not manually verified.

## Release image authentication smoke (2026-11-07)

- CI run 42390255322 passed web, worker, edge, policy, secrets and deploy checks, but the
  web-image smoke failed at startup: unified authentication also requires production SMTP.
- Added synthetic SMTP host/credentials/sender to the isolated image smoke alongside its OTP
  pepper. No mail is sent by the health/status check; production validation remains unchanged.
- Corrected-head CI 42396990030 passed all eight jobs before merge; see rollout above.

## Full account table/editor and verified identity changes (2026-11-07)

- Full web/DB: **589/589**, then **591/591**, and final expanded suites **592/592** and **593/593** across 57 files.
  Latest focused unified-account run: **29/29**, including configured/unverified address refusal,
  direct null-proof/null-authority SQL refusal and owner confirmation. Directory unit cases cover
  every one of **17 fields** for exact filtering and both sort directions, stable tie-breaking/pages,
  unknown preferences and numeric/date ranges; mail/field focused run **45/45**.
- New API cases cover tenant-scoped rows/details/counts/club choices/requests, zero/multiple clubs,
  invalid query fields, authority assignment/revocation and concurrent withdrawal, pending email,
  wrong/expired/exhausted/replayed/stale proofs, actor revocation, configured source/destination
  addresses, protected proof storage, cross-club grant/role preservation and session revocation.
  A club initiator cannot confirm for another account: its existing owner must authenticate and
  confirm the new-mailbox code. The browser exercises this with a target holding another club's
  administrator role. No real account, mailbox or production database was used.
- Final admission race holds an actual identity advisory lock, observes confirmation and admission
  queued in PostgreSQL, releases it and requires the stale admission to fail. Reusing the old email
  for a different verified account cannot redirect a form's account-ID-bound role grant. OTP/session
  adoption, account provisioning, applications and initial-club-admin writers follow the same
  identity/mailbox/club order; existing expected-role conflicts and immutable grants remain.
- New browser matrix: **16/16** on Chromium **1000×540** and iPhone 13 **WebKit**, repeated after
  directory widening/sticky-column layout and owner-proof hardening. Includes table sort/filter,
  full preference/name/email/global-role editing, verified email/session transition, cross-club
  requests without switching and the dedicated owner confirmation page. Screenshots inspected;
  document width stays within viewport and measured controls/labels >=44px. Physical iPhone untested.
- Initial extended matrix was **10 passed/4 failed**: the harness expected a controlled confirmation
  checkbox to change before confirming, parsed an empty 201 as JSON, and used mouse compatibility
  clicks after horizontal scrolling in phone WebKit. Corrected fixture expectations, empty-body
  parsing and native touch. Next focused run **3 passed/1 failed** exposed a premature unscoped-row
  assertion while filtering; wait for the matching query response/aria-busy completion. Then full
  **14/14**, and **16/16** after adding owner confirmation. No retries/sleeps weakened product checks.
- Initial email integrations returned 500 for reserved empty arrays (BUG-048); bound text-array
  construction fixes it. Early lint found null narrowing, numeric template conversions and an
  awaited reply issue; corrected. Final lint/typecheck/format/build pass; schema generation reports
  no changes. Server parameters and SQL null guards both refuse invalid identity/authority inputs.
- Legacy local first run **46 passed/3 failed/63 skipped** while proxy E2E shared its output path:
  trace ENOENT collisions plus the known intermittent inline lineup selection symptom. Isolated
  lineup/settings repeat **6/6** passed. A later full run was stopped after a mismatched feature-on
  build was scheduled concurrently (4 passed/1 lineup fail/19 skipped/90 not run); it is invalid
  release evidence. Correct isolated feature-off/full run: **49 passed, 65 skipped**. Final auth/admin/profile/preferences/
  permission compatibility after identity-lock hardening: **16/16**.
- Full proxy regression with real worker: **39 passed, 17 skipped**. Worker **50/50**, Ruff lint/
  format and mypy pass. Deployment-script **77/77**; real Docker first/upgrade/broken-release rollback/
  explicit rollback rehearsal passed, including a repeat with the owner-confirmation functions.
- Local migration 0024 applied: **25 total**. Its unreleased function bodies were refreshed locally
  as guards hardened; fresh Testcontainers migrations test actual SQL. Readiness healthy; no
  production mutation/deployment. Local edge is stopped with its data retained after verification.

## Users directory and account-only administration (2026-11-07)

- Regression first reproduces a platform administrator's settings request without club context
  returning 404. After account-scope authorization, the new audit assertion exposed missing global
  save auditing; account reads/saves now use protected UUID-only audit events in the same transaction.
- Final full web/DB run: **546/546** across 56 files. Focused authorization/settings run: **38/38**.
  The new case edits an account with zero memberships, leaves membership empty, rejects a stale
  revision without another save event and denies the same target after platform authority removal.
  Existing club-admin boundaries and tenant settings conflict coverage remain in the focused run.
- Unified browser matrix: **10/10** at 1000×540 Chromium and iPhone 13 WebKit. The new flow edits an
  account-only user with no selected club, later admits it as a club administrator and requires that
  its Users list contains exactly its club's one member. A rower/account-only user has no Users nav;
  club admins cannot request the global directory. Account editing is absent from Clubs.
- Additional legacy feature-off admin/settings browsers: **6/6**, desktop/mobile Chromium.
- Screenshots inspected; no document overflow, control/role-label targets >=44px. Admission is folded
  on the Users page so the searchable member/account list stays visible. Late list responses use a
  generation guard. Physical iPhone not checked. Final matrix after layout polish: **10/10**.
- Lint initially rejected two void-return shorthand browser callbacks; corrected. Final format,
  lint, typecheck and feature-on build pass. No migration/dependency; local database stays at 24.
  Prior worker/proxy/deploy rehearsals were not rerun for this navigation/account-guard change.

## Club administration and reversible archiving (2026-11-07)

- Full web/DB: **544/544**, then **545/545** across 56 files after the member-list regression was
  added. Unified integration suite now has 20 cases, including actual members and role assignment,
  other-club/account-only exclusion, archive/restore audit, access denial to archived content via
  API and direct tenant SQL, account/other-club continuity and retained training history.
- Worker: **50/50**, Ruff lint/format and mypy pass. Generated schema check reports no changes.
- Final local legacy browsers: **49 passed, 57 skipped** (desktop/mobile Chromium, flags off).
- New account/admin lifecycle matrix: **8/8** on Chromium **1000×540** and iPhone 13 **WebKit**.
  Includes admission from Club administration, member role editing, creating/renaming a club,
  archiving the currently selected club and restoring the original membership. Screenshots inspected;
  no document overflow and controls/role-label targets >=44px. Physical iPhone not checked.
- A later browser rerun could not start Testcontainers' cleanup container (30s port-binding timeout
  before any test). Repeating after startup load subsided passed all **8/8**, including additional
  Club administration touch-target checks. Initial lint found two void-return shorthand handlers;
  corrected; final lint, typecheck and repository formatting checks pass.
- Deployment-script checks: **77/77**. Real Docker first deployment, migration upgrade, deliberately
  broken-release rollback and explicit previous-release rollback rehearsal passed.
- Local development database migration 0023 applied (24 total); readiness reports database healthy.
  Full local proxy regression: **39 passed, 14 skipped**, using the real worker. Edge stopped after
  verification with its data retained. No production mutation or deployment.

## Platform bootstrap regression (2026-11-07)

- Initial test fixtures omitted required display_name (2 failures); corrected synthetic fixtures.
- The real CLI subprocess then reproduced PostgreSQL 42P08: verified bootstrap failed while the
  unverified-account refusal passed. Explicit UUID typing fixes the failing audit insert.
- Final focused run: **20/20** tests pass (2 CLI integration cases + 18 unified authorization cases).
  Repeating bootstrap produces one grant and one matching audit event; no email appears in output.
  Tests use a throwaway PostgreSQL database and synthetic accounts, never the operator account.
- Lint initially rejected a void-return shorthand in the test helper; fixed with an explicit block.
  Final lint, typecheck and repository formatting checks pass.

## Unified accounts and multiple clubs (2026-11-07)

- Initial full run: 524 passed/3 failed (config/schema expectations and an empty JSON test request).
  After fixture corrections: 527/527. Expanded suite then passed 533, 535 and 538 as coverage grew;
  final suite includes 18 unified integration cases (**540/540** final full run).
- Security/lifecycle cases cover account-only/profile access, OTP single use/limits/expiry, duplicate
  and atomic decisions, cancellation ownership/cooldown, account-first admission, private feedback,
  two-club SQL/API isolation, conflicting context, forged platform flags, withdrawn global authority,
  direct membership/grant self-escalation denial, historical canonical references, legacy-session
  adoption/logout and account logout-others. Direct admission/revocation keeps applications aligned.
- Worker: Ruff lint/format, mypy and **50/50** pytest pass. Schema generation reports no difference.
  Deploy-script checks: **77 passed**; real Docker deploy/upgrade/failed-release/explicit rollback
  rehearsal passed twice (three runs, including a final-source pass).
- Full local legacy browsers: **49 passed, 53 skipped**, desktop + mobile Chromium. Early runs needed
  updated club/role labels. Edge legacy: **38 passed, 1 failed, 12 skipped**; the inline-add lineup
  case returned HTTP 201 but lost its selection under load and then passed its targeted repeat
  (**1/1**). It remains a recorded intermittent regression, not a claimed product fix.
- Unified account/club browsers: **6/6 local** (3 per device) pass on Chromium **1000×540** and iPhone
  13 WebKit. Earlier proxy run passed 4/4 before the added long-name case; **6/6** final proxy cases pass as well. Screenshots inspected; no document overflow and controls >=44 px. BUG-035 fixed
  native selector size/accessible name; BUG-036 first reproduced a long-name overflow, then passed.
- CI now runs the unified browser matrix separately with paired feature flags. Dedicated output
  directories prevent trace collisions; test artifacts, local env files and media are excluded from
  Docker build contexts. No dependency was added.
- Local dev is ready at :5174/API :3100 with UNIFIED_USERS=true and **23 migrations**. Development
  function definitions were refreshed as unreleased SQL evolved; fresh Testcontainers/rehearsal
  runs validate actual migration application, not only a locally patched database. Production was
  inspected through aggregate read-only queries only (7 unlinked people, 10 seats, 8 measurements;
  one seeded pilot club to rename). No production write/deploy or real invitation.

## Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit (web) | Vitest | base path, policies, validation, pure helpers |
| Unit (worker) | pytest | analysis math (stroke rate, phases, angles, sync), job handlers |
| Integration | Vitest + Testcontainers Postgres, media in a temp dir | API routes, permissions, **tenant isolation**, RLS coverage, tus |
| E2E | Playwright, viewports iPhone 15 / Pixel 8 / desktop, WebKit + Chromium | login, upload, playback controls, conversation |
| Analysis eval | pytest + reference clips | accuracy deltas on pipeline changes (M2) |
| Smoke | CI image build + `curl` health under base path | every PR |

Rules: every bug fix starts with a failing test; every new tenant table/route gets a cross-club test;
E2E runs with `BASE_PATH=/projects/rowlens` behind a Caddy container that mirrors prod.

## Club training permissions (#154)

Approved with "voer het plan uit". Integration fixtures use two clubs, two rowers (including a
participant who is not the creator), unrelated coach/admin, legacy ownerless sessions, old own and
private feedback, seven role combinations and actual temporary media files. Foreign rower mutations
must return 403/404 without database/file changes; staff mutations must succeed throughout the club.
A concurrent transfer test waits for a real database lock, commits ownership reassignment and checks
that the previous owner cannot append bytes. Browser coverage checks list/detail/player read-only
controls, private feedback, playback and own/staff editing, including iPhone WebKit and 1000×540.

## Central settings and role sets (#151)

- Unit: all seven role combinations and fail-closed empty roles; account-owned caches, late-response
  rejection, serialized revisions, conflict recovery and account switches.
- Real Postgres: full-field admin editing, own preferences/profile revisions, same-account/multiple
  clubs, other-club denial, immutable audit, known-only legacy import, atomic concurrent writes,
  current-session/new-login role preservation, protected server/self grants, stale snapshots and
  mutually competing admin demotions. A separate container tests a real 0017→0018 upgrade, existing
  profile/grant backfill, active bearer sessions and idempotent migration retries.
- Rower boundary: general directory and roster create/edit/archive/merge denied, RLS writes denied,
  visible-training crew only, no crew e-mails/other user IDs, own `mine` marker; existing sharing and
  assignment visibility tests retained.
- Browser: edit another member without changing admin display; account sync on focus/re-login;
  rower navigation/direct APIs and additive coach rights; preserved dirty own-profile draft across a simulated 503 focus refresh and
  conflict/reload, with explicit session rejection still clearing access; default boat; explicit legacy import; second-device preferences/account switch;
  measured 44 px editor controls, full-width identity and no document overflow.
- Current results: 492 web/DB + 50 worker tests pass; 77 deploy-script checks and Docker rehearsal
  pass. Final local E2E: 47 passed / 49 environment-specific skips. Full edge: 38 passed / 10 environment-specific skips. Local low-laptop/iPhone matrix: 6/6. Edge low-laptop/iPhone matrix: 24/24, including actual slow playback/pause, drawing/angles, stroke controls and settings. Editor controls measure at least 44 px; screenshots inspected. CI is checked on the PR.

## Coverage status

| Area | Tests | Status |
|---|---|---|
| `shared/base-path.ts` | 17 unit cases | ✅ passing |
| `server/config.ts` | 13 (defaults, normalisation, production URL/DB/SMTP, allowlist, OTP pepper, test-code isolation, invalid values) | ✅ passing |
| `server/db/tenant.ts` (`tenant.db.test.ts`, real Postgres 16) | 7: settings per transaction; nothing left on a reused pooled connection after commit and rollback (mutation-checked: session-wide `set_config` fails it); club A reads only A; can't insert into, update, delete or move rows to club B; club table shows only own club; malformed context rejected | ✅ passing |
| DB roles + schema (`schema.db.test.ts`) | 6: `rowlens_app` no superuser/BYPASSRLS/CREATEDB/CREATEROLE, owns nothing, can't CREATE or ALTER tables, can't read the migrations journal; re-migrate is a no-op; unsafe password refused; **every `club_id` table has RLS + a policy** | ✅ passing |
| Legacy pilot fallback (`pilot/{code,token,gate}.test.ts`, `rate-limit.test.ts`) | 21: retained while production can roll back; disabled when email auth is configured | ✅ passing |
| E-mail authentication (`auth/*.test.ts`, `auth/gate.db.test.ts`) | crypto purpose separation; NL/EN HTML + text; non-enumerating request; HMAC-only 10-minute codes; 5 attempts + single use; DB limits per mail/IP/verify; Secure/HttpOnly/Lax cookies; double-submit CSRF + cross-site refusal; tenant guard; current/all-other revocation; global tables denied to app role; pinned definer functions | ✅ passing |
| `/api/club` + `rowlens_club_id` (`api/club.db.test.ts`) | 5: same 404 as an unknown route without or with a forged cookie; pilot club through RLS; exact-slug lookup only, no club rows without context; pinned search_path | ✅ passing |
| E2E auth (`e2e/auth.spec.ts`, desktop + mobile) | request → wrong/correct code; session + CSRF cookie attributes; reload; sign-out; same response for known/unknown address; club API 404 without session | ✅ passing |
| Media store + sniffing (`media/{store,sniff}.test.ts`, `api/uploads.test.ts`) | 23: append/resume after a broken stream/limit without writing the crossing chunk, key validation (traversal), disk ratio; MP4/MOV/WebM magic bytes vs JPEG/PDF/zip/text; tus metadata parsing | ✅ passing |
| Sessions + tus upload (`api/uploads.db.test.ts`, real Postgres + temp media dir) | 11: sessions create/list/validate, list and detail expose `createdAt`; create → partial PATCH → HEAD → wrong offset 409 → rest → uploaded; finished upload takes no bytes; non-video rejected and deleted; refusals before bytes (size, type, metadata, tus version); chunk > 64 MB / past length / wrong type; disk ≥ 85 % pauses create and PATCH; global cap counts unfinished uploads; termination and delete remove bytes; **another club's session/video: 404 on every route, upload into it refused, nothing changed**; 404 without cookie | ✅ passing |
| Session creation time (`sessions/strings.test.ts`) | formats the database timestamp as local 24-hour time across winter and summer time | ✅ passing |
| Whole-session deletion (`api/sessions.db.test.ts`, real Postgres + temp media dir) | 2: deleting a session cascades to every video and annotation and removes every video media directory; another club's session stays a 404 and remains unchanged | ✅ passing |
| E2E upload (`e2e/upload.spec.ts`, local + behind Caddy) | create session and show its creation time on detail + list; choose a real clip + a fake .mov, camera per file, upload, fake rejected, list + status, delete one video; then delete the whole session through the inline confirmation and verify it leaves the list; club pages redirect to the gate without access | ✅ passing |
| Worker (`worker/tests`, pytest) | 44 (incl. size rule 576p → play-540 only, bitrate ceilings and fps scaling, low-bitrate sources not inflated, maxrate/bufsize in the command, probe bitrate): probe parsing (landscape/audio, iPhone HEVC portrait with display matrix and VFR, Android 90000/1 base rate, r far from average, 240 fps slow-mo, legacy rotate tag, 5 refusals); ffmpeg args (single decode split, CFR at the nominal rate, GOP = fps/4, keyint_min, no scene cuts, closed GOP, faststart, metadata stripped, no audio map without audio, renditions per source size); keys/traversal; backoff; stroke_rate | ✅ passing |
| Queue contract (`db/jobs.db.test.ts`) | 5: claim across clubs once, types and run_after respected, lease takeover then dead after the last attempt, claimed job visible only in its club, NOTIFY on insert; upload completion enqueues exactly one `video.process` job | ✅ passing |
| Edge E2E with the worker | upload → worker → "Ready" with `30 fps · 640×360 · 0:04`; renditions checked by hand: H.264 High, CFR 30, 120 frames, keyframe every 8 frames, no metadata; synthetic 4K60 HEVC portrait: upright 1080×1920 / 540×960, 180 frames, GPS stripped | ✅ passing |
| Media delivery (`api/videos.test.ts`, `api/videos.db.test.ts`) | 15 range cases (start-end, open, suffix, clamped, unsatisfiable, multi/garbage → whole); facts without keys; whole/206/suffix/416 with headers; poster JPEG; 404 for no cookie, not ready, missing rendition, unknown name, a rendition key outside the video's folder; another club's video and media 404 | ✅ passing |
| Edge E2E player on own video | upload → worker → Ready → player page: poster, 10 exact `.` steps on the H.264 rendition (Chrome), `currentTime` agrees; phone-sized Chrome: taps +1f ×12 and +0.1 s land on frame 15 = burned-in number, no horizontal overflow | ✅ passing |
| Notes API (`api/annotations.db.test.ts`, `api/visibility.db.test.ts`) | create (trimmed) → list in frame order → edit → delete; refusals (empty, > 2000, nameless pilot, negative/fractional frame, frame ≥ frame_count); signed-in author comes from the linked roster/account and a spoofed client name is ignored; 409 before processing; cascade on video delete; another club's video/notes 404 and unchanged | ✅ passing |
| Notes in video (`notes/overlay.test.ts`, `e2e/notes.spec.ts`, edge) | group/filter moments; 0.5/1/2 s hold; text chooses the corner away from drawing points; note at frame 10 appears in the picture; eye button + `N` and hold survive reload; away/back, edit and delete remove overlay + marker | ✅ passing |
| E2E player regression (`e2e/player.spec.ts`) | 20 quick presses without waiting land on frame 20 and back to 5 (BUG-004: fails 12/12 with the old `seeked` handler) | ✅ passing |
| Video page layout (manual, scripted Playwright) | WebKit iPhone 13 / 390×844: stage 358×201, note overlay 294×69, no horizontal overflow; iPhone immersive fullscreen 374×201 with the overlay inside it; low laptop 1000×540: stage 427×240, player and notes both visible. Earlier portrait/landscape checks remain. | ✅ checked |
| Drawing geometry (`drawing/geometry.test.ts`) | 6: right/straight/acute/zero angles; angles in picture pixels (a fraction "square" on 16:9 is 29.4°, not 45°); degenerate arm; fraction ↔ pixel mapping; points on the bars refused; arc direction | ✅ passing |
| Drawing API (`api/annotations.db.test.ts`) | line/arrow/angle stored with points; wrong count, out-of-range, unknown kind, note with points refused; a saved drawing moves (`PATCH { points }`, an angle keeps three, a line two), a note can't take points and a drawing no text (400 `invalid_annotation`), another club's drawing 404 and unchanged; delete and redraw still works | ✅ passing |
| E2E drawing (`e2e/drawing.spec.ts`, edge) | signed-in account supplies the author; angle with horizontal/vertical arms reads 90°; arrow; both listed; Esc leaves the tool; on their own frame only (0 shapes one frame on, the marker says where they are); back via marker; delete one. Selecting: a press on the stroke shows a ring per point, a press beside it drops them without starting the video, a dragged ring saves (0.3/0.9 after a reload). Also checked in WebKit phone/fullscreen and low laptop. | ✅ passing |
| Readiness with DB (`readiness.db.test.ts`) | 3: 200 when Postgres answers; 503 within 5 s when unreachable; 503 on a wrong password | ✅ passing |
| `server/app.ts` | 13 (health/readiness, base-path scoping, redirect, SPA fallback, API 404 JSON, asset caching, build-info mismatch, CSP, request ids) | ✅ passing |
| E2E edge (`e2e/edge.spec.ts`, via `pnpm e2e:edge`) | 6 through the Caddy mirror: 308 redirect, prefix kept, CSP + site headers, 16 MB chunk passes, AudioScribe prefix still stripped, trustable.nl still gets other paths | ✅ passing |
| `infra/deploy/rowlens-deploy` unit (`test/run.sh`, stubbed docker, Ubuntu) | 77 checks (incl. the migrate check getting the tag on a first deploy, and a failing compose config stopping the deploy — BUG-009): input validation and forced-command injection, token handling, deploy/redeploy, rollback on unhealthy or failed `up`, first-deploy failure, pull failure, DB backup + retention, migrations, rollback/status, locking | ✅ passing |
| `rowlens-deploy` rehearsal (`test/rehearse.sh`, real Docker) | first deploy, second deploy with real `pg_dump`, real migrations (journal written, `rowlens_app` without BYPASSRLS), broken release auto-rollback (exit 3), manual rollback, status | ✅ passing |
| Boat line per frame (ADR-0018) | worker `test_waterline.py` (6: hull bottom bow to stern, out of the picture, a crewless streak refused, a far candidate refused while following, a coach's line restarts the following, work size); `angles.db.test.ts` (a boat line change queues one search, bow side, the worker's rerun keeps it, another club 404, cascade); `visibility.db.test.ts` (rower reads, can't set the bow, DB refuses; other coach 404); `angles.test.ts` (`resolveBoatLine`, `measureAt`); edge `boatline.spec.ts` (found in 100% of a drawn boat clip, dotted on the waterline, bow side, correction re-queues and finds again) | ✅ passing |
| `client/player/zoom.ts` | 4: clamp to 1–6× and to the picture's edges, zoom keeps the point under the cursor, pan and screen-to-picture mapping, viewBox of the view | ✅ passing |
| Moving a saved drawing (#141, `e2e/angles.spec.ts`, `e2e/boatline.spec.ts`, edge) | a corner of a saved knee angle dragged straight down turns 90° into 180° in the picture and in the table, and the crew difference into 0°; the ends of the line the worker found are dragged, which leaves a coach's line on that frame that wins (`drawing--boat` in place of `drawing--auto`) | ✅ passing |
| E2E zoom (`player.spec.ts`, `drawing.spec.ts`) | + key and button to 225%, only the video transformed and the stage unmoved, frame keys and buttons still step, a drag pans without playing, level button / 0 back to the whole picture, − disabled at 100%; two-finger pinch (CDP multi-touch, mobile Chromium) zooms 3× without zooming the page; edge: a line tapped on the 225% view lands where tapped and is the middle 0.4/2.25 of the picture after reset (also with a finger on iPhone WebKit) | ✅ passing |
| `client/player/frames.ts` | 24: round-trips for every frame at 24–240 fps and 59.94, presentation timestamps at 1 ms / 1/15360 / 1/90000 precision, clamping, ±seconds, time format, loop range and jump | ✅ passing |
| E2E player (`e2e/player.spec.ts`, VP9 fixture, desktop + mobile Chromium) | 6: ±1 frame over 20 frames and back across keyframes (readout and `currentTime` agree), buttons ±1f/±0.1s/±1s and bounds, speed buttons, loop at 0.25×/0.5×/1× stays ≤ 1 frame past its end | ✅ passing |
| E2E smoke (`e2e/smoke.spec.ts`) | 3 × desktop + mobile Chromium (home + API under base, deep link shell, nothing outside base) | ✅ passing |
| `stroke_rate` | 8 (even rhythm, NTSC fps, refusals, invalid input) | ✅ passing |

## Runs

| Date | Branch | Command | Result |
|---|---|---|---|
| 2026-11-06 | codex/feat/154-club-training-readonly | Final compatibility re-verification | **522 web/DB passed (30 new permission tests)**; format/lint/typecheck/build and Drizzle consistency check passed (no extra migration). Worker 50 and deploy-script 77 remain green; repeated real local Docker deploy/rollback rehearsal passed with the revised 0019. Full local E2E again **49 passed/49 skipped**, full edge **39 passed/10 skipped**; local iPhone WebKit/1000×540 settings/permissions **6/6**, edge permissions/drawing/angles/playback/strokes **14/14** after the final context change. Scratch local-matrix invocation initially referenced a removed config and exited before tests; corrected ignored config passed 6/6. Dev data retained with 20 migrations; revised edge migration bootstrapped fresh; final edge stack stopped. No production action. |
| 2026-11-06 | codex/feat/154-club-training-readonly | Upgrade/rollback context compatibility | New legacy-image regression first failed because an ownerless training was newly visible although legacy media handlers assumed write access. Fixed transaction capability keeps absent-context legacy reads/writes aligned and enables the approved split only for new handlers; unknown mode is denied. Focused permission suite **30 passed**; generated-schema check reports no changes. Prototype self-lookup SELECT policy broke INSERT RETURNING and was replaced by row-local conditions, verified by training creation regressions. Full backend/local/edge retesting in progress; no production changes. |
| 2026-11-06 | codex/feat/154-club-training-readonly | Final verification | **520 web/DB + 50 worker passed**; format/lint/typecheck/build, Ruff/check-format/mypy, **77 deploy-script tests** and real local deploy/rollback rehearsal passed. Full local E2E **49 passed/49 skipped**, full edge **39 passed/10 skipped**. Local iPhone WebKit/1000×540 settings/permissions **6/6**, edge permissions/playback/drawing/angles/stroke matrix **14/14**, including live role promotion/demotion and private-feedback refresh. Isolated iPhone 0.25× diagnostic rerun 3/3 passed; final tests await persisted drawings instead of tapping the still-empty video. Screenshots reviewed; document width within viewport on phone and low laptop. Local dev ready with 20 migrations; edge stopped. No production change. |
| 2026-11-06 | codex/feat/154-club-training-readonly | Full backend/local verification and browser diagnostics | 520 web/DB tests passed (28 new permission cases), 50 worker passed with Ruff/mypy; format/lint/typecheck/build, 77 deploy-script checks and deploy/rollback rehearsal passed. Full local E2E 49 passed/49 skipped; local iPhone WebKit +1000×540 settings/permissions 6 passed. Slow-stream regression first failed on the normal 15 s idle timeout, then passed with persisted progress after 16 s. First full local: 48 passed/1 failed (asynchronous rower fixture not yet selected); corrected run 49/49 skipped. First edge: 38 passed/1 failed/10 skipped (same fixture race, empty lineup); first edge matrix 13 passed/1 failed (saved drawing not yet loaded before tap), isolated iPhone 0.25× 3/3 passed; tests now explicitly await completed selections/persisted drawings. Final edge results are in the later verification row. A subsequent matrix hit the known local 60-upload/hour limit (confirmed alert), was interrupted and rerun after restarting only the local edge rowlens-web; the clean matrix passed 14/14. |
| 2026-11-06 | codex/feat/154-club-training-readonly | Approved implementation, permissions and concurrency | Initial full web/DB: 518 passed; worker: Ruff/check-format/mypy and 50 pytest passed. New permission suite: 27 passed, including seven role combinations and concurrent ownership transfer. Existing visibility: 21 passed after updating obsolete scope expectations. Initial red suite: 12 failed/5 passed; prototype transfer test failed with unauthorized 204, then passed with refusal/bytes preserved. Local focused browser: 2 passed after correcting test selectors. Final full/browser matrix pending. |
| 2026-11-06 | codex/feat/154-club-training-readonly | Read-only inspection of session/video/lineup/feedback RLS, API mutation/media paths and client permissions; proposal format/diff checks | Proposal only. Planned: club-wide rower reads, foreign-training mutation refusals with data/media preserved, own rower rights, unrelated coach/admin edits of all club trainings, cross-club isolation, role combinations, private feedback and WebKit/low-laptop playback. Fully read-only foreign feedback confirmed; revised plan/migration approval pending, no application changes. |
| 2026-11-06 | codex/feat/151-admin-user-settings | Approved implementation: format/lint/typecheck/build; full web/DB; worker; deployment tests/rehearsal; local and edge E2E; low laptop and iPhone WebKit settings matrix | 492 web/DB and 50 worker pass; 77 deploy-script checks/rehearsal pass. Full edge 38 passed / 10 skipped; focused Chromium 6/6 and local low-laptop/iPhone 6/6. Final full local: 47 passed / 49 skipped; full edge: 38 passed / 10 skipped. Final local low-laptop/iPhone matrix: 6/6; final edge low-laptop/iPhone regression matrix: 24/24 (settings, angle drawings, actual 0.25×/0.5× playback and pause, stroke marks/removal/fullscreen). Screenshots inspected; control heights ≥44 px, identity width >200 px and no page overflow. Role draft regression (BUG-031): baseline failed on the unchecked Coach choice after profile save; keep explicit drafts/snapshots and verify 409/reload after a competing admin change. Final focus-refresh correction (BUG-030): 12 Chromium and 10 low-laptop/iPhone cases pass, including a simulated 503 preserving the open draft and an explicit access rejection clearing it. Edge DB has 19 migrations and readiness DB ok; edge stopped after tests. Diagnostic runs: initial auth-function count needed updating; new UI label selectors and role-save completion wait corrected; phone editor flex/native-select sizing fixed (BUG-029); an old sharing-spec scalar-role selector updated. One parallel local/edge run collided in the default Playwright trace directory (ENOENT); subsequent runs use separate output directories. |
| 2026-11-06 | codex/docs/151-user-settings-plan | Inspect header, rowers route/API guards and manage_roster policy; document rower navigation; format/diff checks | Proposal only, no functional changes. Planned coverage: rower-only Trainings/own settings, absent Rowers/Admin links, direct-route/API/DB refusal, safe training crew lookup and combined-role access. |
| 2026-11-06 | codex/docs/151-user-settings-plan | Inspect current scalar role in schema/auth/can/client/RLS; update proposal; documentation format/diff checks | One central user register confirmed; proposed simultaneous role sets and account-wide preferences. No application/SQL changes or functional tests; architectural approval still required. Planned coverage includes all 7 non-empty role combinations and tenant/last-admin isolation. |
| 2026-11-06 | codex/docs/151-user-settings-plan | Read-only inventory of admin/profile/auth/RLS and browser preferences; documentation format/diff checks | Proposal only; no application, SQL or production changes. Implementation/functional tests await architectural approval for #151. |
| 2026-11-06 | codex/feat/85-inline-stroke-tools | Format/lint/typecheck/build; pnpm test; worker checks; local/edge E2E; strokes matrix on 1440×900, 1000×540, iPhone 13 WebKit | 451 web + 50 worker passed; full edge 36 passed / 10 skipped; final strokes matrix 12/12 passed (NL/EN per-moment removal, cancel/failure, next-catch preservation, loose marks/reload; quick tools, suppressed compatibility click, keyboard/fullscreen, 44 px controls, table scroll/overflow and selected/unselected contrast). Initial 12-case functional matrix passed; screenshot review exposed table scrolling (BUG-027), then an intermediate stricter run had 8 passes / 2 contrast-assertion failures / 1 interrupted / 1 not run: corrected the selected-vs-unselected assertion and selected fullscreen styling before the final 12/12 run. Final local E2E 43 passed / 49 edge-only skipped; 2 isolated iPhone visual checks passed. Final CSS refinements (numeric header wrapping and immediate fullscreen selection) are covered by the subsequent 12-case matrix and screenshots. |
| 2026-11-01 | claude/chore/17-phase-0-foundation | `pnpm test`, `uv run pytest` | 19 + 8 passed |
| 2026-11-01 | claude/feat/19-web-app-skeleton | `pnpm test`, `pnpm --filter @rowlens/web e2e` | 38 passed; 6 passed |
| 2026-11-01 | claude/test/22-local-edge-stack | `pnpm edge:up && pnpm e2e:edge` | 8 passed, 1 skipped |
| 2026-11-01 | claude/feat/25-manual-deploy | `infra/deploy/test/run.sh` (Ubuntu), `rehearse.sh` | 71 passed; rehearsal passed |
| 2026-11-01 | claude/feat/51-player-demo | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge` | 62 passed; 18 passed; 8 passed |
| 2026-11-01 | claude/feat/31-database | `pnpm test`, `pnpm e2e:edge`, `run.sh`, `rehearse.sh` | 79 passed (16 db); 8 passed; 71 passed; rehearsal passed |
| 2026-11-01 | claude/feat/60-drawing | `pnpm test`, local + edge E2E, drawing+notes ×5, local stack (iPhone WebKit, laptop) | 180 passed; 28 + 14 passed; 10 passed; checked |
| 2026-11-01 | claude/fix/laptop-portrait-layout | `pnpm test`, worker `pytest`, local + edge E2E, layout script (3 laptop sizes + iPhone) | 170 passed; 38 passed; 28 + 13 passed; layout checks passed |
| 2026-11-01 | claude/fix/ios-player-half | `pnpm test`, local + edge E2E, WebKit/Chrome layout script, store test ×15 | 170 passed; 28 + 13 passed; layout checks passed; 15/15 |
| 2026-11-01 | claude/feat/59-frame-notes | `pnpm test`, local + edge E2E, player spec ×3, notes spec ×10 | 170 passed; 28 + 13 passed; 42 passed; 10 passed |
| 2026-11-01 | claude/fix/47-rendition-size | worker `pytest`, edge E2E, size check in the worker image | 37 passed; 12 passed; 576p 0.78 Mbit/s → 1.7×, 4K60 40 Mbit/s → 0.14× |
| 2026-11-01 | claude/feat/49-player-own-videos | `pnpm test`, local + edge E2E | 164 passed; 26 + 12 passed |
| 2026-11-01 | claude/feat/47-worker-transcode | `pnpm test`, worker `pytest`, local + edge E2E, `rehearse.sh` | 145 passed; 33 passed; 26 + 12 passed; rehearsal passed |
| 2026-11-01 | claude/feat/45-upload | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge`, `rehearse.sh` | 140 passed (32 db); 26 passed; 12 passed; rehearsal passed |
| 2026-11-01 | claude/feat/84-access-code | `pnpm test`, `pnpm --filter @rowlens/web e2e`, `pnpm e2e:edge` | 104 passed; 22 passed; 10 passed |
| 2026-11-01 | claude/feat/31-database (CI fix) | `pnpm --filter @rowlens/web e2e` (server with Testcontainers Postgres) | 18 passed, 12 edge-only skipped |
| 2026-11-01 | codex/feat/delete-session | `pnpm test`; format/lint/typecheck/build; `playwright test e2e/upload.spec.ts`; manual local UI at laptop + 390×844 | 191 passed; checks/build passed; 4 passed; deletion and creation timestamp checked |
| 2026-11-01 | codex/feat/28-30-email-auth | format/lint/typecheck; web + Postgres integration; worker checks; production build; local + edge desktop/mobile Playwright; deploy suite + rehearsal; local stack + browser | checks passed; 207 web + 44 worker + 30 local E2E + 15 edge E2E passed (8 edge-only skipped locally); deploy 77 + rehearsal passed; OTP login checked locally |
| 2026-11-02 | claude/feat/ui-classical | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; local E2E on iPhone 13 WebKit (scratch config adding the device); video sizes on the local stack (375×812, 1000×540, 1440×900, landscape + portrait) | 378 passed (incl. 30 contrast checks, month grouping, crew text); 38 passed; 21 passed (8 skipped); 19 passed (10 edge-only skipped); landscape 343×193 / 427×240 / 985×554 (≥ baseline), no horizontal scroll |
| 2026-11-02 | claude/feat/ui-language | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; iPhone 13 WebKit; switch checked in the browser (instant, saved, `<html lang>`) | 381 passed (new: language default/storage, mail language); 38 passed; 21 passed; 18 passed + 1 flake (BUG-012, 3/3 on rerun) |
| 2026-11-03 | claude/feat/video-page-layout | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; iPhone 13 WebKit; video sizes before/after on the local stack | 385 passed; 38 passed (BUG-013 twice before that); 21 passed; 18 + BUG-012 once (player spec alone 3 × 7); landscape 985×554 / 427×240 / 343×193, portrait 433×770 / 231×410 / 274×487, all equal to main; at 1000×540 the player column now fits the screen (512 px, was 587); no horizontal scroll |
| 2026-11-03 | claude/feat/85-stroke-marks | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (new `strokes.spec`); layout on the local stack with marks | 404 passed (new: stroke maths, `mark_strokes`, stroke mark DB + roles); 38 passed; 22 passed (two earlier edge runs had timeouts in unrelated specs under load average 17, see DOCUMENTATION); 1000×540 player column 512 px with ticks, video 427×240; phone table fits 313 px, page 375 |
| 2026-11-03 | claude/feat/stroke-arrows-drive-middle | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (`strokes.spec` extended: arrows per kind, calculated middles at 20/58/93 only when on); shapes checked on the local stack | 407 passed (new: drive middle, per-device switch); 38 passed; 22 passed; arrows, tick and circle render as intended |
| 2026-11-03 | claude/feat/angle-measures | format/lint/typecheck; `pnpm test`; local E2E; edge E2E (new `angles.spec`); by hand on the local stack (boat line, Ivo's knee 90°, label on the picture); layout 1000×540 and phone | 423 passed (new: angle maths and lean against the boat line, phases, tables, crew range; angle DB incl. merge; roles); 38 passed; 23 passed; tabs fit 305/343 px, video unchanged; BUG-015 noted |
| 2026-11-03 | claude/feat/boat-lines-touch-drawing | format/lint/typecheck; `pnpm test`; local E2E; edge E2E ×4; iPhone 13 WebKit touch check on the edge stack (scratch spec: three finger taps → 90°, nothing saved before Save, Save stores it) | 427 passed (new: `boatLineAt`, per-line upper body, `dragPoint`, `isTap`); 38 passed; edge 23/23 once, other runs 21/23 with failures in unrelated specs under load (BUG-016); WebKit touch passed. Dragging with a finger can't be simulated in WebKit emulation; dragging is covered with the mouse |
| 2026-11-05 | claude/docs/opencode-handoff | `opencode.json` against https://opencode.ai/config.json (jsonschema, draft 2020-12); `opencode debug config --standalone` with the CLI bundled in OpenCode Desktop 2.2.5; paths named in AGENTS.md checked to exist; prettier | 0 schema errors; opencode reads the project config (26 permission rules in order, instructions `docs/HANDOFF.md` and `PLAN.md`) and the `.opencode` folder |
| 2026-11-04 | claude/feat/jump-stroke-moments | format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; by hand on the local stack (jumps, quick taps, 1440×900, 1000×540, 375×812, no horizontal scroll) | 448 passed; 43 passed; 26 passed (`strokes.spec`: off with the hint without marks, back and forth, quick taps) |
| 2026-11-04 | claude/feat/auto-boat-line | worker ruff/mypy/pytest; format/lint/typecheck; `pnpm test`; local E2E (player-demo build); edge E2E; spike and worker container on three local club videos; by hand in the browser (dotted line, status, bow side) | worker 50 passed (new `test_waterline.py`, 6); web 448 passed (new: auto line API, requeue, bow side, rower and cross-club, `resolveBoatLine`, `measureAt`); local 43 passed; edge 26 passed (new `boatline.spec`); worker found lines in 1228/1228, 1794/2604 and 2885/3525 frames, 2–4 s per video; on 48 sampled frames 3 wrong lines (front views, a wake) |
| 2026-11-03 | claude/feat/video-zoom | format/lint/typecheck; unit; local E2E (player-demo build); edge E2E; iPhone 13 WebKit (player spec; drawing/angles on the edge stack with touch); by hand in the browser (buttons, keys, drag, ⌘ + wheel, stepping while zoomed) | 317 unit passed (new `zoom.test.ts`); 43 local E2E passed (new: zoom keys/buttons/drag, two-finger pinch on mobile Chromium); edge 24/25, the lineup failure was a test searching by a prefix shared with earlier runs (fixed, then passed); WebKit: player 8 passed, zoomed drawing with a finger passed; angles boat-line taps and BUG-012 fail on WebKit on `main` too (BUG-017) |
| 2026-11-03 | claude/feat/profile-session-page | format/lint/typecheck; `pnpm test`; local E2E (new `profile.spec`; sign-in fills the name once; the lineup fold is opened first); edge E2E; by hand on the local stack (welcome card, list line, session page order, add button width) | 439 passed (new: profile, rename, boat on create, `can(rename_session)`, `formatCreatedDay`); 40 passed; edge 22/24 with the known load flakes (BUG-016, first step key) |
| 2026-11-02 | codex/feat/106-notes-in-video | format/lint/typecheck/build; `pnpm test`; worker checks; local player E2E; edge E2E; WebKit phone/fullscreen + 1000×540 measurements | 385 web + 44 worker passed; 38 local E2E; 21 edge E2E (8 edge-only skipped locally); no overflow, overlay inside picture |
| 2026-11-05 | opencode/feat/141-draggable-drawings | format/lint/typecheck; `pnpm test`; worker ruff/format/mypy/pytest; local E2E (player-demo build); edge E2E; iPhone 13 WebKit touch check on the edge stack (scratch spec: tap-select, tap-beside, bar height) and 1000×540 layout | 451 passed (new: move/refuse DB tests); worker 50 passed; 43 local E2E passed; edge 28 passed (10 skipped); iPhone: a touch tap selects, a tap beside drops it (also proved BUG-018/019 first); drawing bar 48 px on a 358×201 picture (was 98 px), 52 px of 426×240 at 1000×540; the measurement bar with the rower and joint is the one thing that still needs a second row on a phone (≈84 px) |
| 2026-11-05 | opencode/docs/141-deploy | `pnpm e2e:edge` for `strokes.spec` ×4 after fixing BUG-020; CI `edge` job | 4 × passed locally; the first CI attempt on this docs PR failed the strokes catch jump (BUG-020, fixed), the second was cancelled by the 20-minute job timeout while generating the demo media under a slow runner; final head `dcc6cb5`: all 8 CI jobs passed (run 42058782838), including edge |
| 2026-11-05 | codex/docs/143-handoff-review | `vitest run --project unit src/shared/strokes.test.ts`; inspection of PR #143 head `dcc6cb5`, CI run 42058782838; local web HTTP check | 9 unit tests passed; all 8 CI jobs succeeded, including web, worker and edge; local :5174 returned 200. No new full E2E, WebKit or layout run during takeover; no application changes |

| 2026-11-05 | codex/fix/141-unobstructed-editing | format/lint/typecheck; `pnpm test`; worker ruff/format/mypy/pytest; player-demo build + local E2E; focused editing matrix (1440×900, 1000×540, iPhone 13 WebKit); measured screenshots in normal/fullscreen | 451 web + 50 worker passed; 43 local E2E passed (35 edge-only skips); 29 full edge E2E passed (10 skips); 21 focused E2E passed. Earlier baseline: 6/6 desktop, 7/12 low-laptop/WebKit (BUG-021 obstruction, off-screen test input and BUG-012 fast-seek setup); a subsequent artifact-cleanup collision passed when rerun alone. Final matrix: all controls 44 px high; zero horizontal overflow; low-laptop picture 427×240, iPhone picture 358×201; measurement strip fully below picture (106/100 px), inside fullscreen too. Native touch taps tested; drags use the mouse API, not a physical iPhone finger. BUG-012 remains open |

| 2026-11-05 | codex/fix/bug-022-playback-controls | Demo/worker H.264 timing probes in Chrome and iPhone WebKit at 0.25/0.5/1×, normal and looped; initial playback spec (2 Chrome cases) and three single-case pause probes; final `playback.spec.ts` on exact production source `5ef325b` built locally, 1440×900 / 1000×540 / iPhone 13 WebKit; format/lint/typecheck | All probes observed the selected rate and a stable media clock after pause; initial 2 cases and the three pause probes passed; final 9/9 cases passed. Includes actual touch taps after drawing/selection, mouse point dragging and changing rates while playing. BUG-022 remains in progress: physical iPhone failure not reproduced; no application fix. New tests are committed locally only, not added to a PR |

| 2026-11-05 | codex/fix/bug-022-playback-controls | Missing-compatibility-click regression before/after pointer-release activation; format/lint/typecheck/build; `pnpm test`; worker checks; local E2E; three-device editing/playback matrix | Missing-click model: 1 WebKit failure before the change (0.25× stays unselected), then 12 playback cases passed. Final full editing/playback matrix 33/33 passed, including Enter/Space, native WebKit taps, drawing movement and fullscreen. 451 web + 50 worker tests passed; local E2E 43 passed, 43 edge-only skipped. Full edge: 32 passed, 1 upload test hit the accumulated local hourly limit (429); after restarting only the local RowLens edge web container, that test passed in isolation. Physical iPhone confirmation still pending; this models a matching activation failure and does not prove the original Safari cause |

| 2026-11-05 | codex/feat/85-remove-stroke-marks | format/lint/typecheck; `pnpm test`; worker ruff/format/mypy/pytest; demo build + local E2E; full edge; strokes matrix in NL/EN on 1440×900, 1000×540 and iPhone 13 WebKit; screenshot/44 px confirmation checks | 451 web + 50 worker passed; 43 local E2E passed (47 edge-only skipped); 35 full edge passed (10 skipped); final strokes matrix 9/9 passed, then 3/3 NL size checks passed after increasing confirmation buttons to 44 px. Deletion/cancel/failure, off-cursor frame targeting, orphan marks, reload persistence and timeline/timing updates covered; no horizontal overflow and controls ≥44 px. Before implementation, the new removal test timed out on the missing editor. Initial matrix: 8/9, with existing BUG-012 quick-key setup (frame 8 instead of 10); setup now waits per frame, dedicated quick-press test unchanged, BUG-012 remains open |

| 2026-11-05 | codex/fix/141-direct-drawing-points | format/lint/typecheck; `pnpm test`; worker checks; demo build + local E2E; drawing/angles matrix; full edge | 451 web + 50 worker passed; 43 local E2E passed (47 edge-only skipped); 35 edge E2E passed (10 skipped). All 12 drawing cases passed across 1440×900, 1000×540 and iPhone 13 WebKit; all 3 angle cases passed after resampling the completed stage's screen box (the initial low-laptop assertion used its pre-strip position). Checks cover visible first point with no controls, no menu after partial angles, controls only after completion, adjustment/save/reload and fullscreen. An isolated iPhone drawing rerun also passed for screenshot QA (visible first dot, no strip). The pre-change regression failed because the first point opened the progress strip |

## Playwright prompts

### Player spike (#51)

Prompt used: "Player demo first" — a dev-only demo with clips whose frames show their own number;
verify stepping, ±0.1 s/±1 s, speeds and loop in the browser, then in Playwright.

Found while testing (all fixed, see ADR-0007 "Spike results"): loop overshoot of ~60 frames at 1×
(seek while playing + re-seeking every frame); frames floored from millisecond-rounded WebM timestamps
landing one frame early; a stale step target after such a mis-mapped frame; the demo chunk shipping in
production builds (object-property flag, bracket env access, Rolldown emitting eliminated chunks).
Measurement caveat: the in-app browser pane, when hidden, doesn't paint, so rVFC stops; time only on a
visible page or headless Playwright. Real Chrome (H.264) results are in ADR-0007; phones still to do.

### Deploy script (#25)

Mutation check: with the `|| return 1` after `compose up` and the image-tag check in `wait_ready`
removed, the "failed 'up' is not mistaken for success" test fails (2 checks). Found by writing the tests:
`start_tag` runs inside `if`, where bash ignores `set -e`, so a failed `up` with the old container still
healthy was recorded as a successful deploy. The rehearsal then hit that exact situation for real (missing
image) and rolled back correctly. Also found: the script file lacked its executable bit in git.

### Edge stack (#22, partial)

Prompt used: "Add a local Caddy stack that mirrors the prod route" — check, through Caddy, that the
proposed RowLens route redirects the bare path, keeps the prefix, keeps our CSP next to the site-wide
headers, passes a tus-sized chunk, and leaves AudioScribe's prefix stripping and the trustable.nl default
route unchanged.

Findings: Caddy's `max_size` didn't return 413 for a 65 MB POST that the app answered without reading
(backstop only, see ADR-0003); trustable.nl's `Permissions-Policy` blocks the microphone for RowLens.

### Web skeleton smoke (#19)

Prompt used: "Playwright test that proves the SPA works under /projects/rowlens: home renders and fetches
/health/live through the base path, every same-origin request stays under the base path, a deep link
gets the app shell and client-side navigation back home lands on the canonical trailing-slash URL, and
nothing is served outside the base path."

Finding while writing it: React Router with basename `/projects/rowlens` turned `<Link to="/">` into the
non-canonical `/projects/rowlens`; fixed by giving the router basename `/projects/rowlens/`.


## Final unified-user verification notes — 2026-11-07

- `pnpm format:check`, lint, typecheck and the last full `pnpm test` pass: **540 tests, 55 files**.
  This adds 18 integration cases to the prior 522, without a new runtime dependency.
- `VITE_FEATURE_PLAYER_DEMO=true VITE_FEATURE_UNIFIED_USERS=true pnpm build` passes. Paired flags are
  also wired through the Docker build; production remains off by default. New browser config runs
  3 flows per device: applicant/admission/club switching, platform management/old-route retirement,
  and long-name header constraints. Local **6/6**, proxy **6/6** passed; screenshots inspected.
- The final admin review added explicit account-first self/last-admin/server-managed protections and
  tested an independent global admin holding an ordinary rower club membership. Platform elevation
  uses persisted SQL checks and logs actual resource UUIDs with the real actor. Direct admission
  does not report a failed invitation or claim to delete an account; activity with no club evidence
  is explicitly unknown. No real invitation was sent.
- Legacy local full: 49 passed/53 skipped. Legacy proxy first full: 38 passed/1 transient lineup
  selection failure/12 skipped; targeted repeat passed 1/1. Final full proxy rerun: **39 passed, 13 skipped**, no failures. Browser startup collisions and fixture missing author metadata
  during development were diagnostics, not concealed successful runs.
- No physical iPhone gesture check was performed; WebKit simulation and screenshots were used.

Final proxy regression rerun passed **39/39** (13 deliberately skipped) on the final feature-off image; the earlier transient lineup failure did not recur. The edge stack was stopped with data retained.

PR [#157](https://github.com/ewoutbarendregt/rowlens/pull/157) contains the verified implementation; CI status is attached to the PR. No merge or deployment is authorized.


## PR #157 CI follow-up: durable upload acknowledgement

Run **42367425246** failed its web unit/DB step: **538 passed, 2 failed**, both in uploads.
The completion reply could arrive before its transaction committed (job query saw no row), and an
immediate termination could still see the busy slot (423). These were actual scheduling races,
not GitHub billing. Other early jobs (policy, secrets, worker) passed.

A deferred PostgreSQL constraint trigger holds the actual processing-job COMMIT behind an advisory
lock. The new regression failed before the fix because HTTP acknowledgement had already arrived;
with the fix it remains pending until commit, then the job is visible and immediate termination
succeeds. No sleep/retry was added to hide the response-order bug. Test cleanup removes only its
own trigger/function from the disposable test database.

Final local recheck: uploads **13/13**, full web/DB **541/541** (55 files), lint/typecheck and flagged
build pass. Focused upload + training-permissions browser rerun: **6/6 desktop/mobile Chromium**.
The 6 local + 6 proxy account/club WebKit/laptop results and worker/deployment checks above remain
valid; no frontend, worker, permission policy or migration changed in this repair. A fresh CI run
on PR #157 validates the correction on Linux.


Final context hardening: explicit per-request club selection is required when more than one club
is available; account operations and one-club compatibility remain unchanged. The 18 focused
integration cases and all 6 unified laptop/iPhone browser cases pass after this guard change. The
preceding CI run **42368018365** passed its web job (including the upload fix, legacy browser suite
and new WebKit matrix) and deploy-script; the new PR head gets its own complete CI run.
