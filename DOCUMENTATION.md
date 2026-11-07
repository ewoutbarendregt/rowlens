# DOCUMENTATION

Agent work log, newest first.

## 2026-11-07 — Diagnose registration gap and propose explicit signup

**Session**: codex/feat/registration-onboarding
**Changed**: docs/plans/registration-onboarding.md, BUGS.md, PLAN.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Traced BUG-052: the combined OTP login creates no club request; club choice is delayed behind verification/name completion, while request views omit clubless registration. Read-only production aggregates show 6 verified member accounts and no pending applications. Prepared a concrete signup/optional-club/verified-registration plan with an additive protected auth migration and global versus club-scoped review; awaiting architectural approval. No application code, production data or mail was changed; no tests run for this analysis-only change.
**Prompts used**: "ik heb een nieuw email adres ingevuld op productie: [personal email omitted], maar ik zie geen nieuwe aanvraag als ik inlog als rowlens beheerder. ook kan ik geen club kiezen als nieuwe gebruiker. ik denk dat er een apart formulier nodig is voor nieuwe gebruikers waar zij een email adres invullen en kiezen voor welke bestaande club zij zich aanmelden (of geen enkele club). de aanvraag gaat dan naar de clubbeheerder. de rowlens beheerder ziet sowieso alle aanvragen". Personal email omitted to comply with the repository's prohibition on committed personal data.

## 2026-11-07 — Merge and deploy unified users; bootstrap production administrator

**Session**: codex/docs/157-unified-users-release
**Changed**: DOCUMENTATION.md, docs/HANDOFF.md, docs/runbooks/server-setup.md, TEST.md, PLAN.md, FEATURES.md
**Summary**: Merged PR #157 after corrected-head CI 42396990030 passed all eight jobs. Merge dd71f78 passed main CI 42397829809 and images 42397829884; deploy 42398709787 successfully released sha-dd71f78 with unified accounts enabled and migrations 0020–0024 (25 total). Readiness/database/auth status passed; all 6 accounts, 6 memberships, 4 sessions, 5 videos, 7 historical people, 10 seats and 8 angles were preserved. Seven historical identities remain deliberately unlinked pending explicit real-account mapping. Shared-container IDs/start times/images were unchanged and all three neighbouring public services returned 200. With Ewout's explicit approval, executed the shown image-bound operator bootstrap using only his hidden terminal email input: exit 0, one platform administrator and one bootstrap audit; no email, secret or server configuration was recorded/changed. Authenticated production UI and physical iPhone were not manually verified.
**Prompts used**: "merge en deploy"; "Ja, ook mijn productieaccount RowLens-beheerder maken"; "ga verder"; "done".

## 2026-11-07 — Complete enabled-auth release smoke configuration

**Session**: codex/feat/unified-club-users
**Changed**: .github/workflows/ci.yml, TEST.md, BUGS.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: CI caught missing SMTP fixtures after unified authentication was enabled in release images. Added synthetic mail configuration to the isolated smoke check without relaxing production validation or changing server settings; merge/deploy remains gated on fresh green CI. Ewout also explicitly approved the previously shown one-time production platform-admin bootstrap, with the account email entered only through a hidden terminal prompt after deployment.
**Prompts used**: "ga verder"; "Ja, ook mijn productieaccount RowLens-beheerder maken".

## 2026-11-07 — Enable unified accounts in the authorized production release

**Session**: codex/feat/unified-club-users
**Changed**: .github/workflows/images.yml, .github/workflows/ci.yml, BUILD.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Ewout requested merge/deploy after all eight CI jobs passed on ce6c014. Release images now explicitly enable the paired client/runtime unified-user flag; CI builds the same image and checks its enabled unauthenticated account status with a synthetic smoke-test pepper. Docker defaults remain off for optional local/legacy builds; no server environment/configuration change is needed. Await fresh green CI before the authorized merge/deploy.
**Prompts used**: "merge en deploy".

## 2026-11-07 — Implement the scoped user table and complete verified account editor

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/shared/user-directory{,.test}.ts, apps/web/src/client/{App.tsx,api.ts,env.ts,styles.css,admin/AccessPage.tsx,admin/UsersPage.tsx,admin/UserEditor.tsx,admin/EmailChangePage.tsx,admin/directory-strings.ts,admin/strings.ts}, apps/web/src/server/{api/access.ts,auth/account-management.ts,auth/unified-gate.ts,auth/unified-gate.db.test.ts,auth/mail.ts,auth/mail.test.ts,db/schema.ts,db/grant-platform-admin-cli.ts,db/migrations/0024_account_management.sql,db/migrations/meta}, docs/adr/{0023-user-directory-and-identity-management.md,0019-user-settings-and-role-sets.md,README.md}, docs/plans/user-directory-and-account-editor.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Implemented a 17-field filterable/sortable paged user table, configurable columns and complete account/profile/preferences/club-role/global-role/email editor. Approved migration 0024 adds protected expiring identity proofs, scoped projections and serialized global authority; club-initiated email changes require the existing account owner to confirm, preventing other-club/global account takeover. Preserved history/grants, reserved identities, conflict checks, actual actor audit and feature-off compatibility. Account-ID-bound role grants and coordinated identity/mailbox/admission locks prevent a concurrently changed or recycled email from receiving another account's intended grant. Checks: 593 web/DB, latest 29 focused identity cases, 16 laptop/iPhone WebKit, 49 legacy local plus final 16 auth/permission compatibility cases, 39 proxy, 50 worker, 77 deploy-script and real Docker migration/rollback rehearsal pass; diagnostic failures are retained in TEST.md. Local stack has 25 migrations; no real account mutation, production action, merge or deployment.
**Prompts used**: "Ja, voer het volledige plan uit" (approval of docs/plans/user-directory-and-account-editor.md). Original request: "de tab gebruikers geeft alle gebruikers in tabel/list view, filterbaar en sorteerbaar op alle velden. het editen van een gebruiker toon een form waar alle attributen van die gebruiker te beheren zijn(naam, email, rol, overige voorkeuren). de clubbeheerder ziet alleen gebruikers en aanvragen voor zijn club, de rowlens beheerder ziet alle gebruikers".

## 2026-11-07 — Plan the sortable directory and full identity/role editor

**Session**: codex/feat/unified-club-users
**Changed**: docs/plans/user-directory-and-account-editor.md, PLAN.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Inspected the current directory/settings boundaries and specified a scoped table/list with every field filterable/sortable and a complete editor. Proposed migration 0024 covers verified pending email changes, explicit persisted global role management and protected directory/detail projections; no code, account or database mutation was made. Await architecture approval under AGENTS.md before extending login identity/global-authority operations.
**Prompts used**: "de tab gebruikers geeft alle gebruikers in tabel/list view, filterbaar en sorteerbaar op alle velden. het editen van een gebruiker toon een form waar alle attributen van die gebruiker te beheren zijn(naam, email, rol, overige voorkeuren). de clubbeheerder ziet alleen gebruikers en aanvragen voor zijn club, de rowlens beheerder ziet alle gebruikers".

## 2026-11-07 — Give account management its own Users navigation tab

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/client/{App.tsx,admin/AccessPage.tsx,admin/strings.ts,clubs/ClubsPage.tsx,ui/AppHeader.tsx,styles.css}, apps/web/src/server/{auth/unified-gate.ts,auth/unified-gate.db.test.ts,repositories/user-settings.ts}, apps/web/e2e/unified-users.spec.ts, docs/adr/0021-unified-accounts-and-club-admission.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Users is a separate administrative navigation page: platform administrators see all verified accounts including those without memberships; club administrators receive only actual members of the selected club. Account settings moved out of Clubs; club roles/admission remain explicitly selected-club scoped, while Club administration holds Requests and Roles. A regression exposed global settings requiring a club; the narrow platform-only settings route now uses account context with atomic UUID-only read/save auditing, revision conflicts and persisted SQL authority intact. No migration or production change. Full 546 web/DB tests, 38 focused permission/settings cases, 10 laptop/iPhone WebKit cases and 6 legacy admin/settings browser cases pass; see TEST.md for final verification.
**Prompts used**: "er moet inderdaad een tab 'gebruikers' komen waar alle gebruikers beheerd kunnen worden. rowlens admin ziet ze allemaal. de clubbeheerder ziet alleen de leden van zijn club. een gebruikers kan bij 0 of meer clubs aangesloten zijn".

## 2026-11-07 — Separate club admission from platform club lifecycle management

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/client/{admin,clubs,styles.css}, apps/web/src/server/{api/access.ts,auth/unified-gate.ts,auth/unified-gate.db.test.ts,db/schema.ts,db/migrations/0023_club_archive.sql,db/migrations/meta}, apps/web/e2e/unified-users.spec.ts, docs/adr/{0022-club-archiving.md,README.md}, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Club administration now groups actual club members and role editing with a Requests tab for admission/rejection. RowLens administrators see a complete club directory with create/edit and inline-confirmed archive/restore; approved migration 0023 enforces archived-club denial in tenant RLS and account selection while retaining accounts, memberships and history. Full web/DB 545, worker 50, 8 laptop/iPhone WebKit cases, 49 legacy local cases, 39 proxy cases, 77 deploy checks and the local migration/rollback rehearsal pass. Details, proxy regression and diagnostic startup failures are in TEST.md; no production change or merge/deploy.
**Prompts used**: "als clubbeheerder wil ik onder clubbeheer alle clubleden kunnen inzien en hun rollen kunnen toekennen. ik wil ook nieuwe aanmeldingen kunnen zien en kunnen goedkeuren. Onder Clubs wil ik als rowlens admin een lijst met bestaande clubs zien en clubs kunnen toevoegen, verwijderen, en wijzigen." Follow-up approval: "Ja, archiveren en kunnen herstellen".

## 2026-11-07 — Fix operator bootstrap audit parameter typing

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/server/db/grant-platform-admin-cli.ts, apps/web/src/server/db/grant-platform-admin-cli.db.test.ts, BUGS.md, TEST.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Reproduced the operator-reported PostgreSQL 42P08 error with the actual CLI against a throwaway database, then fixed the audit parameter's explicit UUID/text conversion. All 20 focused CLI/authorization cases pass, including audited repeat-safe grants and unverified-account refusal without email disclosure. The failed original transaction rolled back; the operator can safely rerun the hidden prompt. No real account grant or production mutation was performed by the agent.
**Prompts used**: "Verified account email (hidden):" / "error: inconsistent types deduced for parameter $1" / "detail: 'text versus uuid'" (user's reported terminal failure).

## 2026-11-07 — Confirm green PR and local review readiness

**Session**: codex/feat/unified-club-users
**Changed**: DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: On “ga door”, confirmed PR #157 is open and mergeable with all eight CI jobs successful in run 42368522411; the local development readiness endpoint reports database health. Implementation is ready for local review. The operator must enter their verified account address into the hidden bootstrap terminal prompt; historical mappings require explicit real-account selection. No merge, production bootstrap or deployment was performed.
**Prompts used**: "ga door".

## 2026-11-07 — Require an explicit club when membership is ambiguous

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/server/auth/unified-gate.ts, apps/web/src/server/auth/unified-gate.db.test.ts, BUGS.md, TEST.md, BUILD.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Club content routes now reject a missing club identifier when multiple clubs are available, preventing an old tab/API client from writing into a newly changed implicit first club. Authentication/profile/application/platform operations remain global and single-club legacy requests still work; 18 focused integration cases and 6 laptop/iPhone cases pass. CI run 42368018365 passed web (including the fixed upload suite and both browser matrices) and deploy-script before this final context hardening; current CI is linked on PR #157.
**Prompts used**: "ja uitvoeren".

## 2026-11-07 — Fix the upload acknowledgement race exposed by PR CI

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/server/api/uploads.ts, apps/web/src/server/api/uploads.db.test.ts, BUGS.md, TEST.md, BUILD.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: CI run 42367425246 exposed the existing reply-before-COMMIT upload race (538 passed, 2 failed): a completed response could precede its durable processing job and upload-slot release. A real deferred PostgreSQL commit gate reproduces premature acknowledgement before the fix; plain transaction results now commit and release the slot before sending the response. Focused uploads 13/13, full web/DB 541/541, lint/typecheck/build and 6 desktop/mobile upload/permissions browser cases pass; PR #157 awaits a new CI run. No migration, production change or deployment.
**Prompts used**: "ja uitvoeren".

## 2026-11-07 — Verify unified accounts, role boundaries and club interfaces

**Session**: codex/feat/unified-club-users
**Changed**: TEST.md, BUGS.md, FEATURES.md, BUILD.md, PLAN.md, DOCUMENTATION.md, docs/HANDOFF.md, docs/adr/0021-unified-accounts-and-club-admission.md, docs/plans/unified-users-impact.md
**Summary**: Ready in [PR #157](https://github.com/ewoutbarendregt/rowlens/pull/157), with CI status on the PR. Final web/DB suite passes 540 tests (18 new integration cases), worker 50 plus Ruff/mypy, format/lint/typecheck/build and schema consistency; six new local and six proxy laptop/iPhone WebKit cases pass, with screenshots and >=44 px/no-overflow measurements. Legacy local passes 49; legacy proxy initially had one transient inline-add failure, then passed its targeted repeat and final full 39-case rerun (13 skipped). Deploy-script 77 and real Docker deploy/rollback rehearsal pass. No production mutation or deployment; 7 historical people still need real account mapping, and platform bootstrap remains an explicit hidden terminal prompt.
**Prompts used**: "ja uitvoeren".

## 2026-11-07 — Implement approved account requests and multi-club administration

**Session**: codex/feat/unified-club-users
**Changed**: apps/web/src/{server,client}, apps/web/{e2e,playwright.unified.config.ts,tsconfig.json,package.json,Dockerfile}, scripts/admin/grant-platform-admin.sh, .github/workflows/ci.yml, .gitignore, .dockerignore, AGENTS.md, docs/adr/{0011,0013,0019,0020,0021,README}.md, docs/plans/unified-users-impact.md, docs/privacy/processors.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: Implemented feature-gated verified account requests, independent sessions, audited club applications/admission, live per-club roles/switching, separately bootstrapped full RowLens authority, WVIJburg club mapping and account-backed selectors without standalone roster creation. Three additive migrations preserve old IDs/history and add canonical user references with explicit admin mapping; read-only production preflight found all 7 old people unlinked, so contract removal waits for real account mappings. Initial checks passed; the final verification entry records the expanded 540 web/DB, 50 worker and browser/rollback results. No production writes, real invitation, merge or deployment.
**Prompts used**: "ja uitvoeren" (approval of the unified-user/account request/multi-club/RowLens-admin plan; logos and club design remain later).

## 2026-11-06 — Finish upgrade-compatible training permissions (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: TEST.md, BUGS.md, docs/HANDOFF.md, docs/plans/154-club-training-readonly.md, docs/adr/0020-club-training-permissions.md, DOCUMENTATION.md
**Summary**: Final implementation in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155) passes 522 web/DB tests (30 new permission cases), 50 worker tests, format/lint/typecheck/build, schema-generation consistency, 77 deploy-script tests and the repeated real local deploy/rollback rehearsal. After the compatibility fix, full local E2E again passes 49 (49 skipped), full edge 39 (10 skipped), local iPhone WebKit/1000×540 6/6 and edge 14/14; screenshots reviewed. Local dev is healthy with 20 migrations, edge is stopped, and CI status is on the PR. Production remains sha-b000ca4; no merge/deployment for #154.
**Prompts used**: "voer het plan uit".

## 2026-11-06 — Keep the permission migration compatible with the prior web image (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: apps/web/src/server/db/{tenant.ts,schema.ts,migrations/0019_club_training_permissions.sql,migrations/meta/0019_snapshot.json}, apps/web/src/server/api/training-permissions.db.test.ts, docs/adr/0020-club-training-permissions.md, docs/plans/154-club-training-readonly.md, BUILD.md, BUGS.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Final review found the migrate-before-web-replacement window and old-image rollback could combine broad reads with media handlers that assume visibility implies write access (BUG-034). New handlers now opt in through fixed transaction context; absent context preserves the old image's aligned scope and unknown modes fail closed. Still one migration, no table/dependency/server changes; 30 permission tests pass after a failing compatibility regression and schema generation reports no difference. Full retesting is in progress; prior 520-test/browser evidence applies before this final compatibility change, and production remains sha-b000ca4.
**Prompts used**: "voer het plan uit".

## 2026-11-06 — Complete club training permission verification (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: PLAN.md, FEATURES.md, TEST.md, BUGS.md, docs/plans/154-club-training-readonly.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Approved implementation is ready in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155): club-wide reads, creator-only rower writes, club-wide coach/admin writes, private-feedback/tenant/admin boundaries and one policy migration. Final checks: 520 web/DB, 50 worker, 49 local E2E (49 skipped), 39 edge E2E (10 skipped), 6 local and 14 edge iPhone WebKit/1000×540 cases, format/lint/typecheck/build, 77 deploy-script tests and local deploy/rollback rehearsal pass. Screenshots inspected; local dev is healthy with 20 migrations and edge is stopped. No merge/deployment for #154; production stays sha-b000ca4. CI status is attached to the PR.
**Prompts used**: "voer het plan uit".

## 2026-11-06 — Verify permissions and synchronize browser fixtures (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: apps/web/e2e/{angles,assign,playback,sessions,share}.spec.ts, apps/web/src/client/notes/NotesPanel.tsx, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Full web/DB 520 and worker 50 tests pass, along with format/lint/typecheck/build, 77 deploy-script checks and the local deploy/rollback rehearsal. Full local browsers pass 49 (49 worker-only skipped); the local WebKit/1000×540 settings/permissions matrix passes 6. Edge diagnostics exposed test setup races: await completed inline rower selection before saving, and persisted drawing before trying to select it (an early tap otherwise starts the underlying video); edge final verification is in progress. No additional product/schema change or production action.
**Prompts used**: "voer het plan uit".

## 2026-11-06 — Implement approved club training permissions (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: apps/web/src/server/{api,db,repositories/training-access.ts}, apps/web/src/client/{sessions,notes}, apps/web/e2e/{helpers.ts,training-permissions.spec.ts}, docs/adr/{0013,0019,0020,README}.md, docs/plans/154-club-training-readonly.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Implemented club-wide training reading and creator/staff editing with separate restrictive RLS, one approved migration, API capabilities and fully read-only rower UI for foreign trainings. Private feedback and tenant/admin boundaries remain; pre-media locks plus a fresh ownership recheck fix the reproduced concurrent-transfer upload race (BUG-032); slow chunks retain the lock under a bounded deadline (BUG-033). Role refresh reloads feedback with stale-response protection, and NL/EN admin role explanations match the new scope. Initial full web/DB 518 and worker 50 tests pass; 27 permission tests and 2 local focused E2E pass, with remaining browser verification in progress. Production stays sha-b000ca4; no #154 merge/deploy authorization.
**Prompts used**: "voer het plan uit"; "als roeier moet je wel de trainingen van de andere roeiers kunnen zien, maar je mag ze niet aanpassen"; "Volledig alleen-lezen"; "eerst plan aanpassen. coaches en beheerders mogen overigens wel trainingen van anderen aanpassen".

## 2026-11-06 — Revise training permissions for coaches and admins (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: docs/plans/154-club-training-readonly.md, PLAN.md, FEATURES.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Recorded fully read-only foreign trainings for rower-only users, including all feedback mutations and previously authored feedback. Revised the proposal as Ewout requested: coaches/admins can view and edit all club trainings, including others', and combined roles retain those capabilities; the former own/reachable-only coach scope must change. Only the plan/logs changed; approval for the revised implementation and one policy migration is still pending, and production remains sha-b000ca4.
**Prompts used**: "Volledig alleen-lezen"; "eerst plan aanpassen. coaches en beheerders mogen overigens wel trainingen van anderen aanpassen".

## 2026-11-06 — Plan club-wide read-only training access for rowers (#154)

**Session**: codex/feat/154-club-training-readonly
**Changed**: docs/plans/154-club-training-readonly.md, PLAN.md, FEATURES.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Inspected session visibility, mutation handlers and restrictive RLS: current FOR ALL policies reuse read access for writes, so broader visibility must ship with separate resource write rules and pre-filesystem API authorization. Recorded a concrete one-migration/no-new-table proposal and the pending feedback/architectural decisions; no application or database changes. Production is sha-b000ca4, verified after #152; its deployment log remains separate in #153.
**Prompts used**: "als roeier moet je wel de trainingen van de andere roeiers kunnen zien, maar je mag ze niet aanpassen".

## 2026-11-06 — Implement central admin settings and additive roles (#151)

**Session**: codex/feat/151-admin-user-settings
**Changed**: apps/web/src/shared/{roles,user-settings}.ts, apps/web/src/server/{auth,api,db,repositories}, apps/web/src/client/{admin,auth,settings,ui,sessions,rowers,lineup}, apps/web/e2e/{admin,share,user-settings}.spec.ts, worker/src/rowlens_worker/db.py, docs/adr/0019-user-settings-and-role-sets.md, docs/adr/{0013,0015,README}.md, docs/plans/151-admin-user-settings.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Implemented the approved one-account/multiple-role architecture: central profile/preferences, current-club admin editing and audited role sets, explicit legacy import, revision/response ownership safeguards and rower-only navigation/API/RLS restrictions. Existing scalar roles/live sessions survive migration; invitation/test URLs use the shared base-path builders; transient focus-refresh failures preserve open edits while explicit session rejection still clears access; unsaved role choices and their original conflict snapshot survive profile/list refreshes; 492 web/DB tests, 50 worker tests, full local 47/edge 38 E2E passes and 30 local/edge phone/low-laptop matrix cases pass; PR [#152](https://github.com/ewoutbarendregt/rowlens/pull/152) is open; production remains sha-e5960c7 with no merge/deploy authorization for this feature.
**Prompts used**: "Als beheerder wil ik alle settings van alle gebruikers kunnen inzien en aanpassen"; "Er is maar 1 register van gebruikers. Een gebruiker kan verschillende rollen hebben: roeier, coach, beheerder"; "Gebruikers met rol roeier zien alleen trainingen en hun eigen settings, tab ‘roeiers’ is dan niet zichtbaar"; "Ok voer maar uit".

## 2026-11-06 — Specify the rower-only navigation and roster boundary

**Session**: codex/docs/151-user-settings-plan
**Changed**: docs/plans/151-admin-user-settings.md, PLAN.md, FEATURES.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Added Ewout's rule that rower-only users see Trainings and their own settings, with no Rowers tab or direct standalone roster access; combined roles retain separately granted coach/admin rights. Recorded the existing unconditional navigation/auth-only roster paths and planned route/API/RLS tests, preserving scoped crew information inside accessible trainings; application/production remain unchanged pending the overall architecture approval.
**Prompts used**: "Gebruikers met rol roeier zien alleen trainingen en hun eigen settings, tab ‘roeiers’ is dan niet zichtbaar".

## 2026-11-06 — Clarify one central user register with multiple roles

**Session**: codex/docs/151-user-settings-plan
**Changed**: docs/plans/151-admin-user-settings.md, PLAN.md, FEATURES.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Updated #151 to keep one central account/profile/settings set while allowing simultaneous rower, coach and admin roles. The current scalar role needs a coordinated auth/API/client/RLS migration; the revised proposal extends app_user preferences, uses role sets and one scoped audit table, with no application or production changes before architectural approval.
**Prompts used**: "Er is maar 1 register van gebruikers. Een gebruiker kan verschillende rollen hebben: roeier, coach, beheerder".

## 2026-11-06 — Inventory admin user settings and propose centralized preferences

**Session**: codex/docs/151-user-settings-plan
**Changed**: docs/plans/151-admin-user-settings.md, PLAN.md, FEATURES.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Inventoried the existing admin access, own-profile SQL functions and five browser-only preferences, and opened #151 with a concrete proposal for tenant-scoped settings, audited admin edits and safe device-choice import. Implementation requires new tables/migration and protected profile operations, so it awaits architectural approval under AGENTS.md; no application or production changes.
**Prompts used**: "Als beheerder wil ik alle settings van alle gebruikers kunnen inzien en aanpassen".

## 2026-11-06 — Inline per-moment deletion and quick catch/finish tools

**Session**: codex/feat/85-inline-stroke-tools
**Changed**: apps/web/src/client/{strokes/StrokesPanel.tsx,strokes/StrokeFrameTools.tsx,strokes/strings.ts,sessions/VideoPage.tsx,player/Player.tsx,ui/icons.tsx,styles.css}, apps/web/e2e/strokes.spec.ts, BUILD.md, FEATURES.md, BUGS.md, TEST.md, docs/adr/0016-stroke-marks.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Replaced the separate expandable deletion section with a trash action on each stroke row, where the coach chooses and confirms one moment; next-stroke catches and loose-mark deletion remain safe. Added pointer/keyboard catch and finish buttons immediately above the video, including phone/fullscreen, using existing APIs and permissions; constrained the table after screenshot review found internal scrolling (BUG-027).
**Prompts used**: "Kun je simpelweg een delete icon toevoegen op elke regel in plaats van een aparte sectie voor het verwijderen van haalmomenten. Verder wil ik voor het aangeven van een inpikmoment een tooltje (pijltje omlaag icon) kunnen kiezen op of vlak naast de video. Hetzelfde voor het uitpikmoment."; "Per moment kiezen wat weg moet"; "Ga verder".

## 2026-11-05 — Place drawing points directly without a progress menu (#141, BUG-024)

**Session**: codex/fix/141-direct-drawing-points (stacked on #146)
**Changed**: apps/web/src/client/{drawing/DrawingLayer.tsx,notes/strings.ts}, apps/web/e2e/{drawing.spec.ts,angles.spec.ts}, BUGS.md, BUILD.md, FEATURES.md, TEST.md, docs/HANDOFF.md, docs/adr/0017-angles-per-phase.md, DOCUMENTATION.md
**Summary**: The first tap shows its dot/ring immediately, with no point-progress menu while placing a line, arrow, boat line or angle; the control strip appears only after all required points, retaining adjustment, save and measurement choices. Removed the unused counter copy in both languages and added intermediate-point checks to the existing laptop/WebKit E2E tests; no geometry, API, merge or deployment changes.
**Prompts used**: "Als ik iets wil tekenen, bijvoorbeeld een lijn, dan krijg ik nu een menuutje met ‘punt 1 van 2’. Ik wil dat menuutje niet zien, maar gewoon gelijk een eerste stip zien en daarna de tweede stip kunnen zetten"

## 2026-11-05 — Explicitly remove catch and finish marks (#85, BUG-023)

**Session**: codex/feat/85-remove-stroke-marks (stacked on #145)
**Changed**: apps/web/src/client/{strokes/StrokesPanel.tsx,strokes/strings.ts,sessions/VideoPage.tsx,styles.css}, apps/web/e2e/strokes.spec.ts, apps/web/playwright.editing.config.ts, BUGS.md, BUILD.md, FEATURES.md, TEST.md, docs/HANDOFF.md, docs/adr/0016-stroke-marks.md, DOCUMENTATION.md
**Summary**: Added an expandable NL/EN mark editor with explicit Delete and in-page confirmation for each catch, finish or half slide; requests use the selected frame and the existing protected API, independently of the playback cursor. Validation passed: 451 web/50 worker tests, 43 local E2E, 35 edge E2E, 9 NL/EN laptop/WebKit cases and 3 final 44 px confirmation checks; the existing fast-seek flake (BUG-012) was isolated from this test setup and remains open.
**Prompts used**: "ik wil de inpikken en uitpikken ook kunnen verwijderen, nu kan dat niet"

## 2026-11-05 — Harden playback button activation after iPhone drawing (BUG-022)

**Session**: codex/fix/bug-022-playback-controls (stacked on #144)
**Changed**: apps/web/src/client/{ui/PressButton.tsx,player/Player.tsx,drawing/DrawingLayer.tsx}, apps/web/e2e/playback.spec.ts, apps/web/playwright.editing.config.ts, BUGS.md, BUILD.md, FEATURES.md, TEST.md, docs/HANDOFF.md, docs/adr/0007-upload-transcode-playback.md, DOCUMENTATION.md
**Summary**: Ewout clarified that production iPhone taps leave 1× selected after drawing. Added a regression that suppresses compatibility clicks (it fails on the old activation path), made speed/play/pause respond once on pointer release with keyboard support, and explicitly release drawing captures; all 33 editing/playback cases pass, alongside 451 web/50 worker tests and 43 local E2E cases (edge: 32 passed plus one upload-quota case passed on isolated rerun), while the original physical iPhone sequence still needs confirmation.
**Prompts used**: "Vertraagd afspelen op 0,25 en 0,5 snelheid werkt niet meer. Soms reageert de pauze knop ook niet"; clarifications: "Het gebeurt op de iphone inderdaad meestal na een lijn of een hoek"; "productie"; "De video blijft op normale snelheid lopen"; "Nee, 1× blijft actief".

## 2026-11-05 — Investigate iPhone playback failures after drawing (BUG-022)

**Session**: codex/fix/bug-022-playback-controls (based on #144; local commits only)
**Changed**: apps/web/e2e/playback.spec.ts, BUGS.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Investigated the reported production iPhone failure after a line/angle using measured slow playback, pause and loop probes, then a local image built from exact production source `5ef325b`. Nine targeted tests pass on both laptop sizes and iPhone WebKit; the physical-device failure is not reproduced, so BUG-022 remains in progress and no application fix, PR, merge or deployment was made.
**Prompts used**: "Vertraagd afspelen op 0,25 en 0,5 snelheid werkt niet meer. Soms reageert de pauze knop ook niet"; clarifications: "Het gebeurt op de iphone inderdaad meestal na een lijn of een hoek"; "productie".

## 2026-11-05 — Merge #143 and harden the drawing controls for laptop and iPhone

**Session**: codex/fix/141-unobstructed-editing
**Changed**: apps/web/src/client/{drawing/DrawingLayer.tsx,player/Player.tsx,sessions/VideoPage.tsx,styles.css}, apps/web/e2e/{helpers.ts,drawing.spec.ts,angles.spec.ts,boatline.spec.ts}, apps/web/{playwright.editing.config.ts,package.json,tsconfig.json}, docs/adr/0017-angles-per-phase.md, BUILD.md, FEATURES.md, BUGS.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Updated and merged #143 as `76adf5b` after all eight CI jobs passed (run 42062947694); no deployment was needed, and production readiness still reports `sha-5ef325b` with `db` ok. The requested editing review reproduced BUG-021 at 1000×540: controls obscured the lower drawing points; the separate functional fix places them below the picture inside the fullscreen player, with 44 px controls and regression checks on laptop and iPhone WebKit, ready for local review before a new merge/deploy instruction.
**Prompts used**: "bijwerken en mergen graag, tevens deployment naar prd indien nodig. stern camera vind ik nog niet belangrijk ik wil eerst de basics goed werkend hebben. editing, verplaatsen van lijnen, hoeken op de laptop en op de iphone. dat is de basis functionaliteit"

## 2026-11-05 — Update the deployment-log PR and prioritize editing basics

**Session**: codex/docs/143-handoff-review (updates for #143)
**Changed**: PLAN.md, TEST.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Updated the BUG-020 test record with the final successful CI run and aligned PR #143's description with its docs/tests scope; Ewout authorized its merge after the updated CI passes. Laptop and iPhone editing, selecting and moving lines/angles now take priority over oar arcs and stern-camera work; this docs/tests change requires no production deployment.
**Prompts used**: "bijwerken en mergen graag, tevens deployment naar prd indien nodig. stern camera vind ik nog niet belangrijk ik wil eerst de basics goed werkend hebben. editing, verplaatsen van lijnen, hoeken op de laptop en op de iphone. dat is de basis functionaliteit"

## 2026-11-05 — Codex takeover and review of the deployment-log PR

**Session**: codex/docs/143-handoff-review
**Changed**: DOCUMENTATION.md, docs/HANDOFF.md, TEST.md
**Summary**: Read the handoff, project instructions, PLAN, BUILD, recent work log and ADR-0017/0018, and reviewed all six files in PR #143. No blocking code findings: its latest head `dcc6cb5` has eight successful CI jobs (run 42058782838), and nine stroke unit tests passed locally; the PR description and test log still need their docs/tests scope and final CI outcome aligned. The local web returned HTTP 200; stopped the leftover edge stack without deleting its data. No merge, push, deployment or analysis implementation; this takeover record is committed locally on the branch above, based on #143.
**Prompts used**:

> Neem RowLens over vanaf de handoff van 2026-11-05. Lees eerst AGENTS.md,
> docs/HANDOFF.md, PLAN.md, BUILD.md, de nieuwste entries van DOCUMENTATION.md
> en docs/adr/0017 + 0018.
>
> Stand: main = 5ef325b, productie = sha-5ef325b (deploy 2026-11-05 14:55 UTC,
> geverifieerd). Werktree schoon, niets in uitvoering. Lokaal: pnpm dev:up +
> pnpm dev op :5174; de edge-stack staat nog aan (pnpm edge:down als je klaar
> bent).
>
> Open: PR #143 (opencode/docs/141-deploy, checks groen) — deploy-log +
> BUG-020-testfix, docs/tests alleen. Niet mergen zonder mijn ja. Daarna wacht
> de oar arc + stern-camera (plan in de 2026-11-04-comment op #127) op mijn
> go; die heeft eerst een stern-camera proefvideo op de lokale stack nodig.
>
> Werkwijze: eerst verkennen, dan een kort plan en wachten op mijn akkoord bij
> architectuur (nieuwe tabellen/migraties/dependencies). Merge alleen als ik
> "merge" zeg, deploy alleen als ik "deploy" zeg (per keer). Branch
> codex/<type>/<issue>-<slug>, één PR per issue, tests als definition of done
> (format/lint/typecheck/pnpm test, worker-checks, lokale + edge E2E, iPhone
> WebKit en ~1000×540). Rapporteer kort met getallen en PR-links, in het
> Nederlands of Engels zoals ik schrijf.
>
> Begin met: (1) samenvatten in 5 regels wat er volgens de handoff ligt, (2) je
> beoordeling van PR #143, (3) je voorgestelde eerste stap. Vraag nog niets aan
> mij tot je die drie hebt gegeven.

## 2026-11-05 — Move a saved drawing or measurement on the picture; choose its rower there (#141)

**Session**: opencode/feat/141-draggable-drawings (merged as #142); docs and the BUG-020 fix on opencode/docs/141-deploy (#143)
**Changed**: .github/workflows/ci.yml, apps/web/src/server/api/{annotations.ts,annotations.db.test.ts}, apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/angles/AnglesPanel.tsx, apps/web/src/client/notes/{overlay.ts,strings.ts}, apps/web/src/client/styles.css, apps/web/e2e/{drawing.spec.ts,angles.spec.ts,boatline.spec.ts}, docs/adr/0017-angles-per-phase.md, docs/HANDOFF.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md
**Summary**: Tapping a drawing on the picture (a note's line/arrow/angle, an angle measurement, the boat line the worker found) selects it — a light halo, a ring on each point — and dragging a ring moves that point: exactly with the mouse, at half speed with a finger, saved when the finger lifts. An angle's degrees and the crew difference follow live; moving a measurement keeps its rower, joint and frame; correcting the found boat line saves a coach's line on that frame, which wins from there on (ADR-0018). Drawings now show only on their own frame instead of during the note hold (the track's markers keep saying where they are), and the toggle hides them with the notes. While measuring, the rower and the joint are chosen in the bar over the picture instead of the Angles tab below it; the bar is one row on a phone (48 px on a 358×201 picture, was 98 px with the labels and the long hint). `PATCH /api/annotations/:id` takes `{ points }` for line/arrow/angle (2 or 3 points, the kind decides) beside `{ body }` for a note; a wrong kind or count is a 400 `invalid_annotation`, another club's drawing still a 404 through RLS. Two engine findings, both logged in BUGS.md: `pointer-events: stroke` with `vector-effect: non-scaling-stroke` makes a small circle's hit area skip its centre (Chromium), so the point under a press is found in screen pixels in the layer itself (28 px fingertip reach, as in drawing mode); and WebKit sends the click to whatever is under the finger at release, which dropped a just-selected drawing again — the catcher now only drops a selection when the press started on it. The `policy` job's branch check learned the `opencode/` prefix that AGENTS.md prescribes (it only allowed `claude/` and `codex/`). Fixed on top of it: the strokes E2E checked a catch jump that only held while a mark removal was still in flight (BUG-020), which failed the `edge` job on the deployment-log PR under a slower runner. Merged as `sha-5ef325b` (PR #142) and deployed 2026-11-05 14:55 UTC: images run 42048365629, deploy run 42049743130, no migration (still 18); `/health/ready` reports `sha-5ef325b` with `db` ok, `rowlens-web` and `rowlens-worker` run that tag and are healthy, trustable.nl / api.trustable.nl / AudioScribe / RowLens answer 200 and the trustable containers are untouched.
**Prompts used**: "when drawing the line the controls for selecting the rower and the joint are only available in the Angles tab, not in the picture. Now I have to go to a section outside of the viewport to edit it. Also, when I've drawn something on the video, I can't change it while drawing. Please make the drawing point draggable as well, so I can move them to the correct position. and the rower of the angle should be selectable from the picture"; answers: "1 c" (a finger drags at half speed, the mouse 1:1), "2" (drawings stay on their own frame, the track's markers show where a note or drawing is).

## 2026-11-05 — Project made portable to opencode (AGENTS.md as the single source)

**Session**: claude/docs/opencode-handoff
**Changed**: AGENTS.md, CLAUDE.md, opencode.json, .opencode/commands/{check,e2e,deploy,handoff}.md, docs/HANDOFF.md, README.md, .gitignore, TEST.md, DOCUMENTATION.md
**Summary**: opencode loads `AGENTS.md` and skips `CLAUDE.md` when both exist, so `AGENTS.md` is now the complete, tool-neutral instruction file (project rules, Ewout's global documentation rules, facts that lived only in Claude's memory: no staging, deploy only on request, side-effect deploys, secrets via a terminal prompt; the deploy runbook and testing know-how). `CLAUDE.md` imports it and keeps only Claude specifics. `opencode.json` loads `docs/HANDOFF.md` and `PLAN.md` and turns the hard rules into permissions (no pushes to `main` or force pushes, no `docker system prune`; merging, deploying, ssh and `rm -rf` ask; `.env` files not editable); four slash commands (`/check`, `/e2e`, `/deploy`, `/handoff`). `docs/HANDOFF.md` brought from 2026-11-02 to now. Also deployed yesterday: `sha-b6e18a6` (stroke-moment jumps #139), deploy run 41799144428.
**Prompts used**: "maak het project overdraagbaar voor opencode"

## 2026-11-04 — Jump to the previous / next stroke moment

**Session**: claude/feat/jump-stroke-moments
**Changed**: apps/web/src/client/player/{Player.tsx,usePlayer.ts,strings.ts}, apps/web/src/client/ui/icons.tsx, apps/web/src/client/styles.css, apps/web/e2e/strokes.spec.ts, BUILD.md, FEATURES.md, TEST.md, DOCUMENTATION.md
**Summary**: Fast backward / fast forward buttons in the player controls jump to the previous / next stroke moment (paused, quick taps go one further each). Without marks both are off and the player says "Geef een haalmoment aan om daarheen te springen." The step bar layout changed so phones keep the steps on one row. Also deployed earlier today: `sha-09d4bf6` (boat line per frame #138), deploy run 41764905798, migration 0017; the backfill found lines in 4361 of 8292 frames of the 5 existing videos. Not merged or deployed.
**Prompts used**: "Er moet in de video controls een knop fast forward en een knop fast backward komen die naar het volgende haalmoment springen als die aangegeven zijn. Als er geen haalmomenten zijn, zijn de knoppen disabled en verschijnt de melding 'geef een haalmoment aan om daarheen te springen'"

## 2026-11-04 — The boat line found in every frame (ADR-0018)

**Session**: claude/feat/auto-boat-line
**Changed**: worker/pyproject.toml, worker/uv.lock, worker/src/rowlens_worker/{__main__.py,analysis/__init__.py,analysis/waterline.py,video/boat_line.py,video/process.py}, worker/tests/test_waterline.py, apps/web/src/server/db/{schema.ts,migrations/0017_auto_boat_line.sql (+ meta)}, apps/web/src/server/api/{angles.ts,angles.db.test.ts,visibility.db.test.ts}, apps/web/src/shared/{angles.ts,angles.test.ts}, apps/web/src/client/{features.ts,angles/AnglesPanel.tsx,angles/strings.ts,drawing/DrawingLayer.tsx,sessions/VideoPage.tsx,styles.css}, apps/web/Dockerfile, apps/web/e2e/boatline.spec.ts, scripts/demo-media/generate.sh, docs/adr/{0018-boat-line-per-frame.md,0017-angles-per-phase.md,README.md}, BUILD.md, FEATURES.md, TEST.md, DOCUMENTATION.md
**Summary**: The worker finds the boat's waterline (bow to stern, or to the picture's edge) in every frame with classical image processing (OpenCV, no model, nothing leaves the server), after processing and for existing videos. A coach's boat line wins on its frame and restarts the search; the bow side comes from the nearest coach line or a one-time choice. The found line is dotted on the picture and the upper body is measured against the line of its own frame. Spike first on three local club videos (scratchpad only, no media committed). Also deployed earlier: `sha-7786aa2` (video zoom #137), deploy run 41718888929. Not merged or deployed.
**Prompts used**: "kun je de bootlijn niet automatisch laten bepalen in elk frame. vanaf waar de boeg het water raakt tot waar de spiegel het water raakt. wanneer de boot niet in zijn geheel zichtbaar is, dan steeds de waterlijn volgen"; answers: first a spike; the coach wins on his frame; after every upload; then "Build it like this".

## 2026-11-03 — Zoom into part of the video picture

**Session**: claude/feat/video-zoom
**Changed**: apps/web/src/client/player/{zoom.ts,zoom.test.ts,Player.tsx,strings.ts}, apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/{player.spec.ts,drawing.spec.ts,lineup.spec.ts}, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md
**Summary**: The picture can be zoomed into (up to 6×) by pinching on a phone, ⌘/Ctrl + scroll or a trackpad pinch on a laptop, the + − 0 keys and small buttons in the corner of the picture; a drag pans while zoomed (not while drawing). Only the video is transformed, so the stage and all controls stay where they are, and drawings, angles and boat lines zoom along exactly (the drawing layer's viewBox follows the view). Also: BUG-017 logged (WebKit boat-line taps, also on main); a lineup E2E search fixed (part of BUG-016). Deployed earlier today: `sha-f52e226` (names, default boat, session page #136), deploy run 41707591758, 17 migrations. Not merged or deployed.
**Prompts used**: "ik wil de video kunnen uitvergroten en toch de controls nog kunnen bedienen"; answer: "Inzoomen op een deel".

## 2026-11-03 — Names, default boat, renaming, and videos first on the session page

**Session**: claude/feat/profile-session-page
**Changed**: apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0016_user_profile.sql (+ meta), apps/web/src/server/api/{profile.ts,sessions.ts,visibility.db.test.ts}, apps/web/src/server/auth/{gate.ts,can.ts,can.test.ts}, apps/web/src/server/app.ts, apps/web/src/client/ui/{ProfileForm.tsx,AppHeader.tsx}, apps/web/src/client/auth/{useAuth.ts,strings.ts}, apps/web/src/client/sessions/{RequireAuth.tsx,SessionsPage.tsx,SessionPage.tsx,strings.ts,strings.test.ts}, apps/web/src/client/styles.css, apps/web/e2e/{helpers.ts,profile.spec.ts,lineup.spec.ts,assign.spec.ts,angles.spec.ts,share.spec.ts,sessions.spec.ts,upload.spec.ts}, docs/adr/0011-auth-otp-and-email.md, BUILD.md, FEATURES.md, TEST.md, DOCUMENTATION.md
**Summary**: Every member gives a first and last name (a welcome card until they do, then the account menu, which also holds the default boat for a new session, C4x+ unless chosen). The sessions list and page show who made a session and when it was made; a session can be renamed by its coaches, the admin and its maker. The session page shows the videos first with a compact "Add videos" button and the upload queue in the same card; the lineup is folded below with a summary. Also deployed earlier today: `sha-26bdd35` (boat lines per moment, finger drawing #135), deploy run 41694284305, migration 0015 (production's 2 boat lines now from frame 0). Not merged or deployed.
**Prompts used**: "voeg aan het trainingsoverzicht de naam toe van degene die te training heeft aangemaakt. iedere gebruiker moet zijn voornaam en achternaam invullen in de settings dropdown (rechtsboven). de naam van een training moet ik kunnen aanpassen. default boot bij nieuwe training is C4X+ (default instelbaar per gebruiker settings). Bij \"aangemaakt om\" , datum aanmaken toevoegen … op de pagina van een training, wil ik bovenaan de video's zien. de opstelling mag naar onder, dat hele formulier wordt een dropdown. De sectie 'video's' bevat de geuploade video's en ook een eenvoudige button om nog een video toe te voegen … de upload knop is niet zo breed als nu"; answers: name first; rename by coaches, admin and maker.

## 2026-11-03 — Boat lines per moment; drawing made for fingers

**Session**: claude/feat/boat-lines-touch-drawing
**Changed**: apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0015_boat_lines_per_frame.sql (+ meta), apps/web/src/server/api/{angles.ts,angles.db.test.ts,visibility.db.test.ts}, apps/web/src/shared/{angles.ts,angles.test.ts}, apps/web/src/client/drawing/{DrawingLayer.tsx,geometry.ts,geometry.test.ts}, apps/web/src/client/angles/{AnglesPanel.tsx,strings.ts}, apps/web/src/client/notes/strings.ts, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/{helpers.ts,drawing.spec.ts,angles.spec.ts}, docs/adr/0017-angles-per-phase.md, BUILD.md, TEST.md, BUGS.md, DOCUMENTATION.md
**Summary**: A video can hold several boat lines, each from its frame on, because the camera turns; upper-body angles use the line that applies at their frame. Drawing on the picture (drawings, angle measurements, boat lines) is made for fingers after the head coach's iPhone feedback: points only on a short still tap, draggable at half speed until Save, with Save / Start over / Cancel over the picture. Checked with real finger taps in iPhone WebKit. Found on the way: BUG-016 (a lineup rower sometimes lost under load). Also deployed earlier today: `sha-22e875b` (angles per phase #134), deploy run 41661584397. Not merged or deployed.
**Prompts used**: "de bootlijn moet verschillende keren in een video gezet kunnen worden. door de veranderende hoek waarin gefilmd wordt, verandert die baseline vrij snel. verder nog de volgende ervaringen met gebruik van de iphone: … Lijn door bootlengte is lastig, te gevoelig. Hoeken moeten met lijnen aangeduid worden en het scherm is dan heel gevoelig … Bij de minste aanraking heb je een lijn."

## 2026-11-03 — Angles per rower and phase, with the boat line (ADR-0017)

**Session**: claude/feat/angle-measures
**Changed**: apps/web/src/shared/{geometry.ts,angles.ts,angles.test.ts}, apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0014_angle_measures.sql (+ meta), apps/web/src/server/api/{angles.ts,angles.db.test.ts,rowers.ts,visibility.db.test.ts}, apps/web/src/server/auth/{can.ts,can.test.ts}, apps/web/src/server/app.ts, apps/web/src/client/angles/{AnglesPanel.tsx,strings.ts}, apps/web/src/client/drawing/{DrawingLayer.tsx,geometry.ts}, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/angles.spec.ts, docs/adr/{0017-angles-per-phase.md,README.md}, docs/analysis/perspective-rules.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md
**Summary**: Coaches measure knee, hip, elbow and the upper body per rower on frames with a stroke mark (a third side tab, Angles), the upper body against a boat line drawn once per video; a table per joint shows each rower's mean per phase with n, spread and evidence frames, and the difference in the crew. Merging roster entries moves measurements through a club-limited definer function. Found on the way: BUG-014 (merge across sessions the merger can't see) and BUG-015 (tools row wraps with classic scrollbars). Also deployed earlier today: `sha-4966d8a` (arrows, calculated drive middle #133), deploy run 41653530432. Not merged or deployed.
**Prompts used**: "kunnen we verder met de volgende stap in spoor 1"; answers: all four angles; upper body against a boat line per video; coaches and admin measure; only on marked moments.

## 2026-11-03 — Arrows for catch and finish; the middle of the drive, calculated (optional)

**Session**: claude/feat/stroke-arrows-drive-middle
**Changed**: apps/web/src/shared/{strokes.ts,strokes.test.ts}, apps/web/src/client/player/Player.tsx, apps/web/src/client/ui/icons.tsx, apps/web/src/client/strokes/{StrokesPanel.tsx,strings.ts,preferences.ts,preferences.test.ts}, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/strokes.spec.ts, docs/adr/0016-stroke-marks.md, BUILD.md, TEST.md, DOCUMENTATION.md
**Summary**: Under the video the catch is now an arrow down and the finish an arrow up. A switch in the Strokes tab (off by default, per device) shows the middle of each drive, halfway in time between catch and finish, as an open circle; a half slide the coach marked on that drive wins. Also deployed earlier today: `sha-07f03c7` (stroke marks #132), deploy run 41645570076, migration 0013 applied (14 migrations), readiness and neighbours checked. Not merged or deployed.
**Prompts used**: "kun je onder de video de indicaties van inpik en uitpik markeren met een pijltje omlaag (inpik) en een pijltje omhoog (uitpik) en kun je het midden van de haal optioneel automatisch laten uitrekenen"

## 2026-11-03 — Stroke marks: catch, half slide, finish; timings per stroke (#85)

**Session**: claude/feat/85-stroke-marks
**Changed**: apps/web/src/shared/{strokes.ts,strokes.test.ts}, apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0013_stroke_marks.sql (+ meta), apps/web/src/server/api/{strokes.ts,strokes.db.test.ts,visibility.db.test.ts}, apps/web/src/server/auth/{can.ts,can.test.ts}, apps/web/src/server/app.ts, apps/web/src/client/strokes/{StrokesPanel.tsx,strings.ts}, apps/web/src/client/player/{Player.tsx,usePlayer.ts}, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/strokes.spec.ts, docs/adr/{0016-stroke-marks.md,README.md}, docs/analysis/perspective-rules.md, BUILD.md, FEATURES.md, TEST.md, DOCUMENTATION.md
**Summary**: Coaches mark catch, finish and optionally the half slide for the whole boat (keys I / H / U, buttons in a new Strokes tab); everyone who sees the video sees ticks on the timeline and a table per stroke with rate, drive, recovery and ratio, each from its frames or with the reason it's missing, plus averages from 3 complete strokes and a loop per stroke. New tenant table with RLS; coaches and the admin write. Also deployed earlier today: `sha-6740ce0` (For chips #131, deploy log #130), deploy run 41604449245, readiness and neighbours checked. Two edge runs during this work timed out in unrelated specs while the Mac had a load average of 17; the run after the load dropped passed 22/22. Not merged or deployed.
**Prompts used**: "Ik wil nu vooral focussen op analyse hulpmiddelen voor de coach. Wat zijn dan de volgende stappen?"; "Graag" (plan step 1); answers: marks for the whole boat; coaches and admin mark; the coach marks the half slide.

## 2026-11-03 — "For" as a chip per seat; head coach's analysis wishes in the backlog

**Session**: claude/feat/notes-for-chips
**Changed**: apps/web/src/client/notes/{NotesPanel.tsx,assignees.ts,assignees.test.ts}, apps/web/src/client/styles.css, apps/web/e2e/assign.spec.ts, BUILD.md, FEATURES.md, DOCUMENTATION.md
**Summary**: A note's "For" row shows a chip per seat of the session's lineup ("Boeg (1) · Ivo") that turns that rower on or off in one tap, and "Hele ploeg" as a switch; rowers outside the lineup keep a chip with × and the picker. The head coach's longer list of analysis wishes was added to issue #127, grouped by what the analysis has to see (body from the side, crew, oar and blade, stern view, boat), with "bovenlichaam" instead of "romp" for the rower's upper body. Not merged or deployed.
**Prompts used**: "ja. en ik heb ook nog een hele serie wensen van de head coach: …" (the coach's chat list; recorded in #127 without names)

## 2026-11-03 — Deploy sha-e90e40d (video page 1e, names without question marks)

**Session**: claude/docs/deploy-e90e40d
**Changed**: DOCUMENTATION.md, docs/HANDOFF.md
**Summary**: #128 and the E2E fix #129 were merged; CI on `main` (run 41595503864) built `sha-e90e40d` and deploy run 41596334550 put it on production. Readiness reports `sha-e90e40d` with a healthy database; RowLens, trustable.nl and the RowLens page answer 200; web and worker run the new images, AudioScribe was untouched (up 10 days, healthy). No shared server component changed. `sha-2a9dfb8` (#128 alone) was never built or deployed because of BUG-013.
**Prompts used**: "Merge en deploy"; "Doe allemaal maar"

## 2026-11-03 — Fix the sessions-list E2E race that blocked the release (BUG-013)

**Session**: claude/fix/sessions-e2e-race
**Changed**: apps/web/e2e/sessions.spec.ts, BUGS.md, DOCUMENTATION.md
**Summary**: After #128 was merged, CI on `main` failed (twice, with retry) in the sessions-list E2E, so no images were built for `sha-2a9dfb8` and nothing was deployed. The CI trace showed the test clicking the filter toggle that laptops hide: it checked the search field's visibility before the filters had opened. The test now waits for the filter block and opens the fold only on a phone; 5 × 2 runs and the full local suite passed.
**Prompts used**: "Merge en deploy"

## 2026-11-03 — Video page in the 1e layout; names without question marks; technique backlog

**Session**: claude/feat/video-page-layout
**Changed**: apps/web/src/client/player/{Player.tsx,strings.ts}, apps/web/src/client/sessions/{VideoPage.tsx,SessionPage.tsx,displayName.ts,displayName.test.ts}, apps/web/src/client/lineup/LineupCard.tsx, apps/web/src/client/notes/{NotesPanel.tsx,strings.ts}, apps/web/src/client/drawing/DrawTools.tsx, apps/web/src/client/ui/icons.tsx, apps/web/src/client/styles.css, apps/web/e2e/{helpers.ts,assign.spec.ts,share.spec.ts,upload.spec.ts}, BUILD.md, FEATURES.md, TEST.md, BUGS.md
**Summary**: The video page follows mockup 1e: header with the lineup as columns, the tools above the picture on a laptop, diamonds on the timeline, one control row with a round play button, a line of shortcuts, and the "Notes for" filter in the notes column header (one filter for list and video). Video sizes are unchanged at every measured size; at 1000×540 the player column now fits the screen. Video names leave out unknown parts instead of "??:??", and the file name is gone from the video page and from ready videos in the session. Coach input on what analysis should show first is in issue #127. Not merged or deployed. "For" chips per seat remain for a next PR.
**Prompts used**: "check the state of the repo and lets continue with the next task"; "Belangrijk zijn: blad in het water, knie- (arm) en heup- hoeken bij inpik, halve bank en uitpik. Verder inpik niet vanuit heup of knie. Dat de hoeken van alle roeiers gelijk zijn en dat bewegingen de snelheid van de boot verbeteren. Verder pols hoek... UI: verder hoef ik de lange (code) naam van de video file niet te zien, en er verschijnen steeds vraagtekens in de displaynaam."

## 2026-11-02 — Merge and deploy notes-in-video release

**Session**: codex/docs/deploy-ee73740
**Changed**: docs/HANDOFF.md, docs/runbooks/server-setup.md, DOCUMENTATION.md
**Summary**: PR #125 was merged into `main` as `ee73740`, the matching web and worker images were published, and GitHub deploy run 41522914840 deployed `sha-ee73740` to production. RowLens readiness reported the expected version and a healthy database; RowLens, trustable.nl, the public API and AudioScribe all returned HTTP 200, and no shared server component was changed.
**Prompts used**: "merge en deploy maar"

## 2026-11-02 — Merge language switch and retarget video notes

**Session**: codex/feat/106-notes-in-video
**Changed**: docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: PR #124 was merged into `main` as `fd8b19c` without deleting its branch, then PR #125 was retargeted from `claude/feat/ui-language` to `main`; it remained conflict-free and mergeable. No deployment was performed.
**Prompts used**: "ok merge 124 en daarna retarget 125"

## 2026-11-02 — Notes and drawings in the video; account is the author (#106)

**Session**: codex/feat/106-notes-in-video
**Changed**: apps/web/src/client/{auth/useAuth.ts,drawing/DrawTools.tsx,notes/{NotesPanel.tsx,VideoNotesOverlay.tsx,overlay.ts,overlay.test.ts,strings.ts},sessions/VideoPage.tsx,styles.css}, apps/web/src/server/{app.ts,auth/gate.ts,api/{annotations.ts,annotations.db.test.ts,author.ts,visibility.db.test.ts}}, apps/web/e2e/{assign,drawing,notes,share}.spec.ts, docs/HANDOFF.md, BUILD.md, FEATURES.md, TEST.md, DOCUMENTATION.md
**Summary**: Notes, explanations and drawings now appear together inside the video for a configurable 0.5/1/2-second hold, with a remembered eye/`N` toggle, a shared rower filter and automatic placement away from drawing strokes. The free author field is gone: the server uses the linked roster name or signed-in account and ignores spoofed client names; PR #125 is stacked on #124 and verified with 385 web tests, 44 worker tests, 38 local and 21 edge E2E checks plus WebKit phone/fullscreen and 1000×540 measurements.
**Prompts used**: "kun je afmaken wat claude code gestart was?"

## 2026-11-02 — Dutch by default, language switch (part of #34)

**Session**: claude/feat/ui-language
**Changed**: apps/web/src/shared/languages.ts, apps/web/src/client/i18n/{language.ts,language.test.ts}, apps/web/src/client/ui/{LanguageSwitch.tsx,AppHeader.tsx,ConfirmInline.tsx,ThemeSwitch.tsx}, apps/web/src/client/{App.tsx,main.tsx,pages/HomePage.tsx,pages/PlayerDemoPage.tsx,player/Player.tsx}, apps/web/src/client/{auth,notes,player,sessions,admin,lineup,rowers}/strings.ts, apps/web/src/client/auth/LoginGate.tsx, apps/web/src/client/admin/AccessPage.tsx, apps/web/src/server/auth/{gate.ts,gate.db.test.ts}, apps/web/e2e/player.spec.ts, docs/adr/{0015-interface-language.md,README.md}, BUILD.md, FEATURES.md, TEST.md, BUGS.md
**Summary**: The interface is Dutch unless English is chosen on the device; a Nederlands/English switch sits on the login page and in the account menu and works instantly without reloading. The browser's language no longer decides. The login-code mail follows the language on screen. Also: production deploy of sha-96a0202 (#122 + #123) after adding `AUTH_ADMIN_EMAILS` to the server's `.env` (entered by Ewout in a terminal prompt; backup made).
**Prompts used**: "merge en deploy nu eerst. daarna: default moet de ui in het NL zijn, er moet een taalswitch zijn naar EN, later mogelijk nog andere talen. daarna pr b"

## 2026-11-02 — Classical style from the mockups: login, header, sessions table per month

**Session**: claude/feat/ui-classical (stacked on claude/feat/108-session-list)
**Changed**: apps/web/src/client/design/{classical.css,theme.css,README.md,LICENSES.md} (replaces tokens.css, fonts.css, fonts/), apps/web/package.json + pnpm-lock.yaml (@fontsource), apps/web/src/client/{main.tsx,styles.css}, apps/web/src/client/ui/{icons.tsx,AppHeader.tsx}, apps/web/src/client/auth/{LoginGate.tsx,strings.ts}, apps/web/src/client/pages/HomePage.tsx, apps/web/src/client/sessions/{SessionsPage.tsx,filter.ts,filter.test.ts,strings.ts}, apps/web/src/server/ui-theme-contrast.test.ts, apps/web/e2e/{helpers.ts,sessions.spec.ts,lineup.spec.ts}, .prettierignore, docs/adr/{0012-ui-design-tokens.md,0014-classical-design-system.md,README.md}, BUILD.md, FEATURES.md, TEST.md
**Summary**: RowLens takes the Classical design system of Ewout's mockups (Cormorant Garamond + Lora, gold accent, hairlines, outlined buttons), self-hosted fonts and Lucide icons, with our own dark and high-contrast modes checked for WCAG AA; the Nouryon style of ADR-0012 (never deployed) is gone. Login, code and error screens, the header and the sessions list follow mockups 1a–1d: one table per month (date, session, boat, crew, videos, for you), stacked blocks on a phone, the filters as one row with the "filters stay in the link" hint. Other pages take the style through shared classes. Video sizes unchanged or larger. Local dev DB got demo sessions (local only). Not merged or deployed.
**Prompts used**: "Use the claude_design MCP … to import this project … Implement: `RowLens Mockups.dc.html`"; "hier is de hele zip file"; answers: "Classical overnemen"; include notes in the video, sessions table per month, author = your account, new video page layout (the last three in PR B).

## 2026-11-02 — Sessions list as start page, own sessions, admin panel (#108)

**Session**: claude/feat/108-session-list
**Changed**: migrations/0012_coach_own_sessions.sql (+ meta), apps/web/src/server/db/schema.ts, apps/web/src/server/auth/{can.ts,can.test.ts}, apps/web/src/server/api/{sessions.ts,visibility.db.test.ts}, apps/web/src/client/ui/AppHeader.tsx, apps/web/src/client/sessions/{SessionsPage.tsx,filter.ts,filter.test.ts,SessionPage.tsx,RequireAuth.tsx,strings.ts}, apps/web/src/client/admin/{AccessPage.tsx,strings.ts}, apps/web/src/client/{App.tsx,pages/HomePage.tsx,auth/strings.ts,rowers/RowersPage.tsx,styles.css}, apps/web/e2e/*, docs/adr/0013-role-visibility.md, BUILD.md, FEATURES.md
**Summary**: After login the sessions list is the start page, with a header on every page; the list filters (period, rower, boat, title, notes for me) and sorts, kept in the URL. Only the admin sees all sessions; coaches and rowers their own; the admin gives a session to a coach. Admin panel with Users and Roles tabs. Found and fixed on the way: filter inputs bound straight to the URL lost typed text on phones.
**Prompts used**: "als ik inlog wil ik een lijst zien van alle sessies. ik wil de lijst kunnen filteren en sorteren. de admin ziet alle sessies, andere gebruikers zien alleen hun eigen sessies. het beheer van de gebruikers en rollen en rechten zit in een admin panel dat alleen zichtbaar is voor de admin"; answers: coach sees created/lineup; filter on date, rower, boat/title, notes; admin panel as fixed place with fixed rights.

## 2026-11-02 — What a rower sees (#40) and sharing notes (#112)

**Session**: claude/feat/40-role-visibility
**Changed**: apps/web/src/server/db/{schema.ts,tenant.ts}, migrations/0011_role_visibility.sql (+ meta), apps/web/src/server/auth/{can.ts,can.test.ts,gate.ts}, apps/web/src/server/api/{annotations.ts,moments.ts,sessions.ts,videos.ts,visibility.db.test.ts}, apps/web/src/client/notes/{NotesPanel.tsx,assignees.ts,strings.ts}, apps/web/src/client/sessions/{SessionsPage.tsx,VideoPage.tsx,strings.ts}, apps/web/src/client/{auth/useAuth.ts,styles.css}, apps/web/e2e/share.spec.ts, docs/adr/0013-role-visibility.md, BUILD.md, FEATURES.md
**Summary**: Rowers now see only their sessions and the notes assigned or shared to them or written by them, enforced with restrictive RLS policies on top of the club policy; they change only their own annotations. Notes can be shared with a rower or the session's crew and taken back. Login links the roster entry with the account's exact e-mail. 10 visibility DB tests through the real login flow, 46 can() tests, edge E2E 20/20. Not merged or deployed.
**Prompts used**: "Merge, dan #40+#112"; answers: rower sees sessions they rowed in; notes private to coaches + assignees; rowers may write notes, share, upload and keep roster/lineups.

## 2026-11-02 — Admin: give people access with a role (#42)

**Session**: claude/feat/42-admin-access (stacked on claude/feat/105-assign-notes)
**Changed**: apps/web/src/server/db/schema.ts, migrations/0010_admin_access.sql (+ meta; replaces the auth SQL functions), apps/web/src/server/{config.ts,app.ts}, apps/web/src/server/auth/{gate.ts,mail.ts,mail.test.ts,gate.db.test.ts}, apps/web/src/server/api/{access.ts,access.db.test.ts}, apps/web/src/client/admin/*, apps/web/src/client/{App.tsx,auth/useAuth.ts,pages/HomePage.tsx,styles.css}, apps/web/e2e/{admin.spec.ts,env.ts,server.ts,helpers.ts}, infra/compose/docker-compose.edge.yml, apps/web/.env.example, docs/adr/0011-auth-otp-and-email.md, docs/runbooks/server-setup.md, BUILD.md, FEATURES.md
**Summary**: Admins admit e-mail addresses in the app with a role (rower, coach, admin), change roles and remove access (which ends the person's sessions); every change is logged; an invitation mail goes out in NL and EN. The first admins come from the new server setting `AUTH_ADMIN_EMAILS` (Ewout's address only in the local, uncommitted `.env`; on the server after approval). Not merged or deployed.
**Prompts used**: "ik heb een admin functie nodig om gebruikers toe te laten tot het systeem. ikzelf ben de eerste admin: …"; answers: admin adds e-mail addresses; roles rower, coach, admin.

## 2026-11-02 — Assign a note to rowers (#105)

**Session**: claude/feat/105-assign-notes (stacked on claude/feat/ui-design-tokens)
**Changed**: apps/web/src/server/db/schema.ts, migrations/0009_note_rowers.sql (+ meta), apps/web/src/server/api/{moments.ts,moments.db.test.ts,annotations.ts,rowers.ts}, apps/web/src/server/app.ts, apps/web/src/client/notes/{NotesPanel.tsx,assignees.ts,assignees.test.ts,strings.ts}, apps/web/src/client/rowers/RowerPicker.tsx, apps/web/src/client/sessions/VideoPage.tsx, apps/web/src/client/styles.css, apps/web/e2e/assign.spec.ts, BUILD.md, FEATURES.md
**Summary**: A note (the frame's drawings and explanation) is now a `moment` row that can be assigned to rowers, with the session lineup suggested first and a "whole crew" shortcut; every change is logged (who, when); a "Notes for" filter shows one rower's notes. Edge E2E 18/18 green. Not merged or deployed.
**Prompts used**: "Plan #105" (plan approved).

## 2026-11-02 — UI style from the design system, light/dark/high-contrast switch (ADR-0012)

**Session**: claude/feat/ui-design-tokens
**Changed**: apps/web/src/client/design/* (new), apps/web/src/client/styles.css, apps/web/src/client/main.tsx, apps/web/src/client/ui/{theme.ts,theme.test.ts,ThemeSwitch.tsx}, apps/web/src/client/pages/HomePage.tsx, docs/adr/0012-ui-design-tokens.md, docs/adr/README.md, BUILD.md, DOCUMENTATION.md
**Summary**: RowLens now uses the Nouryon Design System's tokens and fonts (style only: no name, logo or brand mark) with its button/input/panel/status look on the existing markup, and a light/dark/high-contrast choice per device instead of following the OS. Video sizes measured unchanged (343×193 phone, 427×240 at 1000×540, 970×546 at 1440×900); the video page header got 22 px shorter. Not merged or deployed: Ewout tests locally first.
**Prompts used**: "i want you to use the design system from '/Users/ewout/src/Nouryon/Nouryon Design System'"; answers: style only (no brand), light by default with a switch.

## 2026-11-02 — Session lineup: who sat in which seat (#103)

**Session**: claude/feat/103-session-lineup (stacked on claude/feat/104-rower-roster-2)
**Changed**: apps/web/src/shared/boats.ts (+ test), apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0008_session_lineup.sql (+ meta), apps/web/src/server/api/{lineups.ts,lineups.db.test.ts,rowers.ts,sessions.ts,videos.ts}, apps/web/src/server/app.ts, apps/web/src/client/lineup/*, apps/web/src/client/sessions/{SessionPage,SessionsPage,VideoPage}.tsx, apps/web/src/client/rowers/strings.ts, apps/web/src/client/styles.css, apps/web/e2e/lineup.spec.ts, BUILD.md, FEATURES.md
**Summary**: A session now has a boat class and a lineup: per seat a rower from the roster or one added on the spot, copy from an earlier session, saved as a whole. Shown on the session page, the session list and under the video title. Fixed a phone overflow of the picker's × button (measured 380 px page on a 375 px screen). Not deployed.
**Prompts used**: "Ja, plan #104 + #103".

## 2026-11-02 — Club roster: rowers without an account (#104)

**Session**: claude/feat/104-rower-roster
**Changed**: apps/web/src/server/db/schema.ts, apps/web/src/server/db/migrations/0007_rower_roster.sql (+ meta), apps/web/src/server/api/rowers.ts (+ db test), apps/web/src/server/app.ts, apps/web/src/shared/names.ts (+ test), apps/web/src/client/rowers/*, apps/web/src/client/ui/ConfirmInline.tsx, apps/web/src/client/{App.tsx,pages/HomePage.tsx,sessions/SessionsPage.tsx,styles.css}, apps/web/e2e/rowers.spec.ts, BUILD.md, FEATURES.md
**Summary**: New tenant table `rower` and a Rowers page where coaches add, edit, archive and merge rowers and coxes who may not have an account; adding a name that looks like an existing one asks first. `RowerPicker` (search as you type, add inline) is ready for lineups (#103). Not deployed.
**Prompts used**: "Ja, plan #104 + #103" (plan approved: roster + lineup, two stacked PRs).

## 2026-11-02 — Deploy sha-6fbd5a6: login mail over port 587

**Session**: main (PR #114 merged by Claude on Ewout's "merge en deploy")
**Changed**: server `/opt/rowlens/.env` (`SMTP_PORT=587`, backup `.env.bak-20261102b`); docs/runbooks/server-setup.md, DOCUMENTATION.md
**Summary**: Merged #114 (`6fbd5a6`), switched the server to SMTP port 587 and deployed `sha-6fbd5a6` (run 41407466779, pre-deploy DB backup taken). RowLens ready and reporting `sha-6fbd5a6` with `SMTP_PORT=587`; trustable.nl, api.trustable.nl and AudioScribe answer 200; no error log lines. Ewout confirmed that the login e-mail arrives and login works (one code used, one active session).
**Prompts used**: "Ja, merge en deploy".

## 2026-11-02 — No login mail: outbound port 465 blocked (BUG-010)

**Session**: claude/fix/30-smtp-starttls (code, PR #114); claude/docs/102-coach-rower-backlog (this log, runbook)
**Changed**: apps/web/src/server/auth/mail.ts, apps/web/src/server/auth/mail.test.ts, BUGS.md, docs/runbooks/server-setup.md, DOCUMENTATION.md
**Summary**: Ewout's first production login sent no mail: the code was stored, but smtp.resend.com:465 times out from trustable-prod while 587 connects (AudioScribe uses 587). #114 makes STARTTLS mandatory on every port except 465 and adds 10 s timeouts; checked against the real Resend 587 with an invalid key (STARTTLS ok, 535 after 984 ms). Ewout chose the fix before switching the server to 587.
**Prompts used**: "Geen mail ontvangen"; "Eerst de TLS-fix".

## 2026-11-02 — Deploy sha-5ee4d69 with e-mail login

**Session**: claude/docs/102-coach-rower-backlog
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; server: `/opt/rowlens/bin/rowlens-deploy`, `/opt/rowlens/.env`
**Summary**: With Ewout's approval: reinstalled the deploy script (#98), added the e-mail login settings to `/opt/rowlens/.env` (addresses typed by Ewout in his terminal, the Resend key copied on the server from AudioScribe's env file without printing it, pepper generated on the server; backup `.env.bak-20261102`) and deployed `sha-5ee4d69` (run 41405215472). Migrations 0005–0006 applied; RowLens ready and reporting `sha-5ee4d69`, auth enabled; trustable.nl, api.trustable.nl and AudioScribe answer 200; disk 48 %. A real login e-mail is not yet verified. Closed #28, #53, #54, #60 after checking their criteria against `main`; commented what is left on #22, #29, #30, #33, #39, #59.
**Prompts used**: "Gebruik de api key voor resend die we ook gebruiken voor audioscribe"; "Issues die al gemerged en afgehandeld zijn kun je natuurlijk sluiten"; "Ja, uitvoeren".

## 2026-11-02 — Backlog: coach & rower focus

**Session**: claude/docs/102-coach-rower-backlog
**Changed**: FEATURES.md, PLAN.md, DOCUMENTATION.md; GitHub issues #102–#112, labels `coach` and `rower`
**Summary**: Ewout's coach and rower ideas are now epic #102 with ten stories (roster without accounts, lineups, note assignment, notes in the video, voice notes, my sessions, my notes, first-login claim, reassign, sharing). Three of them are marked decision-needed: where transcription runs (privacy), name matching on first login, and whether rowers can reassign freely. FEATURES.md statuses were brought up to date with what is merged. Done-but-open issues were listed for Ewout and left open.
**Prompts used**: "Evalueer de backlog, we focussen eerste op coaches en roeiers. Voeg deze ideeën toe aan de backlog: …" (coach: positions per session, dictated notes with transcription, notes in the video on/off, assign notes to a rower, add rowers without an account, select known rowers; rower: my sessions, my notes with the video fragment, claim notes on first login, reassign notes, share notes individually or with the crew).

## 2026-11-01 — Handoff from Codex back to Claude

**Session**: codex/feat/28-30-email-auth
**Changed**: docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: The handoff now lists the complete green PR stack through #101, the tested e-mail-auth implementation, production preflight, private Resend/allowlist inputs and explicit approval still needed before merge or deploy. The branch is pushed and the worktree is clean so Claude can continue without reconstructing context.
**Prompts used**: "zorg ervoor dat Claude weer verder kan".

## 2026-11-01 — Production preflight for e-mail authentication

**Session**: codex/feat/28-30-email-auth
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md
**Summary**: Read-only production inspection found release `sha-c15cb47` healthy with its rollback release intact, 48% disk usage and all public neighbour checks returning 200. The app database password and current compose are already present; only the #98 deploy-script update and the approved RowLens authentication variables remain before merge/deploy.

## 2026-11-01 — CI accepts Codex branch names

**Session**: codex/feat/28-30-email-auth
**Changed**: .github/workflows/ci.yml, DOCUMENTATION.md
**Summary**: The branch-name policy now accepts the `codex/` agent prefix required by AGENTS.md alongside the existing `claude/` prefix. This fixes the policy failure on PRs #100 and #101 without weakening the conventional type/slug check.

## 2026-11-01 — One-club e-mail OTP authentication (#28–#30)

**Session**: codex/feat/28-30-email-auth
**Changed**: apps/web/{package.json,.env.example,playwright.config.ts}, apps/web/src/server/{app.ts,config.ts,auth/,db/schema.ts,db/migrations/0006_email_auth.sql}, apps/web/src/client/{auth/,api.ts,App.tsx,pages/HomePage.tsx,sessions/RequireAuth.tsx,sessions/useUploads.ts,styles.css}, apps/web/e2e/{auth.spec.ts,env.ts,helpers.ts,server.ts,upload.spec.ts}, infra/compose/docker-compose.edge.yml, docs/{HANDOFF.md,adr/0011-auth-otp-and-email.md,runbooks/server-setup.md}, PLAN.md, BUILD.md, TEST.md, DOCUMENTATION.md, pnpm-lock.yaml
**Summary**: The shared pilot code is replaced in the user flow by NL/EN e-mail OTP for a one-club allowlist: non-enumerating requests, HMAC-only single-use codes, Postgres rate limits, revocable 30-day sessions, CSRF on JSON and tus uploads, and Resend SMTP in production. Multi-club invitations/self-onboarding moved behind completion of the one-club product. Verified with 207 web tests, 44 worker tests, 30 local and 15 edge E2E tests, 77 deploy checks, the real-Docker deploy/rollback rehearsal and the local login flow; production configuration and deployment still require Ewout's explicit approval and Resend key/member list.
**Prompts used**: "laten we 4 naar achteren schuiven, en eerst de functionaliteit uitontwikkelen voor 1 club, en laten we nu eerst de authenticatie opzetten en deployen naar prod"; "je leest de acties uit github?"; "ok laten we doorgaan".

## 2026-11-01 — Session date now includes its creation time

**Session**: codex/feat/delete-session
**Changed**: apps/web/src/server/api/{sessions.ts,uploads.db.test.ts}, apps/web/src/client/sessions/{SessionsPage.tsx,SessionPage.tsx,strings.ts,strings.test.ts}, apps/web/e2e/upload.spec.ts, BUILD.md, TEST.md, DOCUMENTATION.md
**Summary**: Session list items and the session detail now show the selected training date together with the database creation time, labelled in NL/EN and formatted in the viewer's local time. The API exposes `createdAt` on both session representations; checked on the local laptop/phone layouts, with 191 web tests and 4 desktop/mobile E2E tests.
**Prompts used**: "de timestamp van de sessie moet ook het tijdstip van aanmaken bevatten, niet alleen de datum".

## 2026-11-01 — Delete a whole session with its videos and annotations

**Session**: codex/feat/delete-session
**Changed**: apps/web/src/server/api/{sessions.ts,sessions.db.test.ts}, apps/web/src/client/sessions/{SessionPage.tsx,strings.ts}, apps/web/src/client/styles.css, apps/web/e2e/upload.spec.ts, BUILD.md, TEST.md, DOCUMENTATION.md
**Summary**: A training now has an in-page danger zone to delete it for everyone. The tenant-scoped endpoint locks the session against concurrent video creation, cascades database deletion to every video and annotation, and removes each video's original, renditions and poster; cross-club access remains a 404. Checked with 190 web tests, desktop/mobile E2E and the local UI at laptop and 390×844.
**Prompts used**: "ik wil de hele sectie kunnen deleten, inclusief alle video's en annotaties".

## 2026-11-01 — Handoff to Codex: AGENTS.md and docs/HANDOFF.md

**Session**: claude/docs/handoff-codex
**Changed**: AGENTS.md, docs/HANDOFF.md, DOCUMENTATION.md
**Summary**: Ewout continues with Codex. AGENTS.md (read automatically by Codex) carries the hard rules, his way of working (deploy only on request, local stack first, stacked-PR merge order, no popups, measure layouts) and the commands; docs/HANDOFF.md the current state: production `sha-c15cb47`, the open PR stack and merge order, the next deploy's server steps, local state and the open work. All branches pushed; nothing merged or deployed.
**Prompts used**: "kun je de sessie veiligstellen zodat ik verder kan met codex".

## 2026-11-01 — Confirmations in the page instead of browser popups

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/ui/ConfirmInline.tsx, src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/sessions/SessionPage.tsx, src/client/styles.css, e2e/{drawing,upload}.spec.ts, BUILD.md
**Summary**: Ewout (screenshot of the browser's "localhost:5174 says" dialog, in English): the confirmation must be in the page. All three `window.confirm`s (whole note, drawing, video) now ask inline where they were clicked, NL/EN. E2E fails on any browser dialog and checks that Cancel deletes nothing.
**Prompts used**: "deze confirmatie moet niet als popup gebeuren, maar in de pagina zelf".

## 2026-11-01 — Video display name: [session]-[#]-[start]-[length]

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/db/{schema.ts,migrations/0005_video_seq_recorded_at.sql}, src/server/api/{uploads,sessions,videos}.ts (+ upload db test), src/client/sessions/{displayName.ts,displayName.test.ts,SessionPage.tsx,VideoPage.tsx}, worker/src/rowlens_worker/video/{probe,process}.py, worker/tests/test_probe.py, e2e/{helpers,upload.spec}.ts, BUILD.md
**Summary**: Ewout wants videos named `[sessienaam]-[#]-[tijdstip start]-[lengte]`. A read-only look at his iPhone uploads showed two times in the file: `creation_time` = when it was sent (18:08 the next day), Apple's creationdate = filming start (09:48); the worker now stores the latter as `recorded_at`. Videos get a fixed number per session. Checked locally: `Zaterdag CX4+-2-09:48-0:07`.
**Prompts used**: "de displaynaam van de video moet worden [sessienaam]-[#]-[tijdstip start]-[lengte]".

## 2026-11-01 — Delete a whole note: every drawing and remark at a frame (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/api/annotations.ts (+ db tests), src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/styles.css, e2e/drawing.spec.ts, BUILD.md
**Summary**: Ewout: a whole note must be deletable with all its drawings and remarks. New `DELETE /api/videos/:id/frames/:frame/annotations` (one transaction, only that frame of that video, RLS; other clubs 404) and a red "Notitie verwijderen" button with a confirmation in each section. Tests: only the frame's items go, other frames and videos stay, other clubs can't; E2E deletes a whole note and checks after a reload.
**Prompts used**: "je moet de hele notitie kunnen verwijderen met alle tekeningen en opmerkingen".

## 2026-11-01 — Frame sections: click to jump and select, explanation always open (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{notes,drawing}.spec.ts, BUILD.md
**Summary**: Ewout's feedback on the local build: clicking a frame's section should jump there and show it selected; the drawing labels were too big; the explanation field should always be open. Done: whole section clickable (seek without scrolling the page away on a phone), selected = the frame on screen, smaller chips, an open field per section (edit in place, empty + save removes), the name as its own field. Checked locally on laptop and iPhone; E2E covers click-to-select and the open field (5× without a flake).
**Prompts used**: "als ik in de sectie van een frame klik, dan moet de video direct naar het bijbehorende moment springen en moet de selectie 'selected' zijn. de aanduidingen van de tekenelementen zijn wel groot en het tekstveld voor de uitleg moet gewoon altijd beschikbaar zijn, niet achter een button".

## 2026-11-01 — Deploy script: a first deploy can no longer skip migrations (BUG-009)

**Session**: claude/fix/deploy-migrate-detect
**Changed**: infra/deploy/rowlens-deploy, infra/deploy/test/{run.sh,stub/docker}, BUGS.md, TEST.md
**Summary**: CI's rehearsal on #97 failed: the first deploy skipped the migrations because `compose config` ran without ROWLENS_TAG (no release.env yet), newer Compose refused, and the suppressed error read as "no migrate service". Now the tag is passed and a config failure stops the deploy. Stub suite 77 passed (2 of the new checks fail on the old script); rehearsal passed. Production unaffected so far (release.env exists there); the server's copy of the script is updated with install.sh at the next approved deploy.
**Prompts used**: none (found by CI while working on #97).
## 2026-11-01 — One entry per frame: drawings and their explanation together (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/client/notes/{NotesPanel.tsx,moments.ts,moments.test.ts,strings.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{drawing,notes}.spec.ts, BUILD.md
**Summary**: Ewout, trying drawing locally: several drawings on one frame should be one note, with room for an explanation. The list now groups per frame: drawings as chips with their own ×, the explanation (added with "Uitleg toevoegen" or edited in the entry), one marker per frame. Data model unchanged. Checked locally on laptop and iPhone sizes; E2E covers two drawings + explanation = one entry.
**Prompts used**: "als er in 1 frame meerdere figuren zijn getekend, moet dat maar 1 note opleveren. in de note moet je dan ook extra uitleg kunnen geven".

## 2026-11-01 — Drawing lines, arrows and angles at a frame (#60)

**Session**: claude/feat/60-drawing
**Changed**: apps/web/src/server/api/annotations.ts (+ db test), src/client/drawing/{geometry.ts,geometry.test.ts,DrawingLayer.tsx,DrawTools.tsx}, src/client/notes/{NotesPanel.tsx,name.ts,strings.ts}, src/client/player/Player.tsx (overlay), src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/drawing.spec.ts, BUILD.md, TEST.md
**Summary**: PR 7 of the upload plan, built and tried on the local stack. Line, arrow and angle (degrees in picture pixels, with an arc) drawn by taps on a paused frame, stored as picture fractions, rendered in an SVG that scales like the video so they stay on the picture at any size. Trying it on an iPhone-sized WebKit showed the tools were too far from the picture (below the notes): they moved into the player's toolbar, and choosing one scrolls the picture into view.
**Prompts used**: "Yes, start PR 7"; "Yes, PR 7 locally".

## 2026-11-01 — Local development stack: iterate on the laptop

**Session**: claude/chore/local-dev
**Changed**: infra/compose/docker-compose.dev.yml (worker, port 5434), apps/web/{vite.config.ts,.env.example}, apps/web/src/server/{config.ts,config.test.ts} (API_PORT wins), package.json (dev:up, dev, dev:down), .claude/launch.json, CLAUDE.md, BUILD.md
**Summary**: Ewout wants to iterate locally and deploy later. The whole app now runs on the laptop: Postgres and the worker in Docker, the web app with hot reload on :5174 (his RowLens port; trustable.nl's local stack keeps 5173/5433). Verified the full flow locally (code → session → portrait upload → worker 0.9 s → player with notes). Found on the way: the preview pane sets PORT for the process, so the server took the front end's port; API_PORT now wins. The old RowLens preview server on 5174 (demo era) was stopped and replaced.
**Prompts used**: "ik wil graag itereren op mijn local machine, pas later deployen we weer"; "5147 is toch de rowlens demo".

## 2026-11-01 — Laptop layout for portrait video; 30 fps for phone clips on a 600 Hz grid

**Session**: claude/fix/laptop-portrait-layout
**Changed**: apps/web/src/client/{styles.css,player/Player.tsx,sessions/VideoPage.tsx}, worker/src/rowlens_worker/video/probe.py, worker/tests/test_probe.py, docs/adr/0007, BUGS.md, BUILD.md, TEST.md
**Summary**: Ewout's laptop screenshot: a portrait video as a narrow strip with controls stretched below, in a low window (~540 px), and "31.58 fps". Portrait video now gets three zones on laptops (video tall left, controls beside, notes right); the quality switch moved into the player; softer slider focus. The worker now prefers a common average rate (the clip was 29.99 on average but r_frame_rate 600/19, so 5 % of its frames were duplicates). Checked at 1000×540, 1440×860, 1920×1000 and iPhone.
**Prompts used**: "this does not look good on the laptop" (with screenshot).

## 2026-11-01 — iPhone portrait video fixed; side-by-side video page on laptops

**Session**: claude/fix/ios-player-half
**Changed**: apps/web/src/client/styles.css, src/client/player/{Player.tsx,usePlayer.ts}, src/client/sessions/VideoPage.tsx, src/server/media/store.test.ts, BUGS.md, BUILD.md, TEST.md
**Summary**: Ewout saw only the top half of the picture on his iPhone: Safari ignored `height: 100%` inside the aspect-ratio stage, so portrait video overflowed and was clipped (BUG-005; reproduced in WebKit). The stage now takes the video's shape with a height cap, the video is positioned inside it. His second request: on a laptop the notes needed scrolling; the video page is now two columns from 1000 px (sticky player, scrolling notes). PR 7 (drawing) is parked on its branch meanwhile. Also fixed a flaky store test (BUG-006).
**Prompts used**: "ik zie op de iphone niet het hele beeld, alleen de bovenste helft"; "also on the laptop, the controls and the comments are not visible on the same pageview, i have to scroll down to see the comments. can we have a bit of ux design around this".

## 2026-11-01 — Notes pinned to a frame (#59); lost frame steps fixed (BUG-004)

**Session**: claude/feat/59-frame-notes
**Changed**: apps/web/src/server/db/{schema.ts,migrations/0004_annotations.sql}, src/server/api/annotations.ts (+ db test), src/server/app.ts, src/client/notes/{NotesPanel.tsx,strings.ts}, src/client/player/{Player.tsx,usePlayer.ts}, src/client/sessions/VideoPage.tsx, src/client/styles.css, e2e/{notes.spec.ts,helpers.ts,player.spec.ts}, docs/adr/0007, docs/privacy/processors.md, BUILD.md, TEST.md, BUGS.md
**Summary**: PR 6 of the upload plan: an `annotation` table (notes now, drawings next) with RLS and a same-club key; notes API; notes panel with markers on the scrub bar, jump, edit, delete, remembered name. The new E2E exposed a real player bug: quick frame steps were lost when a stale `seeked` cleared the pending target (fixed, with a regression test that fails 12/12 on the old code). Drizzle-kit ordered the new FK before its unique key; reordered by hand.
**Prompts used**: "Yes, start PR 6".

## 2026-11-01 — Smaller renditions: no near-duplicates, bitrate capped to the source (#47)

**Session**: claude/fix/47-rendition-size
**Changed**: worker/src/rowlens_worker/video/{probe,transcode}.py, worker/tests/{test_probe,test_transcode}.py, docs/adr/0007, BUILD.md, TEST.md, BUGS.md
**Summary**: The first real clip on production (576p, 0.76 Mbit/s, 8 MB) produced 27 MB of renditions: a near-identical play-1080 next to play-540, and uncapped CRF. Now play-1080 only from 720p up, and capped CRF (≤ 1.5× the source bitrate, ceilings scaled by frame rate). Measured in the worker image: 3.3× → 1.7× for that kind of clip; 4K60 HEVC → 0.14×.
**Prompts used**: "yes" (to fixing both findings from the production clip).

## 2026-11-01 — Player on the club's own videos (#49, #52)

**Session**: claude/feat/49-player-own-videos
**Changed**: apps/web/src/server/api/videos.ts (+ unit and db tests), src/server/app.ts, src/client/player/Player.tsx (poster, startFrame, onFrame), src/client/sessions/{VideoPage.tsx,SessionPage.tsx,strings.ts}, src/client/{App.tsx,styles.css}, apps/web/{vitest.config.ts,playwright.config.ts}, e2e/upload.spec.ts, api/uploads.db.test.ts, .github/workflows/ci.yml, docs/adr/0007, BUILD.md, TEST.md
**Summary**: PR 5 of the upload plan. Renditions and posters streamed with byte ranges behind the guard and RLS; a video page with the frame-accurate player, 540p/1080p switch at the same frame, posters in the session list. Edge E2E now runs Chrome to play H.264 and checks exact steps on the worker's output. Fixed along the way: the player overflowed phone screens (also on the demo page); db test files now run one at a time (the media-cap test raced with files adding videos).
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Worker: job queue, probe and transcode (#47, #33, #48)

**Session**: claude/feat/47-worker-transcode
**Changed**: worker/src/rowlens_worker/{__main__,config,db,errors,media,queue}.py, worker/src/rowlens_worker/video/{probe,transcode,process}.py, worker/tests/*, worker/{pyproject.toml,uv.lock,Dockerfile}, apps/web/src/server/db/{schema.ts,migrations/0003_jobs_video_metadata.sql,jobs.db.test.ts}, apps/web/src/server/api/{uploads,sessions}.ts (+ upload test), apps/web/src/client/sessions/{SessionPage.tsx,strings.ts}, apps/web/Dockerfile, apps/web/e2e/upload.spec.ts, infra/compose/docker-compose.{prod,edge}.yml, infra/deploy/test/rehearse.sh, .github/workflows/ci.yml, docs/adr/{0007,0008}, docs/privacy/processors.md, BUILD.md, TEST.md
**Summary**: PR 4 of the upload plan. Postgres job queue with a SECURITY DEFINER claim (RLS shows one club at a time), enqueued with the upload's completion. Python worker probes (fps, rotation, VFR heuristic), transcodes once into CFR H.264 play-1080/play-540 with ~0.25 s closed GOPs and strips location metadata, writes a poster, reports progress and retries with backoff. Session page shows processing and video facts. Verified in the edge stack and on a synthetic 4K60 HEVC portrait clip.
**Prompts used**: "Yes, start PR 4".

## 2026-11-01 — Sessions and resumable upload (#45, #46, #44 minimal, #50)

**Session**: claude/feat/45-upload
**Changed**: apps/web/src/server/api/{sessions,uploads,route-helpers}.ts (+ tests), src/server/media/{store,sniff}.ts (+ tests), src/server/db/schema.ts, db/migrations/0002_sessions_videos.sql, src/server/{app,config}.ts, src/server/pilot/gate.ts (configurable attempts), src/client/sessions/*, src/client/{App.tsx,pages/HomePage.tsx,pilot/strings.ts,styles.css}, e2e/{upload.spec.ts,helpers.ts,server.ts}, apps/web/{package.json,.env.example}, infra/compose/docker-compose.{prod,edge,dev}.yml, infra/deploy/test/rehearse.sh, docs/adr/{0006,0002}, docs/privacy/processors.md, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md, .gitignore
**Summary**: PR 3 of the upload plan. Sessions with videos; our own tus server checks size, type, session, the 30 GB cap (reserved at creation) and the 85 % disk pause before taking bytes, resumes from the on-disk offset and rejects non-videos by magic bytes. Phone UI with camera per file, progress, resume and delete. ADR-0006 amended: a directory instead of MinIO (no longer maintained). Screenshots on a phone viewport led to two UI fixes (progress width, no retry for refused files).
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Pilot access code (#84)

**Session**: claude/feat/84-access-code
**Changed**: apps/web/src/server/pilot/{code,token,gate,code-cli}.ts (+ tests), src/server/rate-limit.ts (+ test), src/server/api/club.ts (+ db test), src/server/db/migrations/0001_pilot_club.sql, src/server/{app,config,main}.ts (+ tests), src/client/{api.ts,pilot/*,pages/HomePage.tsx,styles.css}, e2e/{pilot.spec.ts,server.ts,env.ts,edge.spec.ts}, apps/web/{package.json,.env.example}, infra/compose/docker-compose.edge.yml, docs/runbooks/server-setup.md, BUILD.md, TEST.md
**Summary**: PR 2 of the upload plan: a shared access code opens the pilot club until login exists. Signed 30-day cookie, scrypt-hashed code, rate limits, Origin check on every state-changing request, and guarded routes that look exactly like unknown ones. NL/EN gate page with the pilot notice. Also fixed #86's CI (BUG-001): E2E now runs against a migrated Testcontainers Postgres.
**Prompts used**: "Yes, keep going".

## 2026-11-01 — Database layer (#31): roles, migrations, withTenant, RLS tests

**Session**: claude/feat/31-database
**Changed**: apps/web/src/server/db/{schema,client,tenant,migrate,migrate-cli}.ts, db/migrations/0000_init.sql, db/test/{global-setup,fixtures}.ts, db/{tenant,schema,readiness}.db.test.ts, apps/web/src/server/{config,config.test,main}.ts, apps/web/{package.json,vitest.config.ts,tsconfig.json,tsconfig.build.json,drizzle.config.ts,.env.example}, package.json, pnpm-workspace.yaml (allowBuilds), pnpm-lock.yaml, .prettierignore, infra/compose/docker-compose.{prod,edge}.yml (migrate service, DATABASE_URL), infra/deploy/test/rehearse.sh, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: First PR of the upload + manual analysis plan Ewout approved (prod behind an access code; lines/angles, notes, stroke marking). Drizzle + pg with two roles: migrations as `rowlens_owner`, the app as `rowlens_app` (no BYPASSRLS, owns nothing), and `withTenant` setting the club per transaction. First table `club` with RLS. Tested against a real Postgres via Testcontainers, behind the Caddy mirror, and in the deploy rehearsal. Next deploy needs `ROWLENS_APP_DB_PASSWORD` on the server and the compose file reinstalled (runbook), with approval. Also created #84 (access code) and #85 (stroke marking).
**Prompts used**: "I want to start with the basic fucntionality first, the upload and manual analysis of a video"; answers: lines/arrows/angles, notes pinned to a frame, mark strokes; "Prod behind an access code"; "Ok go for it".

## 2026-11-01 — Deployed sha-94af6b0: player demo live on production

**Session**: claude/docs/deploy-player-demo-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PR #81 merged; trustable-prod: rowlens web → sha-94af6b0 (deploy run 41309728753)
**Summary**: On Ewout's request ("Deploy to prod", demo included) merged #81 after green CI, built sha-94af6b0 with the player demo, and deployed it with the public check on. The deploy took the first real pre-deploy DB dump. Verified: https://trustable.nl/projects/rowlens/demo/player serves 7 synthetic clips with range requests; in the browser over the internet the first frame was ready in 159 ms and 50/50 steps were exact (median 16 ms). trustable.nl, its API and AudioScribe still 200; disk 47 %. Development continues locally; deploys only on request.
**Prompts used**: "Deploy to prod".

## 2026-11-01 — Player demo enabled in production images

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/Dockerfile (demo-media stage, VITE_FEATURE_PLAYER_DEMO build arg), .github/workflows/{images,ci}.yml, BUILD.md, DOCUMENTATION.md
**Summary**: Ewout asked to deploy and chose to include the player demo. The image can now generate the synthetic demo clips in a build stage (no laptop files) and build the SPA with the demo flag; main's images do so. Verified locally on linux/amd64: page 200, 7 clips, range requests 206, image 143 MB. Off by default in the Dockerfile; CI keeps proving the off state has no demo code.
**Prompts used**: "Deploy to prod" → chose "Placeholder + player demo".

## 2026-11-01 — Player demo (#51 spike): frame-accurate player, demo clips, measurements

**Session**: claude/feat/51-player-demo
**Changed**: apps/web/src/client/player/{frames,usePlayer,useHoldRepeat,strings}.ts, Player.tsx (+ frames.test.ts), apps/web/src/client/pages/{PlayerDemoPage,HomePage}.tsx, apps/web/src/client/{App.tsx,features.ts,vite-env.d.ts,styles.css}, apps/web/vite.config.ts (unreachable-chunk drop, API_PORT), apps/web/e2e/{player.spec.ts,smoke.spec.ts,tsconfig.json}, apps/web/{tsconfig.json,package.json}, scripts/demo-media/{generate.sh,Dockerfile}, package.json (demo:media), .gitignore, .dockerignore, .claude/launch.json, .github/workflows/ci.yml, docs/adr/0007-upload-transcode-playback.md, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Built the core player locally behind a build flag: 0.25/0.5/1×, ±1 frame, ±0.1/1 s with hold-to-repeat, loop in/out, fullscreen with an iPhone fallback, keyboard, and a demo page with start/step measurements on generated clips that show their frame number. Desktop results: 0 wrong frames, ~16 ms per step, loop within 2 frames, identical across GOP variants. Testing found and fixed four bugs (loop overshoot, ms-rounded timestamps, stale step target, demo code in prod bundle). Also: home page shows "v" only for semver. No deploy (local-only iteration).
**Prompts used**: "lets iterate locally first without the deployments to the server"; "Player demo first".

## 2026-11-01 — RowLens public at trustable.nl/projects/rowlens; no staging environment (#24, #26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, scripts/github/backlog.toml (staging story removed), .github/workflows/deploy.yml (input text), FEATURES.md, DOCUMENTATION.md; GitHub: trustable.nl#377 merged into develop, release trustable.nl#378 (v0.19.1) merged into main; rowlens issues #24, #26 closed, #27 closed as not planned
**Summary**: Released the Caddy route through trustable.nl's pipeline (develop → its staging deploy → main → its prod deploy). https://trustable.nl/projects/rowlens/ now serves RowLens sha-1acc1a2; trustable.nl, its API and AudioScribe verified 200, RowLens containers unaffected by trustable's redeploy. trustable's ci-regression check fails on every release since May (Playwright can't install Chromium on the ubuntu 26.04 runner) and was not a blocker. Ewout pointed out that the trustable staging redeploy wasn't asked for: RowLens has **no staging** — local dev and prod only; staging plans removed.
**Prompts used**: "Yes, release it"; "why are we deploying to staging, i did not ask for that. we will have a local dev version and prod on trustable.nl only".

## 2026-11-01 — First production deploy (sha-1acc1a2) and stack merged to main (#26)

**Session**: claude/docs/26-first-deploy-log
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; GitHub: PRs #67–#71 merged into main (merge commits), issues #23 and #25 closed; on trustable-prod: Compose project `rowlens` (web + db), volume rowlens_db_data, network rowlens_internal, rowlens-web attached to trustable_proxy, /opt/rowlens/state/{current-tag,release.env}
**Summary**: Merged the stacked PRs in order. Deleting #67's branch made GitHub close #68 rather than retarget it; restored the branch, reopened #68 and merged the rest by retargeting each to main first (lesson: in a stack, retarget before merging and delete branches only at the end). The images workflow pushed sha-1acc1a2, and the deploy workflow (public check off, since trustable.nl#377 isn't merged) brought up web + db: healthy, reachable from trustable's Caddy via the `rowlens-web` alias, no registry credentials left, trustable containers untouched. Open: release-please can't create PRs (repo setting), merged branches not yet deleted, Dependabot #72/#73 propose Node 26 / Python 3.15 against our pins.
**Prompts used**: "Yes, merge them"; "It's green, merge"; "Approve #26".

## 2026-11-01 — install.sh run on trustable-prod: deploy script installed, CI key restricted (#25)

**Session**: claude/feat/25-manual-deploy
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens/bin/rowlens-deploy, /opt/rowlens/docker-compose.yml, /opt/rowlens/state/, the gh-actions-rowlens line in /home/deploy/.ssh/authorized_keys (backup authorized_keys.bak-20261101T115732Z)
**Summary**: Ran the approved infra/deploy/install.sh. Installed files match the repo by sha256; the CI key now only runs rowlens-deploy (verified: status allowed; arbitrary/chained commands, shell, invalid tag and port forwarding refused). Other keys, /opt/trustable and all trustable containers unchanged. No RowLens containers yet.
**Prompts used**: "Approve install.sh".

## 2026-11-01 — #25 Manual deploy: images on main, workflow_dispatch deploy, server script with rollback

**Session**: claude/feat/25-manual-deploy (stacked on claude/docs/23-server-setup-runbook)
**Changed**: .github/workflows/{images,deploy,ci}.yml, infra/deploy/{rowlens-deploy,install.sh,known_hosts}, infra/deploy/test/{run.sh,rehearse.sh,stub/docker}, infra/compose/docker-compose.prod.yml (now web + db), apps/web/Dockerfile (APP_VERSION build arg), docs/adr/0002-hosting-and-isolation.md, docs/runbooks/server-setup.md, BUILD.md, CLAUDE.md, TEST.md
**Summary**: Merges to main now build and push sha-tagged images; deploying is a manual, owner-only workflow that SSHes with the CI key into a forced-command script (`rowlens-deploy`) on the server, which pulls with the run's short-lived token, backs up the DB, migrates, starts, checks that web runs the new tag and is ready, and rolls back otherwise. Covered by 71 stubbed checks, a mutation check and a real-Docker rehearsal, all in CI. Nothing installed on the server yet (install.sh needs approval).
**Prompts used**: "Build #25 deploy".

## 2026-11-01 — /opt/rowlens and .env created on trustable-prod (#23)

**Session**: claude/docs/23-server-setup-runbook
**Changed**: docs/runbooks/server-setup.md, DOCUMENTATION.md; on trustable-prod: /opt/rowlens (created by Ewout with su), /opt/rowlens/{media,.docker}/, /opt/rowlens/.env
**Summary**: Ewout created /opt/rowlens as root via `su` (no sudo for deploy, no root SSH). I added media/ and .docker/ and generated .env on the server (password never printed). /opt/trustable untouched, disk unchanged at 46 %. Still pending: merging trustable.nl#377. Ewout has since set the ROWLENS_SSH_PRIVATE_KEY secret.
**Prompts used**: "i have the password for root, not deploy"; the user's pasted `su -c 'install -d …'` session output.

## 2026-11-01 — Server setup started: deploy key installed, Caddy route PR opened (#23, #24)

**Session**: claude/docs/23-server-setup-runbook (stacked on claude/test/22-local-edge-stack)
**Changed**: docs/runbooks/server-setup.md (new), BUILD.md, DOCUMENTATION.md; on trustable-prod: /home/deploy/.ssh/authorized_keys (+1 key `gh-actions-rowlens`, backup authorized_keys.bak-20261101-rowlens); local: ~/.ssh/rowlens_deploy{,.pub}; trustable.nl repo: PR #377 (Caddyfile, VERSION 0.19.1, DOCUMENTATION.md)
**Summary**: Executed the approved shared-component changes. The new CI deploy key is installed and verified, existing keys and all trustable containers unaffected. The Caddy route PR is open against trustable.nl develop and not merged. Not done: /opt/rowlens (needs sudo, which deploy can't use without a password), the GitHub secret (the agent may not write secret stores), and .env; the commands for Ewout are in the runbook.
**Prompts used**: "Approve both" (approval of #23 and #24 exactly as shown).

## 2026-11-01 — Local edge stack: RowLens behind a Caddy mirroring trustable.nl (#22, partial)

**Session**: claude/test/22-local-edge-stack (stacked on claude/feat/19-web-app-skeleton)
**Changed**: infra/caddy/{rowlens.caddy,edge.Caddyfile,standin.Caddyfile}, infra/compose/docker-compose.edge.yml, apps/web/e2e/{edge.spec.ts,env.ts,smoke.spec.ts}, apps/web/playwright.config.ts, apps/web/package.json, package.json, .github/workflows/ci.yml, docs/adr/0003-base-path.md, BUILD.md, CLAUDE.md, TEST.md, scripts/github/backlog.toml (#46)
**Summary**: Added a local stack where rowlens-web runs behind a copy of trustable.nl's Caddyfile that imports the exact route proposed in #24, with stand-ins for AudioScribe and the trustable.nl site, plus Playwright edge tests and a CI job. Found that Caddy's body limit is only a backstop and that trustable.nl's Permissions-Policy blocks the microphone for RowLens; both recorded in ADR-0003.
**Prompts used**: "can I test locally before deploying to prod?" → "Yes, add it" (a local Caddy stack that mirrors the prod route).

## 2026-11-01 — #19 Web app skeleton: Fastify + React SPA under the base path

**Session**: claude/feat/19-web-app-skeleton (stacked on claude/chore/17-phase-0-foundation)
**Changed**: apps/web/src/server/{app,config,health,main}.ts (+ tests), apps/web/src/client/** (React SPA), apps/web/src/shared/base-path.ts (moved from src/config), apps/web/{index.html,vite.config.ts,playwright.config.ts,e2e/smoke.spec.ts,tsconfig*.json,src/client/tsconfig.json,Dockerfile,package.json,public/favicon.svg}, eslint.config.js, .github/workflows/ci.yml, BUILD.md, CLAUDE.md, FEATURES.md, TEST.md
**Summary**: Replaced the placeholder HTTP server with the real web tier: Fastify serving health/readiness, a JSON API 404, strict CSP and the Vite-built React SPA with fallback, all under BASE_PATH, with a build-time base path checked at startup. Added Playwright smoke tests (desktop + mobile Chromium) to CI; they caught a non-canonical home link, fixed via a trailing-slash router basename.
**Prompts used**: "Yes, start sprint 1" (sprint plan in docs/phase-0/summary.md; first item #19).

## 2026-11-01 — Phase 0 decisions recorded

**Session**: claude/chore/17-phase-0-foundation
**Changed**: docs/adr/0002, 0003, 0004, 0006, 0010, 0011, docs/adr/README.md, docs/phase-0/summary.md, docs/privacy/processors.md, BUILD.md, CLAUDE.md, infra/compose/docker-compose.prod.yml, scripts/github/backlog.toml; GitHub issues #2, #18, #25, #27, #30, #32, #35, #36, #37, #46, #64
**Summary**: Recorded Ewout's Phase 0 decisions: MinIO on local disk with a 30 GB hard media cap and uploads paused at 85 % disk; no video backup during the pilot; sender rowlens@trustable.nl via Resend; subpath now, own host before club 2; logs only (no error tracker); no branch protection (free private plan), so deploys become a manual workflow_dispatch; LLM provider deferred to M2. ADR-0006 accepted; backlog and issues synced.
**Prompts used**: Answers to structured decision questions in the session (storage "Local disk for now", backups "No video backup yet", sender "rowlens@trustable.nl", origin "Subpath now, move before club 2", media cap "30 GB", errors "Logs only for now", GitHub "No protection, by convention", LLM "Defer to M2").

## 2026-11-01 — Phase 0: server inspection, ADRs, repo scaffold, CI, backlog

**Session**: claude/chore/17-phase-0-foundation
**Changed**: CLAUDE.md, README.md, PLAN.md, BUILD.md, FEATURES.md, TEST.md, BUGS.md, DOCUMENTATION.md, docs/phase-0/server-inspection.md, docs/phase-0/summary.md, docs/adr/0000–0011, docs/analysis/perspective-rules.md, docs/privacy/processors.md, apps/web/** (base-path module, placeholder server, tests, Dockerfile), worker/** (pyproject, stroke_rate metric, tests, Dockerfile), infra/compose/docker-compose.{dev,prod}.yml, .github/** (CI, release, templates, dependabot), scripts/github/** (backlog bootstrap), root tooling config
**Summary**: Base path is `/projects/rowlens` (changed from the kick-off prompt's `/projects/rowing` at Ewout's request mid-session). Read-only inspection of trustable-prod and the AudioScribe/trustable deploy setup; proposed architecture in 10 ADRs; scaffolded the monorepo with a tested base-path module and a first analysis metric so CI has real targets; created labels, milestones and the M0/M1 backlog (M2/M3 as epics) on GitHub. Nothing deployed; no server changes.
**Prompts used**: the RowLens kick-off prompt (Phase 0 section: "1. Read-only inspection of the server and the AudioScribe deployment … 5. Present a short summary: findings, decisions needing my input, risks, and the proposed first sprint.") pasted as the opening message of the session; mid-session: "contrary to the original prompt, do not use trustable.nl/projects/rowing but trustable.nl/projects/rowlens".
