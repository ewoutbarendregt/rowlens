# Own trainings, reused videos and independent annotations

Status: approved by Ewout ("Ja", 2026-11-09). Implementation and local validation authorized;
production merge/deployment remain separate. Implementation decision: ADR-0026.

## Requested behavior

1. Add an independent **Created by me** filter beside participation and notes-for-me filters.
   Compare the authenticated account ID with the persisted training creator, never names or
   edit capability. Staff editing another person's training does not make it their own. Legacy
   ownerless trainings do not match. Preserve the filter in the URL and apply it across authorized
   clubs and all overview pages.
2. In a self-created training, offer **Add existing video**. Search ready, currently readable
   recordings in the same club, showing their source training and recording details. Reuse the
   existing media without upload, transcoding or duplicate storage. Keep cross-club reuse outside
   this proposal, even when the account belongs to both clubs.
3. Each training gets its own video entry with independent notes, drawings and analysis state.
   Editing, assigning, sharing or deleting feedback in the new entry never changes the source.
   Reusing a recording does not copy the source training's crew into the new training or establish
   participation. Preserve source crew context separately for interpreting source feedback.
4. Show whether other training entries for this recording contain annotations the viewer may read,
   including counts, creator attribution and source training. Do not reveal the existence/counts
   of private feedback through this indicator. Find sibling entries through media identity, not
   filenames; recursively reused entries still refer to the same recording.
5. Offer source annotations as read-only layers with a switch per creator/source training and
   individual selection. **Add to this training** saves references to the selected source
   annotations. Local annotations remain separately editable. Remember the selected references
   for the training; visibility switches are per viewer and training/video entry so one viewer
   cannot hide another viewer's work. The global notes toggle still hides all annotation layers.
6. References retain the source author's attribution and show the current permitted source content.
   Changes to a source annotation appear in its referenced layer; deleting it removes that item.
   Switching or unlinking a layer never deletes the original. This proposal uses references,
   not independent editable copies of another person's annotations. That distinction must be
   explicit in the localized UI and owner approval.

## Existing implementation and reason for architectural approval

`video.session_id` ties a recording and all its feedback to one training. Annotations, moments,
stroke marks, angle measurements and manual/automatic boat lines use `video_id`. Drawing and note
groups currently merge by video/frame; source and local content at the same frame must not merge
into one editable moment. Deletion handlers in `api/sessions.ts` and `api/uploads.ts` remove the
video directory, and media reads in `api/videos.ts` require a prefix derived from the video ID.
Merely assigning a second training or copying a media key would break isolation or deletion.

`repositories/session-list.ts` already reads the creator ID but discards it after deriving the
display name. Return a server-derived `createdByMe` boolean in both legacy and unified lists.
Keep existing participation (`mySeat`, including cox 0), notes-for-me and club filters independent.

## Proposed data and permission changes

- Separate physical recording storage/processing from training entries: introduce tenant-owned
  `video_asset`; retain `video` as the per-training entry so existing video URLs and feedback
  relationships keep their IDs. New entries reference the same asset. Extract physical metadata,
  original/rendition keys and byte accounting into the asset; entry ordering, perspective and
  feedback remain local. Backfill asset IDs from existing video IDs to preserve on-disk paths.
- Introduce tenant-owned source-annotation references (target entry, source annotation, added-by
  account and timestamp), with same-club foreign keys, deduplication and immutable source identity.
  Derive available layers through currently authorized sibling entries, rather than copying private
  annotation bodies into an unrestricted target. Only direct source annotations can be linked:
  never recurse through references or create cycles.
- Every new tenant table gets `club_id`, RLS and restrictive role policies. Use repositories with
  `TenantContext`/`withTenant`. A link requires current source-read and target-edit authority over
  entries of the same asset and club. Target ownership does not confer source-edit authority.
  Preview, link creation and every subsequent read recheck source annotation visibility. A saved
  reference grants no new audience: viewers need both target-entry and original-feedback access.
  Source sharing revocation, role revocation and archived-club restrictions apply immediately.
  Counters, timeline markers and layer metadata follow the same permission checks as content.
- Maintain ADR-0020 permissions: ordinary rowers annotate their own entries; coach-only stroke/angle
  tools stay coach-only. Staff still have their existing club editing powers; an independent
  workspace does not create a new privacy promise against authorized coaches/administrators.
  A stored reference is read-only even for staff in the target view; editing the source requires
  deliberately opening its training with current source write permission.
- Keep local moment assignments, sharing, authorship and frame deletion independent of references.
  Identify rendered/groups/selection by entry, origin and annotation ID as well as frame, so a
  same-frame reference cannot become editable, change local note recipients or be bulk-deleted
  with the local moment. No source shares or assignment logs are copied into the target.
- Local strokes, angles, manual boat lines and bow direction remain per entry. Source drawings
  may be displayed, but never silently feed target timing/angle calculations. Automatic boat-line
  results depend on manual corrections (ADR-0018), so do not share their mutable result/job state
  across entries. Adapt worker inputs to read common media while writing entry-scoped results;
  sharing raw detector output would require a separate, explicit design.
- Removing one entry/training deletes only its feedback and references. Preserve the asset while
  another entry uses it, including when the original training is deleted. Source feedback deleted
  with its training disappears from references; the reused video and local feedback survive.
  Charge bytes once per asset. Serialize attach/delete/last-reference cleanup around the asset,
  recheck permissions after locks, and prevent a concurrent reuse from pointing at removed files.
  Pending jobs must not recreate a deleted entry or delete media still used by another entry.

## Implementation sequence after approval

1. Add creator-filter API/UI and meaningful identity/URL/filter regressions.
2. Record the approved decision in an ADR. Review an additive migration/backfill for media assets,
   entry relationships and source references, including tenant/role policies and asset cleanup.
   Allocate migration numbers against the then-current journal; existing club-address migration
   work is unrelated. Prove compatibility with the prior image during migration-before-web rollout
   and rollback; do not drop old columns or enable shared assets while old destructive handlers
   could still run. Use a separate explicit cutover if compatibility cannot be guaranteed.
3. Adapt media/upload/quota/deletion repositories and worker processing, then implement same-club
   reuse and permission-filtered source discovery/reference APIs. Recheck current source and target
   permissions inside the mutation transaction, including concurrent creator/role changes.
4. Add NL/EN picker, annotation availability, individual selection, creator/source switches,
   provenance and read-only overlays. Extend the existing inline confirmations and 44px touch
   controls. Gate unfinished reuse behind a build-time feature flag; retain all existing paths.
5. Run required local checks and open a PR with a Security review note. Keep production changes
   outside implementation approval; merging and deployment require a separate explicit request.

## Acceptance and verification

- Creator filter distinguishes creator/participant/note recipient/staff editor and legacy null
  creator; combines with existing filters, URL reload, multi-club paging and account switches.
- Two people reuse one ready recording in separate trainings without copying bytes; local notes,
  drawings, sharing, assignments, strokes, angles and manual/automatic boat-line edits leave the
  source unchanged. Existing uploaded-video workflows and old URLs remain usable.
- Authorized source annotations are discoverable/selectable, attributed and persisted as references;
  layer toggles affect only that viewer/entry. Same-frame annotations stay distinct, including
  selection, text editing, drag handles, timeline markers and delete-whole-frame actions.
- API and direct-RLS tests cover all role combinations, rowers, unrelated staff, two clubs,
  forged source/target/asset/annotation IDs, hidden feedback/counts, revoked sharing/membership,
  archived clubs, unauthorized requests and concurrent creator transfer/reuse/deletion.
- Deleting the original or reused entry preserves other entries' playback and local feedback;
  last-reference cleanup, quota, upload cancellation, queued/running jobs and failed attaches leave
  no broken media references. Migration/backfill and previous-image compatibility are rehearsed.
- Run format/lint/typecheck/web+DB/worker checks and applicable media/edge/deploy checks. Browser
  coverage includes 1000x540 Chromium and iPhone 13 WebKit, screenshot inspection, overflow/touch
  measurements, fullscreen, layer visibility reload and switching accounts/training contexts.

Implementation and local validation are complete; review/merge and production deployment remain
separate. See TEST.md, ADR-0026 and docs/HANDOFF.md for evidence and operational details.
