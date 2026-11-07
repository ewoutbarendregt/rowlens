# ADR-0020: Club-wide training reading with ownership and staff editing

- **Status**: accepted
- **Date**: 2026-11-06
- **Deciders**: Ewout (product owner); implementation by Codex

## Context

Ewout requires rowers to see other members' trainings fully read-only, while coaches/admins may
edit all club trainings. He approved the revised plan and one permission migration with "voer het
plan uit". Old session/video/lineup FOR ALL policies reuse visibility for writes; simply widening
visibility would grant unauthorized mutations and could let deletion/upload handlers change files.

## Decision

Migration 0019 replaces shared resource policies with separate restrictive read/add/edit/delete
policies. Every member reads every current-club training, including ownerless legacy sessions.
Rower-only users edit self-created trainings with existing rower permissions; participation does
not establish ownership. Coaches/admins edit every club training, without a creator/crew condition.
Roles are additive. Creator reassignment and account administration remain admin-only.

Use tenant-checked, pinned SQL helpers `rowlens_can_read_trainings` and
`rowlens_can_edit_session/video/moment`. Keep `rowlens_sees_all` admin/service-only; it also protects
privileged operations. Authenticated missing roles fail closed; explicit worker/service contexts
retain processing access. No new table or dependency; tenant RLS and same-club parent keys remain.

Private feedback stays private to rowers unless authored/assigned/shared to them. Coaches/admins
see all feedback within their club. Mutating feedback also requires an editable training, including
previously authored notes/drawings and assignment/sharing changes. Authorship never bypasses a
foreign training's read-only state. Coach-only analysis remains coach-only in rower-owned trainings.

The deploy script migrates before replacing web; old media handlers assume visibility implies
writability. Each new `withTenant` transaction therefore sets a fixed server capability
`app.training_permissions=owner-or-staff`; it is never request input. Only that mode activates new
club-wide reads and owner/staff writes. Missing context retains the old image's aligned legacy
read/write scope during upgrade and authorized rollback; unrecognized values fail closed for
training access. Existing worker/service processing works in either mode. The session SELECT
policy uses row columns directly, preserving INSERT RETURNING visibility for newly created rows.
No second migration, configuration flag or coordinated server stop is needed. Older scalar-role
images remain unsupported by the role-array schema (ADR-0019).

API metadata returns current resource capabilities. Read-only pages show playback, stepping, speed,
zoom, crew and permitted feedback; they omit forms, drawing tools, upload/deletion and sharing edits.
Own settings and the ADR-0019 standalone roster/account boundaries remain unchanged.

Before media effects, lock the editable parent session and recheck permission in a fresh statement
after acquiring the lock. A FOR UPDATE predicate can use a pre-transfer snapshot while waiting;
the subsequent check prevents stale ownership from authorizing file writes. Hold the lock through
streaming/progress/job writes. Slow chunks disable the normal 15-second transaction idle limit
locally, with a five-minute stream deadline to release stalled uploads. Deletion removes media only
after an actual database deletion.

## Consequences

- Supersedes ADR-0013's own/reachable-only training scope and its unrestricted rower mutations;
  ADR-0019's central account, private feedback, roster and tenant rules remain in force.
- One migration must accompany web code; broad reads must not deploy without write restrictions.
- Tests cover all seven role combinations, two clubs, unrelated staff, own/legacy trainings,
  private/old authored feedback, real media side effects and a concurrent ownership transfer.
- Media mutations serialize per training while uploading a chunk, keeping creator changes ordered.
- No production change is authorized by implementation approval; merge/deploy require new requests.

## Alternatives considered

- Widen only SELECT visibility helpers: unsafe because existing FOR ALL policies reuse them.
- Hide UI controls only: direct API/SQL requests and media effects would remain unsafe.
- Retain author-based writes in foreign trainings: contradicts fully read-only feedback.
- Keep coaches limited to reachable trainings: contradicts the revised product requirement.


## Addendum 2026-11-07: unified accounts and platform administration

ADR-0021 supersedes one-club signup/identity constraints in the feature-enabled flow: accounts may
apply to several clubs, with admission controlled by club administrators. Rower/coach/club-admin
permissions remain club scoped; a separately persisted RowLens-admin grant has full selected-club
content access, including private feedback. New auth does not silently elevate existing server
admins. Historical roster IDs are compatibility references during explicit account mapping; the
standalone Rowers register/UI is retired in this flow. The paired feature flags are off by default
in production builds; this addendum does not authorize deployment.
