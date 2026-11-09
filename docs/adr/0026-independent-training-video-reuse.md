# ADR-0026: Shared recordings, independent training entries and source annotation references

- **Status**: accepted (Ewout: "Ja", 2026-11-09)
- **Date**: 2026-11-09
- **Deciders**: Ewout; implementation by Codex
- **Related**: ADR-0005, ADR-0007, ADR-0013, ADR-0016–0018, ADR-0020, ADR-0025

## Context

Ewout wants a Created by me filter and to reuse others' videos in self-created trainings with
independent annotations/analysis. Authorized existing annotations must be discoverable, selectable
and switchable. The approved proposal is `docs/plans/training-video-reuse.md`; source annotations
are attributed, read-only references to current content, not editable snapshots.

## Decision

`video` remains the training-specific entry and preserves existing IDs, URLs, ordering and feedback
foreign keys. Tenant-owned `video_asset` owns physical identity, metadata and byte accounting.
Migration 0028 backfills asset IDs from the original video IDs, so no files move. Physical fields
remain on `video` as a compatibility projection: a private pinned trigger maintains the canonical
asset metadata for original upload/worker writes and fills it into reused ready entries. Reused
entries cannot change physical identity/metadata. Only ready same-club media may be reused, with
current source visibility and target edit authority; repeated attachment returns the existing entry.
Actual current membership/roles or persisted platform authority are rechecked for the new APIs and
reference policies, rather than relying on a stale role snapshot.

Annotation/moment assignments and shares, strokes, angles, manual boat lines and automatic line
state stay keyed by the new video entry. Reuse creates an independent boat-line job, never a new
transcode. The existing worker already reads stored rendition keys and writes detector results by
entry ID, so no worker code/dependency change is needed. Corrections on one entry never seed another
entry's detector or modify its results. Reuse does not copy crew membership or imply participation.

`video_annotation_reference` stores only the target entry, original annotation, adding account and
time, with tenant/role RLS and same-club keys. Add/read require the same asset, distinct entries,
source visibility and target visibility (plus target edit authority on add). Source feedback rules
are rechecked on each read; reference existence never shares private content with a new audience.
Metadata, counts and markers use the same filtered reads. Source deletion cascades references.
There are no reference chains, copied source shares or editable source handles in the target view.
Local editable notes stay in their own panel/data; source display IDs are namespaced and always
read-only, even for staff. Source training links retain original crew context. Per-viewer/club/entry
visibility preferences contain layer identifiers only; refresh on focus and every 15 seconds clears
source content on failed authorization/loading. Filtering local notes by rower hides source layers
instead of assigning them to the target crew.

Media reads authorize the entry and constrain stored keys to its asset's directory. Attach, delete
and collection serialize on ordered asset locks; target parent locks also serialize entry numbering
and creator transfer. Removing an entry or training removes only its feedback and references. Only
an unreferenced asset is collected and its directory removed after commit. Tus termination uses the
same rule, including a ready entry. Bytes are counted once per asset.

Migration precedes web replacement. Old upload/worker writes remain supported by the trigger. Old
single-entry deletion still cleans up its own asset; old-image deletion of a shared original or a
reused entry raises before its handler can remove media. New transactions set the fixed server
capability `app.video_assets=isolated`. Thus rolling back refuses affected destructive operations
instead of risking other trainings' media. No columns/data are dropped; existing playback works.

The creator filter is a server-derived account-ID comparison, independently combined with club,
participation and notes-for-me filters and preserved in the URL. Null creators do not match.

## Consequences

Migration 0028 is additive and numbered past the separate uncommitted club-address migration 0027;
its journal/snapshot must be reconciled if that unrelated work is later integrated. UI reuse is
behind `VITE_FEATURE_VIDEO_REUSE` (development enables it); image builds enable the finished flow.
No new dependency, external processor, host setting, production change or automatic deployment.
Private feedback and coach-only analysis rights remain unchanged. Tests cover backfill/old-image
writes, cross-club/private-feedback denial, live membership, role combinations, concurrent reuse
and deletion, quota, independent analysis, source revocation and laptop/iPhone WebKit interaction.
