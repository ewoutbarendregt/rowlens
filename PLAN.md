# PLAN

## Explicit registration and optional club request — approved/implemented 2026-11-07

Ewout approved `docs/plans/registration-onboarding.md` with "Ja, voer het volledige plan uit".
ADR-0024/migration 0025 adds distinct registration, email-proof-bound optional club intent,
atomic registration/application and global versus club-scoped request review. Clubless accounts
need no platform admission; club access waits for the existing audited club approval. Local stack
has 26 migrations; 608 web/DB plus final focused 42/42 and 28 laptop/iPhone WebKit checks pass. Production stays sha-dd71f78
with 25 migrations; no new merge/deploy is authorized. Deployment-log PR #158 is the stack base.

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
