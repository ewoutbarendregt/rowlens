# FEATURES

Status: `planned` · `in progress` · `done`. Priority per MoSCoW. Issues live on GitHub; this is the overview.
Statuses reviewed 2026-11-02 ("done" = merged to `main`; not necessarily deployed).

## Focus now: coach & rower workflow (epic #102)

Set by Ewout on 2026-11-02: the next work makes RowLens useful for coaches and rowers, before
growth features. Suggested order:

| Feature | Who | Priority | Status | Issue |
|---|---|---|---|---|
| Club roster: add rowers without an account, pick known rowers | coach | must | planned | #104 |
| Session lineup: who sat in which seat (coastal boats first) | coach | must | planned | #103 |
| Assign a note to one or more rowers | coach | must | planned | #105 |
| Show notes in the video, on/off toggle | coach, rower | must | planned | #106 |
| Note visibility: share with a teammate or the whole crew | rower | must | planned, settle with #40 | #112 |
| First login: claim notes made under my name | rower | must | decision needed (name matching) | #110 |
| My sessions: every session I rowed in | rower | must | planned | #108 |
| My notes: feedback for me from every coach, with the video moment | rower | must | planned | #109 |
| Reassign a note to someone else | rower | should | decision needed (free or coach-approved) | #111 |
| Dictate a note and transcribe it | coach | should | decision needed (where transcription runs, ADR-0010) | #107 |
| Mark strokes: stroke rate, drive:recovery | coach | must | planned | #85 |

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
| i18n framework NL/EN | must | planned (#34) |
| Observability: structured logs, error tracking, metrics | must | planned (#35) |
| DB backups off-server + restore test | must | planned (#37); pre-deploy backups exist |

## M1 MVP

| Feature | Priority | Status |
|---|---|---|
| Clubs, memberships, crews, roles rower/coach | must | in progress: club + membership exist; crews (#41) and roster (#104) to do |
| Invitations by e-mail | must | planned (#42) |
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
