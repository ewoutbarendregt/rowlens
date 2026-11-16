# Example training notes and drawing overlays

Status: approved by Ewout with “Ja” (2026-11-16); implemented and verified locally; PR preparation.
Branch: `codex/fix/example-feedback`. Related: ADR-0028, ADR-0029; BUG-068.

## Confirmed cause

Ewout found the example trainings through Help and accepts that location. ExamplePage does not
render a DrawingLayer, VideoNotesOverlay or read-only notes list. readExample deliberately omits
annotation rows; migration 0029's restrictive example policy denies every annotation in example
scope. Therefore this cannot be fixed by merely adding a component to the page.

Read-only production aggregates confirm that example videos contain 162 line annotations, four
angle drawings and one arrow; all 167 are authored by their recorded example-training creator,
who currently has platform authority. Seven manual boat lines are present. No annotation text,
names, emails or media were read for this diagnosis. The example API already supplies manual and
automatic boat-line data and measurements, but its player has no overlay.

## Proposed behavior

- Keep examples available through Help and the existing Examples section.
- Publish the original example maker's own text notes and drawings as read-only example material,
  including existing material. All authenticated example viewers can see those items, across clubs.
- Other users' feedback, assignments, recipient lists and private notes remain excluded, including
  other authors' notes at the exact same frame. Source-reference feedback is not republished.
- Show drawings on their saved frames, accompanying text notes in/on the player and a read-only
  frame list with jump controls. Render the already approved manual/automatic boat-line analysis
  with the same frame/coordinate rules as the normal player. No create/edit/delete/share controls.
- Explain in NL/EN on the example-management surface that the example maker's own notes/drawings
  are visible to every signed-in example viewer. This is a publication rule for examples only.

## Approved permission design

Record an immutable example-publisher account ID when classifying an example. This prevents later
creator reassignment from silently publishing a different person's private annotations. Add an
additive migration and corresponding ADR: existing examples get the recorded creator only where
that creator still has persisted platform authority; uncertain/ownerless rows fail closed.
New example creation stamps the verified actor. Clients cannot assign/change this publisher;
ordinary training behavior and immutable example classification are preserved.

Allow the narrow example scope to read an annotation only when the exact video belongs to the
chosen active example and its author equals the immutable publisher. Use tenant-scoped repositories
and restrictive RLS; do not globally widen rowlens_can_see_moment or expose moment/recipient data.
Return only drawing/text/frame identifiers and read-only capabilities, without author identities,
emails, timestamps or private recipient metadata. Do not return sibling authors through a shared
frame. Withdrawn/archived examples and unrelated video IDs remain inaccessible.

## Verification

Tests first: publisher note/line/arrow/angle inclusion, other-author/private/source exclusion,
creator-transfer stability, missing/legacy-author denial, cross-club/clubless authenticated reads,
archived/unauthenticated denial and every mutation denied. Existing example/media/feedback and
sharing regressions must remain green. Test overlay alignment/frame navigation and read-only
controls on iPhone13 WebKit and Chromium1000×540/1440×900, including zoom and fullscreen.
Run required format/lint/typecheck/web/database checks and local browser verification.
No production data/configuration change or deployment is authorized by this proposal.
