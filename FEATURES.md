# FEATURES

Status: `planned` · `in progress` · `done`. Priority per MoSCoW. Issues live on GitHub; this is the overview.

## M0 Foundation

| Feature | Priority | Status |
|---|---|---|
| Monorepo, CI (lint/type/test/build/scan), templates, ADRs | must | in progress (Phase 0) |
| Base-path-aware web skeleton + health endpoints | must | done (#19), live at trustable.nl/projects/rowlens |
| Manual CD to trustable-prod with rollback (no staging: local + prod only) | must | done (#25) |
| Object storage decision + disk monitoring | must | planned |
| E-mail OTP login, sessions, CSRF, rate limits | must | planned |
| i18n framework NL/EN | must | planned |
| Observability: structured logs, error tracking, metrics | must | planned |
| DB backups off-server + restore test | must | planned |

## M1 MVP

| Feature | Priority | Status |
|---|---|---|
| Clubs, memberships, crews, roles rower/coach | must | planned |
| Invitations by e-mail | must | planned |
| Tenant isolation (RLS) + cross-club tests | must | planned |
| Sessions with optional metadata | must | planned |
| Resumable phone upload (tus) | must | planned |
| Transcoding (CFR, short GOP, renditions, poster) | must | planned |
| Player: 0.25/0.5/1×, ±1 frame, ±0.1 s, loop, fullscreen iOS/Android, keyboard | must | planned |
| Conversation per session with timestamp links | must | planned |
| Annotations: text, line, arrow, angle; open/resolved/focus | must | planned |
| E-mail notifications with opt-out | must | planned |
| Delete own videos (hard delete) | must | planned |
| Privacy statement, data export, account deletion, audit log | must | planned |

## M2 Analysis (outline)

Pose estimation · stroke phases · stroke rate / ratio / rhythm · crew sync · traceability UI ·
reference model comparison · rower-facing explanations + drills · eval suite in CI — all `should`.

## M3 Growth (outline)

Club self-onboarding · side-by-side comparison · trends · goals · more languages · PWA push — `could`.
