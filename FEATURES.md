# FEATURES

Status: `planned` · `in progress` · `done`. Priority per MoSCoW. Issues live on GitHub; this is the overview.
Statuses reviewed 2026-11-02 ("done" = merged to `main`; not necessarily deployed).

## Focus now: coach & rower workflow (epic #102)

Set by Ewout on 2026-11-02: the next work makes RowLens useful for coaches and rowers, before
growth features. Suggested order:

| Feature | Who | Priority | Status | Issue |
|---|---|---|---|---|
| Club roster: add rowers without an account, pick known rowers | coach | must | done locally, PR open | #104 |
| Session lineup: who sat in which seat (coastal boats first) | coach | must | done locally, PR open | #103 |
| Assign a note to one or more rowers | coach | must | done locally, PR open | #105 |
| Show notes in the video, on/off toggle | coach, rower | must | done locally, PR open | #106 |
| Note visibility: share with a teammate or the whole crew | rower | must | done locally with #40 (role visibility), PR open | #112 |
| First login: claim notes made under my name | rower | must | decision needed (name matching) | #110 |
| Sessions list as start page: filter and sort; admin sees all, others their own | everyone | must | done locally, PR open | #108 |
| Look of the mockups (Classical): login, header, sessions table per month | everyone | must | done locally, PR open | ADR-0014 |
| Video page from the mockups; author = your account | coach, rower | must | author + notes in video (#125) and layout 1e (#128) deployed; "For" chips per seat done locally, PR open | ADR-0014 |
| Technique analysis: what coaches look at first (blade, angles per phase, crew uniformity, wrist; the head coach's full list: upper body, hand and blade height, slip, rolls, boat speed) | coach | must | backlog, after stroke marks (#85); boat speed needs a decision (video vs. imported sensor data) | #127 |
| My notes: feedback for me from every coach, with the video moment | rower | must | planned | #109 |
| Reassign a note to someone else | rower | should | decision needed (free or coach-approved) | #111 |
| Dictate a note and transcribe it | coach | should | decision needed (where transcription runs, ADR-0010) | #107 |
| Mark strokes: catch, half slide, finish; rate, drive, recovery, ratio per stroke | coach | must | deployed (ADR-0016) | #85 |
| Jump to the previous / next stroke moment from the player controls; off with a hint without marks | coach, rower | must | done locally, PR open | #85 |
| Angles per rower and phase: knee, hip, elbow, upper body vs boat (boat line per moment); finger-friendly drawing | coach | must | deployed (ADR-0017) | #127 |
| Boat line found in every frame (waterline bow to stern, follows it out of the picture); coach's line wins and steers the search; bow side once per video | coach | must | done locally, PR open (ADR-0018) | #127 |
| Names in the account menu; default boat; rename a session; who made it and when; videos first on the session page | everyone | must | done locally, PR open | — |
| Zoom into part of the picture (pinch, ⌘/Ctrl + scroll, + − 0, corner buttons; drag to pan); controls stay usable, drawings zoom along | coach, rower | must | done locally, PR open | — |
| Move a saved drawing, measurement or boat line on the picture by dragging its points; choose a measurement's rower and joint in the picture; drawings only on their own frame | coach | must | deployed (#142, ADR-0017 addendum); control placement fix pending review | #141 |
| Editing controls below the picture: unobstructed lines/angles/boat lines, 44 px controls, fullscreen; focused laptop + iPhone WebKit regression suite | coach | must | fixed locally, pending review (BUG-021) | #141 |
| Playback after touch drawing: speed and pause activate on pointer release, with keyboard support and explicit release of drawing captures | coach, rower | must | candidate fix locally; physical iPhone confirmation pending (BUG-022) | — |
| Choose a moment to delete via a trash icon on each stroke row, with inline confirmation; retain loose-mark removal | coach | must | updated locally, pending review; replaces the separate mark editor | #85 |
| Direct drawing points: visible first dot, no progress menu between taps; adjust/save controls after completion | coach, rower | must | done locally, pending review (BUG-024) | #141 |

Needed alongside, because rowers must be able to log in and be told about feedback: e-mail login
configured on production (#28–#30), notifications (#62/#63), annotation status (#61), and the privacy
statement covering roster names of people without an account (#64).

## M0 Foundation

| Feature | Priority | Status |
|---|---|---|
| Monorepo, CI (lint/type/test/build/scan), templates, ADRs | must | done |
| Base-path-aware web skeleton + health endpoints | must | done (#19), live at trustable.nl/projects/rowlens |
| Manual CD to trustable-prod with rollback (no staging: local + prod only) | must | done (#25, #98) |
| Media storage (directory store, 30 GB cap, 85 % disk pause) | must | done; disk alerts (#36) planned |
| E-mail OTP login, sessions, CSRF, rate limits | must | done (#101), not yet configured on production (needs Resend) |
| i18n framework NL/EN | must | in progress: Dutch default + language switch done locally, PR open (ADR-0015); catalog format and lint rule planned (#34) |
| Observability: structured logs, error tracking, metrics | must | planned (#35) |
| DB backups off-server + restore test | must | planned (#37); pre-deploy backups exist |

## M1 MVP

| Feature | Priority | Status |
|---|---|---|
| Clubs, memberships, crews, roles rower/coach | must | in progress: club + membership exist; crews (#41) and roster (#104) to do |
| Invitations by e-mail | must | in progress: admins admit people with a role + invitation mail (PR open); token links later (#42) |
| Tenant isolation (RLS) + cross-club tests | must | done for current tables (#39) |
| Sessions with optional metadata | must | in progress: create/list/delete done; lineup (#103) and other metadata to do |
| Resumable phone upload (tus) | must | done; real-device 4K test (#45) to do |
| Transcoding (CFR, short GOP, renditions, poster) | must | done; thumbnail sprite (#52) to do |
| Player: 0.25/0.5/1×, ±1 frame, ±0.1 s, loop, fullscreen iOS/Android, keyboard | must | done; scrub thumbnails (#52), Android check (#51) and accessibility pass (#56) to do |
| Conversation per session with timestamp links | must | planned (#57, #58) |
| Annotations: text, line, arrow, angle; open/resolved/focus | must | text and drawings done (#59, #60); status (#61) planned |
| E-mail notifications with opt-out | must | planned (#62, #63) |
| Delete sessions/videos (hard delete) | must | session delete done; audit log (#43/#50) to do |
| Privacy statement, data export, account deletion, audit log | must | planned (#64–#66, #43) |

## M2 Analysis (outline)

Pose estimation · stroke phases · stroke rate / ratio / rhythm · crew sync · traceability UI ·
reference model comparison · rower-facing explanations + drills · eval suite in CI — all `should`.

## M3 Growth (outline)

Club self-onboarding · side-by-side comparison · trends · goals · more languages · PWA push — `could`.

## Stroke controls update (2026-11-06)

- Inline per-row moment selection replaces the separate removal section; no whole-stroke deletion.
- ↓ Catch / ↑ Finish frame tools above the video, including phone/fullscreen, are implemented locally for review.

## Admin user settings (#151)

Requested 2026-11-06: one central user register/profile/settings set per person; users may hold
multiple roles (rower, coach, admin) simultaneously. Admin can inspect/edit profile, role sets/access
and all five display/video preferences. Inventory and updated proposal complete; new centralized persistence/migration awaiting Ewout's
approval. No functional implementation yet; see docs/plans/151-admin-user-settings.md.

#151 navigation clarification: rower-only users see Trainings and own settings; Rowers is hidden
and unavailable through a direct route/general roster API. Combined rower+coach/admin roles retain
the separately granted elevated rights. Specified in the proposal; not implemented yet.
