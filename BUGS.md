# BUGS

Known issues and fix status. Format: see `~/.claude/CLAUDE.md`.

### [BUG-052] Registration has no club choice or clubless request record — medium
**Location**: apps/web/src/client/auth/LoginGate.tsx; apps/web/src/client/sessions/RequireAuth.tsx; apps/web/src/server/auth/unified-gate.ts
**Status**: open
**Found**: 2026-11-07 (production feedback after PR #157)
**Description**: Email entry only requests a login code. Club choice requires later verification and name completion, and the Requests view includes only explicitly submitted club applications. There is no distinct registration form or administrator-visible clubless registration record.
**Fix**: Proposed explicit registration/optional club choice, OTP-bound intent and scoped registration/application views; see docs/plans/registration-onboarding.md. Await architectural approval before a migration or auth changes.

### [BUG-051] Enabled-auth release image smoke lacked SMTP fixtures — low
**Location**: .github/workflows/ci.yml
**Status**: fixed
**Found**: 2026-11-07 (CI run 42390255322)
**Description**: Enabling unified authentication in release images caused the isolated image smoke to fail production configuration validation because SMTP fixtures were absent.
**Fix**: Supply synthetic SMTP configuration to the smoke container; keep production validation intact. CI checks ready status and enabled unified authentication without sending mail.

### [BUG-050] Concurrent/recycled email could redirect a club admission — high
**Location**: apps/web/src/server/db/migrations/0024_account_management.sql
**Status**: fixed
**Found**: 2026-11-07 (unreleased identity concurrency review)
**Description**: Email-keyed provisioning/admission could read an address before its verified change and write a grant afterward; a later editor submission could target a different account that reused the old address.
**Fix**: Bind editor grants to immutable account ID and expected membership state. Coordinate confirmation, OTP/provisioning/adoption, approval and initial-admin writers through identity/mailbox/admission locks and fresh email checks. A real queued-lock regression rejects stale admission and a recycled-address form, while the updated address grants only the intended account.

### [BUG-047] Club-admin email confirmation could transfer other-club authority — high
**Location**: apps/web/src/server/db/migrations/0024_account_management.sql
**Status**: fixed
**Found**: 2026-11-07 (during unreleased implementation review)
**Description**: New-mailbox proof alone would allow a club administrator to change a member's login to a mailbox they control, inheriting that member's other-club/global authority.
**Fix**: Club initiators cannot confirm for another user. The target must authenticate their existing account and enter the new-mailbox code on the owner confirmation page; requester authority is rechecked. SQL/API and laptop/iPhone browser regressions preserve other-club membership/roles and reject the initiator's confirmation.

### [BUG-048] Empty reserved-address arrays produced invalid email-proof SQL — medium
**Location**: apps/web/src/server/auth/account-management.ts
**Status**: fixed
**Found**: 2026-11-07 (new integration tests)
**Description**: Direct Drizzle interpolation of an empty address array generated a SQL list rather than a typed text-array value; request tests returned 500.
**Fix**: Build the bound array from JSON text through jsonb_array_elements_text. Tests cover empty and configured address lists, protected sources/destinations and duplicate addresses.

### [BUG-049] Null SQL proof/authority inputs needed explicit refusal — medium
**Location**: apps/web/src/server/db/migrations/0024_account_management.sql
**Status**: fixed
**Found**: 2026-11-07 (unreleased permission-layer review)
**Description**: HTTP validation rejects null, but SQL three-valued comparisons alone would not reliably refuse a null hash or null role state in a direct protected-function call.
**Fix**: Explicit null guards for hashes, expected/enabled authority and identity revision, plus a verified-target requirement. Direct app-role SQL regressions reject null proof/authority inputs and API tests reject unverified targets.

### [BUG-046] Global account settings incorrectly required a selected club — medium
**Location**: apps/web/src/server/auth/unified-gate.ts:168
**Status**: fixed
**Found**: 2026-11-07
**Description**: The global Users page could list accounts without memberships, but its settings API still required an explicit club when multiple clubs existed. A platform administrator with no selected club received 404.
**Fix**: Scope only the exact administrative user-settings route to the global account for persisted platform actors. Tenant administrators retain live club/target-membership checks. Protected account read/save audits use UUIDs in the repository transaction; a regression verifies an account with zero memberships, revision conflict and withdrawn platform authority.

### [BUG-045] Unified club member list included unused access addresses — medium
**Location**: apps/web/src/server/api/access.ts:128
**Status**: fixed
**Found**: 2026-11-07
**Description**: The unified club member list inherited the legacy allowlist register and could show addresses without a club membership. A membership without a matching grant was also mislabeled server-managed, obscuring role editing.
**Fix**: In unified mode, enumerate actual current-club memberships and mark membership-only entries editable unless explicitly server-managed. Integration coverage checks all members, exclusion of other-club/account-only users, role assignment and cross-club denial. Legacy feature-off behavior remains.

### [BUG-044] Platform bootstrap fails on audit parameter type inference — medium
**Location**: apps/web/src/server/db/grant-platform-admin-cli.ts:25
**Status**: fixed
**Found**: 2026-11-07
**Description**: The operator bootstrap reused one parameter in UUID and text contexts without first fixing its type. PostgreSQL rejected the audit insert with 42P08 and rolled back the administrator grant.
**Fix**: Cast the parameter to UUID explicitly, then convert that UUID to audit text. Real CLI subprocess integration tests cover a verified grant, repeat invocation with exactly one audit event, unverified-account refusal and email non-disclosure.

### [BUG-043] Missing club context could silently select a different membership — medium
**Location**: apps/web/src/server/auth/unified-gate.ts:122
**Status**: fixed
**Found**: 2026-11-07
**Description**: An old tab or API client without a club UUID could use the first available club after memberships changed. Both clubs were authorized, but a mutation could land in an unintended club.
**Fix**: Require explicit context on club content routes whenever more than one club is available. Global account operations remain independent, and tests require 404 for ambiguous reads and training creation while explicit A/B requests keep their own roles.

### [BUG-042] Upload responses could precede commit and busy-slot release — high
**Location**: apps/web/src/server/api/uploads.ts:171
**Status**: fixed
**Found**: 2026-11-07
**Description**: PR CI observed a completed upload before its processing job was visible and an immediate termination still returning 423. Reply.send inside the transaction acknowledged the request before COMMIT/final cleanup.
**Fix**: Return plain transaction outcomes and send only after commit and slot release. A deferred PostgreSQL commit gate fails before the fix and passes after; 13 upload tests, 541 full web/DB tests and 6 upload/permissions browser cases pass locally.

### [BUG-038] Account-first admission could bypass existing admin safeguards — high
**Location**: apps/web/src/server/api/access.ts:160
**Status**: fixed
**Found**: 2026-11-07
**Description**: The new admission path needed the same immutable server-admin, self-demotion and last-club-admin protections as existing role updates. A global administrator's independent non-admin club role must remain editable.
**Fix**: Check server-managed identities before the new path and enforce existing-member safeguards in the serialized SQL operation. An integration regression covers self, last-admin, server-admin and global-admin-as-rower cases.

### [BUG-039] Legacy session adoption could revive a withdrawn proof — high
**Location**: apps/web/src/server/auth/unified-gate.ts:86
**Status**: fixed
**Found**: 2026-11-07
**Description**: Fallback lookup must not accept a legacy bearer after its adopted account proof is revoked, and old logout must invalidate the adopted proof during an upgrade/rollback window.
**Fix**: Lock before adoption, preserve token revocation on conflicts, synchronize legacy logout, and re-resolve the account proof without an independent permissive fallback. Tests verify legacy logout, membership revocation and account logout-others.

### [BUG-040] Tenant-only account-access policies allowed role mutations without club-admin RLS — high
**Location**: apps/web/src/server/db/schema.ts:169
**Status**: fixed
**Found**: 2026-11-07
**Description**: API admin guards protected access management, but membership/access tables lacked restrictive policies rejecting role writes from ordinary same-club contexts.
**Fix**: Add restrictive membership/access/access-log policies in migration 0022, with direct SQL self-escalation and two-club regressions.

### [BUG-041] Account-only routing considered query text — medium
**Location**: apps/web/src/server/auth/unified-gate.ts:153
**Status**: fixed
**Found**: 2026-11-07
**Description**: Checking the entire request URL for the own-profile prefix could let an account-only session reach a protected club handler by putting that prefix in a query. Tenant RLS still denied actual club data.
**Fix**: Match the server's registered route prefix, with a regression requiring a plain 404 for the crafted query.

### [BUG-036] Long club names could push the header outside a laptop viewport — low
**Location**: apps/web/src/client/styles.css:3446
**Status**: fixed
**Found**: 2026-11-07
**Description**: A valid 76-character unbroken club name widened the header beyond a 1000 px window. A browser regression reproduced document overflow before the fix.
**Fix**: Constrain the brand container and ellipsize the club label; preserve the full accessible name/title. Test on laptop and iPhone WebKit.

### [BUG-037] A pending invitation could restore a broader role after admission — high
**Location**: apps/web/src/server/db/migrations/0020_unified_accounts.sql:169
**Status**: fixed
**Found**: 2026-11-07
**Description**: Approving a new member as rower must not retain an older coach grant that provisioning could restore on a later login. Direct admission and subsequent revocation must also keep application state consistent.
**Fix**: Commit matching membership/access roles and application decisions atomically; revocation preserves the account and applies the reapplication cooldown. Integration regressions cover both paths.

### [BUG-035] Native club selectors were undersized on iPhone WebKit — low
**Location**: apps/web/src/client/styles.css:3441
**Status**: fixed
**Found**: 2026-11-07
**Description**: The new club-management selectors could render below the 44 px touch target on WebKit even with min-height. The browser layout check caught it.
**Fix**: Set explicit selector height alongside minimum height and verify on iPhone WebKit and low laptop. Administrator selector also receives an explicit accessible name for stable label-based interaction.

### [BUG-034] Permission migration could broaden old web handlers before their replacement — high
**Location**: apps/web/src/server/db/migrations/0019_club_training_permissions.sql, apps/web/src/server/db/tenant.ts
**Status**: fixed in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155) (not merged/deployed)
**Found**: 2026-11-06, final release-order review before any production action
**Description**: Deployment migrates before replacing the web container; the prior image's media handlers assume visible trainings are writable. Broad new reads plus strict new writes could let those old handlers touch files after a zero-row deletion. Rolling back to the old image would recreate that mismatch.
**Fix**: The new server sets a fixed per-transaction permission capability, never from request input. Migration 0019 uses the new read/write split only for that capability; missing context keeps the old image's existing visibility/write scope aligned. Unknown capabilities deny training access. A regression first exposed an extra legacy-visible ownerless training, then verifies old and new role semantics together; no extra migration/table/dependency or server reconfiguration.

### [BUG-033] Slow upload chunks could exceed the parent-lock transaction timeout — high
**Location**: apps/web/src/server/api/uploads.ts (`appendChunk`)
**Status**: fixed in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155) (not merged/deployed)
**Found**: 2026-11-06, slow-stream regression during #154 implementation
**Description**: Holding a parent lock during streaming exposed the connection's normal 15-second idle-transaction timeout. A slow phone upload could lose its authorization lock and fail when saving progress.
**Fix**: Disable that idle limit only within the authorized upload transaction; bound each chunk stream to five minutes, destroying a stalled source and releasing its lock. A 16-second stream regression first reproduced the disconnected transaction, then requires successful upload and persisted progress.

### [BUG-032] Upload could retain stale ownership after a concurrent creator transfer — high
**Location**: apps/web/src/server/repositories/training-access.ts (`lockEditableSession`)
**Status**: fixed in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155) (not merged/deployed)
**Found**: 2026-11-06, concurrency regression during #154 implementation
**Description**: An upload waiting on a locked session used a pre-transfer authorization snapshot. After an admin transferred the creator, the old owner could still append bytes and receive 204.
**Fix**: Hold the parent row lock and recheck edit permission in a fresh SQL statement before any media effect. Integration test waits for an actual database lock, commits the transfer and requires refusal with the original bytes intact; it failed with 204 before the fix and passes afterward.

### [BUG-031] Saving a profile could discard unsaved role choices — medium
**Location**: apps/web/src/client/admin/AccessPage.tsx (`AccessRow`)
**Status**: fixed locally (codex/feat/151-admin-user-settings)
**Found**: 2026-11-06, combined role/profile form verification
**Description**: A users-list refresh replaced role-array references and reset pending role checkboxes, including after saving that same person's profile.
**Fix**: Keep an explicit role draft and its original expected-role snapshot until save/cancel/reload; list refreshes do not erase it. Browser test first failed on the unchecked Coach box, then passed after the fix; concurrent role changes return 409 while preserving the draft until an explicit reload.

### [BUG-030] A transient focus-refresh failure could discard an open edit — medium
**Location**: apps/web/src/client/auth/useAuth.ts (`refreshAuth`, `loadState`)
**Status**: fixed locally (codex/feat/151-admin-user-settings)
**Found**: 2026-11-06, final review of focus synchronization
**Description**: A failed/503 authentication refresh on window focus was treated as a closed login gate, unmounting an authenticated page and its draft even when the server had not rejected the session.
**Fix**: Preserve the last confirmed authentication state on transport/server failures; explicit disabled/access-denied responses still clear access. Browser coverage simulates a 503 during an open profile draft and checks that an explicit session rejection still closes it.

### [BUG-029] Expanded user settings overlapped Save on phones — medium
**Location**: apps/web/src/client/styles.css (`.list__item.access > .access__settings`)
**Status**: fixed locally (codex/feat/151-admin-user-settings)
**Found**: 2026-11-06, mobile browser verification of the new admin editor
**Description**: Generic list-child flex/grid rules overrode the expanded editor's intended full width, allowing long controls to overlap its Save action.
**Fix**: Give the expanded editor an explicit full-width flex row, single-column fields and constrained selects; keep row actions in a separate flex group. Verify real taps and document overflow on phone and low laptop windows.

### [BUG-028] An open own-profile form could overwrite a newer admin edit — medium
**Location**: apps/web/src/client/ui/ProfileForm.tsx, apps/web/src/server/api/profile.ts
**Status**: fixed locally (codex/feat/151-admin-user-settings)
**Found**: 2026-11-06, inspection while implementing centralized admin settings
**Description**: Local component state retained the old name/boat after a remote account update; saving the entire old form without a revision could replace the newer profile.
**Fix**: Untouched forms use refreshed account values; a draft captures its revision and preserves edits across refreshes. Stale saves return 409 and require an inline reload. Preference writes are partial, revision checked and serialized separately; legacy own-profile requests remain compatible.

### [BUG-027] Expanded inline stroke editor could widen the phone table — low
**Location**: apps/web/src/client/styles.css (`.strokes__table`)
**Status**: fixed locally (codex/feat/85-inline-stroke-tools)
**Found**: 2026-11-06, screenshot review during the inline moment controls change
**Description**: The first implementation let expanded confirmation content size the table, producing internal horizontal scrolling and clipped text even though the page itself did not overflow.
**Fix**: Constrain table layout and action-column widths; override numeric header nowrap so headings cannot overlap. E2E checks both table scroll width/offset and document overflow, including expanded confirmation on laptop, 1000×540 and iPhone WebKit.

### [BUG-024] Point placement showed an unwanted progress menu — low
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx (`.drawing-confirm`)
**Status**: fixed locally (codex/fix/141-direct-drawing-points; pending review)
**Found**: 2026-11-05, Ewout: wants the first dot directly, then the second, without a "Point 1 of 2" menu
**Description**: After the first point, the drawing controls appeared with a point counter; measurement attributes could show the strip before any point. This interrupted the requested direct point-placement flow.
**Fix**: Render drawing/measurement controls only after all two or three points are placed. The first tap still shows its visible point/ring immediately; partial angles keep their points without a menu. Adjustment, Save/Redo/Cancel and rower/joint choices remain available after completion, including fullscreen. Removed the unused NL/EN point-counter copy; no geometry or save changes.

### [BUG-023] Catch and finish removal was hidden behind toggling the exact frame — medium
**Location**: apps/web/src/client/strokes/StrokesPanel.tsx, apps/web/src/client/sessions/VideoPage.tsx
**Status**: fixed locally (codex/feat/85-remove-stroke-marks; pending review)
**Found**: 2026-11-05, Ewout: catch and finish marks could not be removed through an obvious action
**Description**: The API already deletes stroke marks, but the UI only exposed deletion by pressing the same kind again on its exact frame. There was no explicit removal action for a listed catch, finish or half-slide mark.
**Fix**: A coach/admin can expand "Edit or delete marks" in Strokes and delete any stored mark with an inline confirmation. The request targets the chosen mark's frame independently of the current playback frame; errors retain the mark, and reloaded data updates timeline/timings. Keyboard/current-frame toggling remains supported. No database or permission changes.

### [BUG-022] Slow playback and pause fail intermittently on a physical iPhone after drawing — high
**Location**: apps/web/src/client/player/Player.tsx, apps/web/src/client/ui/PressButton.tsx, apps/web/src/client/drawing/DrawingLayer.tsx
**Status**: in-progress (candidate fix on codex/fix/bug-022-playback-controls; physical iPhone confirmation pending)
**Found**: 2026-11-05, Ewout on production `sha-5ef325b`, usually after a line or angle
**Description**: On the physical iPhone, tapping 0.25×/0.5× leaves 1× selected and playback at normal speed; pause sometimes also ignores the tap. Exact production source built locally passes normal pointer/click tests (9/9), so the original physical gesture is not fully reproduced. Suppressing the compatibility mouse click in a focused WebKit test reproduces the ignored speed button (expected selected=true, got false), which identifies a matching activation failure mode rather than a media-rate calculation error.
**Fix**: Speed and play/pause buttons now activate once on a valid primary-pointer release inside the button; they keep keyboard/assistive click activation, cancel on pointer cancellation/leave, and ignore the later compatibility click to avoid toggling twice. Drawing drags explicitly release pointer capture on up/cancel and clear abandoned drags on lost capture. The missing-click regression goes from failing to passing, with actual media-clock progression and pause checks. The original physical iPhone sequence still needs confirmation; do not treat this as proof of the underlying Safari cause.

### [BUG-021] The measurement bar covered drawing points on small pictures — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/styles.css (`.drawing-confirm`)
**Status**: fixed locally (codex/fix/141-unobstructed-editing; pending review)
**Found**: 2026-11-05, editing review at 1000×540; the bar also occupies a large part of an iPhone picture
**Description**: The rower/joint/save overlay intercepts clicks in the lower part of the video. The angle E2E passed on a large desktop but could not place a knee and ankle at y=0.7 on a low laptop window. Native WebKit selects also measured only 20 px tall despite `min-height`, making the choices hard to tap.
**Fix**: Put drawing and measurement controls directly below the picture inside the fullscreen player; keep the full picture available and explicitly size selects/buttons to 44 px. Regression checks cover overlap, touch-target height, persistence after reload and fullscreen on laptop, low laptop and iPhone WebKit. Test setup now scrolls the picture into view before coordinate input; rapid-seek coverage remains in the player suite (BUG-012 is still open).

### [BUG-020] The strokes E2E asserted a catch jump that only held while a removal was in flight — low
**Location**: apps/web/e2e/strokes.spec.ts (the ↑ check after `i`)
**Status**: fixed (opencode/docs/141-deploy)
**Found**: 2026-11-05, the `edge` CI job on the deployment-log PR (#143), twice in a row on a slower runner (27 passed, 1 failed), while it passed locally and on `main`'s merge commit minutes earlier
**Description**: The test pressed `i` (taking the catch at frame 85 off) and then asserted that ↑ lands on 85. `neighbourCatch` jumps to the previous catch *strictly before* the frame, so once the deletion had landed the jump went to 50; the assertion only held while the sidebar still showed the old marks, which is why it passed on a fast machine and failed under load.
**Fix**: Check ↑ (85 → 50) and ↓ (50 → 85) with every mark in place, before taking the catch off.

### [BUG-019] A just-selected drawing was dropped again on WebKit — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx (`.drawing__catcher`)
**Status**: fixed (opencode/feat/141-draggable-drawings)
**Found**: 2026-11-05, iPhone 13 WebKit check on the edge stack (scratch spec, touch)
**Description**: A tap on a saved drawing selected it (rings appeared) and the same tap dropped it: the catcher that carries the presses of a selected drawing is mounted *during* that press, and WebKit sends the click to whatever is under the finger when it lifts — the catcher — so its "tap beside it drops the selection" handler ran on the very tap that selected. Chromium sends the click to the common ancestor of press and release and happened to be fine, so the desktop E2E passed while a real Safari would not.
**Fix**: The catcher drops a selection only when the press started on it (`catcherPress` ref, reset on every press and on a drag).

### [BUG-018] The invisible press area of a point skipped its own centre (Chromium) — medium
**Location**: apps/web/src/client/drawing/DrawingLayer.tsx, apps/web/src/client/styles.css (`.drawing__handle-hit`)
**Status**: fixed (opencode/feat/141-draggable-drawings)
**Found**: 2026-11-05, edge E2E: pressing a ring of a selected boat line hit the catcher instead of the ring, so nothing could be dragged
**Description**: The ring's press area was a transparent `<circle>` with `pointer-events: stroke`, 56 px wide through `vector-effect: non-scaling-stroke`. In Chromium the hit area of that non-scaling stroke does not cover the circle's centre: probing showed the catcher at the centre and at ±12 px, the circle only from ~20 px outwards. The painted strokes (lines, dash patterns) are unaffected, which is why only small circles showed it. Measured with a scratch page (`elementFromPoint` at offsets) before changing anything.
**Fix**: The press is never tested by the DOM: the layer finds the nearest point of the selected drawing in screen pixels (`handleAt`, 28 px reach, the same as while drawing) on a catcher that sits on top of the drawings. The rings are what you see.

### [BUG-017] Boat-line taps in the angles E2E don't register on emulated iPhone WebKit — low
**Location**: apps/web/e2e/angles.spec.ts:61, apps/web/src/client/drawing/DrawingLayer.tsx (suspected)
**Status**: open
**Found**: 2026-11-03, edge E2E on Playwright's iPhone 13 WebKit with touch (scratch config)
**Description**: After "Draw boat line" the two `touchscreen.tap`s place no point, so the test times out with the prompt still open. The same run on `main` fails the same way, so it predates the zoom change; drawing a line with a finger on a zoomed picture in the same setup works. Unknown whether a real iPhone is affected (the coaches drew boat lines on one after #135).
**Fix**: —

### [BUG-016] A rower added in the lineup is sometimes missing after saving — medium
**Location**: apps/web/src/client/lineup/LineupCard.tsx, apps/web/src/client/rowers/RowerPicker.tsx (suspected)
**Status**: open
**Found**: 2026-11-03, local edge E2E while the Mac was under load (load average 6–17)
**Description**: In four edge runs the last rower picked or added inline into a lineup was missing from the saved lineup (lineup.spec: the stroke seat empty after a reload although it showed the name before Save; angles.spec and sessions.spec failing because of the missing rower). Not seen in CI and not tied to the change being tested. Cause not found yet; candidates are the inline add finishing after Save, or a page reload of the session overwriting the seats. Update 2026-11-03: one cause of lineup.spec failures on a local edge database kept between runs: the test searched the picker with `desktopchrom`, which matches every earlier run's Anna, and the picker shows 8 matches, so the new one was missing. The test now searches by its whole tag. The original symptom (a picked rower missing after Save) is not explained by this.
**Fix**: —

### [BUG-015] With classic (always visible) scrollbars the video tools row wraps at 1000 px — low
**Location**: apps/web/src/client/styles.css (`.player__toolbar`)
**Status**: open
**Found**: 2026-11-03, layout check on claude/feat/angle-measures
**Description**: The tools row above the picture needs 621 px. At a 1000 px window with overlay scrollbars (the macOS default) the player column is 628 px wide and it fits; with a 15 px scrollbar it is 613 px, the row wraps and the player column at 1000×540 is 546 px instead of 512, so its bottom row needs a little scroll. The video keeps its size.
**Fix**: —

### [BUG-014] Merging roster entries can fail when one sat in a session the merger can't see — medium
**Location**: apps/web/src/server/api/lineups.ts (`mergeLineupSeats`), apps/web/src/server/api/moments.ts (`mergeMomentRowers`)
**Status**: open
**Found**: 2026-11-03, while adding angle measurements to the merge
**Description**: Since #108 coaches see only their own sessions. A merge runs with the merging member's role policies, so lineup seats or note assignments in sessions they can't see are skipped, and deleting the merged rower then hits the restricting foreign key (an error instead of a merge). Angle measurements avoid this through a definer function limited to the club (ADR-0017).
**Fix**: — (same approach as `rowlens_merge_angle_measures`, or let only the admin merge).

### [BUG-013] Sessions-list E2E hung on the hidden filter toggle — medium
**Location**: apps/web/e2e/sessions.spec.ts:33
**Status**: fixed (claude/fix/sessions-e2e-race)
**Found**: 2026-11-03, local E2E twice, then CI on `main` after #128 (desktop Chromium, retry too); this blocked the images for `sha-2a9dfb8`
**Description**: The test asked right after loading whether the search field was visible and, if not, clicked the "Filters" toggle. On a laptop the filters open just after the first render, and since #123 the toggle is hidden there, so an early check led to a click that waited for a hidden element until the 30 s timeout (the CI trace ends on that click).
**Fix**: Wait for the filter block first, then click the toggle only when it is visible (a phone). The app's behaviour was right; the test raced it.

### [BUG-012] Player "quick presses" E2E flaked once on iPhone WebKit — low
**Location**: apps/web/e2e/player.spec.ts:42
**Status**: open
**Found**: 2026-11-02, local E2E on iPhone 13 WebKit (scratch config; not in CI)
**Description**: The frame counter didn't reach the expected frame after rapid key presses in one of four runs; three reruns passed. Chromium (CI) has never shown it. Likely timing in WebKit's seek events under load. 2026-11-03 (claude/feat/video-page-layout): again once in a full WebKit run; the player spec alone passed 3 × 7. Seen only in full runs, so load after other specs is the likely trigger.
**Fix**: —. Reproduced 2026-11-05 in the strokes WebKit setup (10 quick steps landed on frame 8); that setup now waits for each step so deletion can be tested independently. The dedicated player quick-press regression is unchanged; the app issue remains open.

### [BUG-011] A long word in a session title widened the page on a phone — low
**Location**: apps/web/src/client/styles.css (`.page h1`, `.lineup__boat select`)
**Status**: fixed (#116)
**Found**: 2026-11-02, CI E2E on PR #116 (mobile Chromium)
**Description**: The session heading didn't wrap long words, and the lineup's "copy from an earlier session" select grew to its longest option. With the E2E's long titles a 375 px phone page became 490–526 px wide, so a click on "Upload" landed beside the button and the upload test timed out.
**Fix**: `overflow-wrap: anywhere` on page headings; the lineup selects are capped to their grid track. The lineup E2E now asserts no horizontal overflow on a phone.

### [BUG-010] Login e-mails never left the server: outbound port 465 is blocked — high
**Location**: apps/web/src/server/auth/mail.ts (`smtpDelivery`), `/opt/rowlens/.env` (`SMTP_PORT`)
**Status**: fixed (#114, deployed `sha-6fbd5a6` with `SMTP_PORT=587`; first real login verified 2026-11-02)
**Found**: 2026-11-02, first real login on production after deploying `sha-5ee4d69`
**Description**: The runbook prescribed Resend's port 465, but trustable-prod (Hetzner) blocks outbound 465; 587 is open and is what AudioScribe uses. The code was stored and the request answered 202, but the mail connection hung for nodemailer's default 2-minute timeout, so no mail arrived and the log said nothing for minutes. Plain 587 alone would also have let a stripped STARTTLS send the API key unencrypted.
**Fix**: Port 587 with `requireTLS` (STARTTLS is mandatory on every port except 465), 10 s connection/greeting timeouts so failures show in the log quickly; unit tests for both. Server: `SMTP_PORT=587`.

### [BUG-009] A first deploy could silently skip the migrations — high
**Location**: infra/deploy/rowlens-deploy (`migrate`)
**Status**: fixed (needs the deploy script reinstalled with `install.sh` at the next deploy)
**Found**: 2026-11-01, CI rehearsal on PR #97
**Description**: `migrate` asked `docker compose config` whether a migrate service exists, without ROWLENS_TAG and with errors suppressed. On a first deploy there is no release.env to supply the tag; newer Compose enforces `${ROWLENS_TAG:?}` during `config`, so the check failed, read as "no migrate service", the migrations were skipped and the app couldn't log in to the database. Production (release.env present) was not affected.
**Fix**: pass the tag; a failing `config` stops the deploy (exit 2) before anything restarts. Stub tests: config sees the tag; config failure stops the deploy (both fail on the old script).
### [BUG-007] Phone clip processed at 31.58 fps instead of 30, ~5 % duplicate frames — high
**Location**: worker/src/rowlens_worker/video/probe.py (`_nominal`)
**Status**: fixed (videos processed before stay as they are; re-upload to fix)
**Found**: 2026-11-01, Ewout's screenshot showed "31.58 fps"
**Description**: The clip's frames sit on a 600 Hz timestamp grid, 19 ticks apart with gaps (r_frame_rate 600/19 = 31.58, average 29.99). The worker took r_frame_rate because it was within 20 % of the average, and made a constant 31.58 fps rendition: 2740 frames from 2603, so ~5 % duplicates — misleading when stepping frame by frame.
**Fix**: prefer the average if it is a common rate (within 1 %), then r_frame_rate if common, then the old rule. Test with the clip's real numbers.

### [BUG-008] Portrait video on a laptop: a narrow strip, controls stretched below — medium
**Location**: apps/web/src/client/styles.css (video page layout)
**Status**: fixed
**Found**: 2026-11-01, Ewout's laptop screenshot ("this does not look good on the laptop")
**Description**: The laptop layout put controls under the video, sized for landscape. A portrait video got the height left over (small in a low window) and lots of empty space beside it.
**Fix**: from 1000 px, portrait video stands left at full available height, its controls in a column beside it, notes on the right. Two attempts made the video 0×0 (an auto margin, then a percentage width inside an auto-sized column); both caught by measuring the stage size in the layout script.

### [BUG-005] iPhone shows only the top of a portrait video — high
**Location**: apps/web/src/client/styles.css (`.player__stage`, `.player__video`)
**Status**: fixed (in production until the next deploy)
**Found**: 2026-11-01, by Ewout on his iPhone ("alleen de bovenste helft")
**Description**: The stage was a 16:9 box (aspect-ratio) with the video at `height: 100%`. Safari ignores that percentage inside an aspect-ratio box, so a portrait video (540×960) became 358×636 px inside a 358×201 stage and was cut off. Chrome sized it correctly, so the Chromium tests passed.
**Fix**: video absolutely positioned in the stage; the stage takes the video's own shape (`--aspect`), at most 60 % of the screen height on phones; checked in WebKit at iPhone size (landscape, portrait, full screen).

### [BUG-006] Flaky test: broken upload connection — low
**Location**: apps/web/src/server/media/store.test.ts:32
**Status**: fixed
**Found**: 2026-11-01
**Description**: The test broke the stream after a fixed 20 ms, sometimes before the first chunk reached the disk.
**Fix**: break it once the bytes are on disk; 15/15 passes.

### [BUG-004] Quick frame steps get lost (player) — high
**Location**: apps/web/src/client/player/usePlayer.ts:102
**Status**: fixed (in production until the next deploy)
**Found**: 2026-11-01, by the notes E2E (10 quick `.` presses ended at frame 4, 7 or 9)
**Description**: `onSeeked` cleared the pending step target unconditionally. A `seeked` of a seek that a newer step had already replaced, or a step right after a seek but before requestVideoFrameCallback reported the new frame, made the next step count from an older frame. Every lost step is a wrong frame for a rower or coach pressing or holding the step buttons.
**Fix**: ignore `seeked` while a newer seek is in flight (`video.seeking`); on a finished seek, count on from the seek's target. Regression test: 20 quick presses must land on frame 20 (fails 12/12 with the old code, passes 12/12 now).

### [BUG-003] Renditions 3× larger than low-bitrate phone uploads — medium
**Location**: worker/src/rowlens_worker/video/transcode.py:34
**Status**: fixed
**Found**: 2026-11-01 (first real clip on production)
**Description**: A 576p, 0.76 Mbit/s, 8 MB upload got 27 MB of renditions: play-1080 was produced for any source above 540p (a near-copy at 576p), and CRF had no bitrate ceiling. That eats the 30 GB cap three times faster than needed.
**Fix**: play-1080 only from 720p; capped CRF relative to the source bitrate (PR, see DOCUMENTATION 2026-11-01).

### [BUG-002] Edge E2E upload refused with 507 on CI runners — low
**Location**: infra/compose/docker-compose.edge.yml:34
**Status**: fixed
**Found**: 2026-11-01
**Description**: GitHub runners' disks are above 85 % in use once Docker images and Chrome are installed, so the 85 % disk pause (ADR-0006) refused every test upload (507 `disk_full`). Earlier PRs never ran the upload in the edge job (no test clip there before #90).
**Fix**: test stacks (edge compose, e2e/server.ts) set `DISK_PAUSE_RATIO=0.99`; production keeps 0.85 (PR #90).

### [BUG-001] E2E server fails to start once DATABASE_URL is required in production — medium
**Location**: apps/web/playwright.config.ts:30
**Status**: fixed
**Found**: 2026-11-01
**Description**: #86 made `DATABASE_URL` required with `NODE_ENV=production`; Playwright's web server ran `dist/server/main.js` in production mode without a database, so CI's E2E step couldn't start (local checks had covered the edge stack, not this suite).
**Fix**: `e2e/server.ts` starts a throwaway Postgres via Testcontainers, migrates it, then runs the server (PR #86).
