# ADR-0028: Participant training visibility, primary club and authenticated examples

- **Status**: accepted (Ewout: "ja", 2026-11-15)
- **Date**: 2026-11-15
- **Related**: ADR-0005, ADR-0013, ADR-0019–0022, ADR-0025–0027

## Context

Ewout requires rowers to see only trainings they created or participate in, a primary membership
as the initial club filter, and administrator-created examples visible to everyone signed in.
The approved proposal is `docs/plans/training-visibility-help.md`. ADR-0020 deliberately allowed
club-wide rower reads; simply changing the browser filter cannot protect detail, media or feedback.

## Decision

Migration 0029 restricts ordinary rower-only reads to creator or linked lineup participation
(including cox seat 0 and canonical account references). Staff roles remain additive and club scoped.
Shared feedback alone never opens an unrelated training. Restrictive child policies and feedback
helpers require accessible parents. Existing owner/staff editing rules remain unchanged. Older
images without the read/write split capability retain their narrower staff read/write scope;
unknown capability values fail closed. Media responses use private/no-store so subsequent requests
revalidate authority after lineup/membership changes. Previously delivered video cannot be recalled.

A nullable central `app_user.primary_club_id` is saved through revision-checked settings functions.
Only an active membership of the settings subject is valid, also for administrator saves. An invalid
or removed preference grants nothing: the overview falls back to the first active membership by
name/ID without rewriting the preference. Explicit URL filters (including all clubs) override the
initial default. Reset restores that default. Filtering does not switch the active tenant/drafts.

A protected trigger classifies trainings created by persisted platform administrators as examples;
clients cannot set the classification, and subsequent updates preserve it. The migration backfills
only recorded creators with a current platform grant, never names, club-admin roles or ownerless
rows. Withdrawing a grant or reassigning a creator does not change the published example status.
Archived clubs remain inaccessible, including examples, per ADR-0022.

A narrow authenticated discovery function exposes only example/owning-club IDs. Each content read
uses its own `TenantContext`, with an explicit example session ID. SQL rechecks the viewer's verified
account, exact session, persisted classification and active owning club. In this scope role
capabilities are empty and every tenant table gets restrictive example read/write boundaries.
Allowed rows are only the chosen session, its video entries, lineup rowers, stroke marks, angle
measurements and boat lines; all mutations and private feedback/reference/administration rows are
denied. The API projection returns no emails, authors, original filenames, private notes or storage
keys. It shares only example training/crew display data, video and analysis. This is a narrow
cross-club read exception to ADR-0021, not a membership or platform grant. There is no anonymous
access or membership approval requirement for the example viewer.

Dedicated example routes/player avoid invoking arbitrary club APIs with a foreign example context.
Media authorizes the logical video entry and validates rendition keys against its physical asset,
including shared recordings (ADR-0026). Originals retain ordinary club-scoped administration.
The Examples section stays independent of ordinary filters and ordinary cards omit duplicates.
Clubless accounts can use Help/examples without creating a fake membership. Profile completion
remains required for ordinary training workflows.

A permanent NL/EN Help link in the header and contextual example link explain current usage,
visibility, role restrictions, primary club and feedback privacy. No external processor, dependency,
production change or automatic deployment is introduced.

## Consequences

This supersedes ADR-0020's broad rower reading, preserving its write restrictions and private feedback.
Examples are intentionally readable across clubs by authenticated accounts; administrators must use
example-appropriate footage and crew information. Private feedback stays outside the example viewer.
The nullable column and extra classification are additive for old images. The restrictive rower
boundary applies immediately after migration, including to old images; it is never relaxed for
rollback. Feature-off legacy builds keep their existing UI without the unified example routes.

## Amendment — examples in the normal list and pages (2026-11-17)

Ewout corrected the UI: examples belong in the ordinary training list with ordinary functionality.
The overview now merges the discovery list into the ordinary list (badge, any club filter, other
filters apply, de-duplicated with club-readable trainings). Instead of a dedicated player, the normal
training and video pages render a foreign example read-only at `/examples/:id[/videos/:videoId]`,
fed only by the example API; they never call club APIs with a foreign example context, so the
reasoning above still holds. The list projection adds boat type, crew display data and a video count
(already part of the example detail); it still has no authors, e-mails or timestamps. No database,
RLS or permission change. Plan: docs/plans/examples-in-training-list.md.
