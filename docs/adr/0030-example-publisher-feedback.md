# ADR-0030: Read-only publisher feedback in training examples

- **Status**: accepted (Ewout: "Ja", 2026-11-16)
- **Date**: 2026-11-16
- **Related**: ADR-0005, ADR-0013, ADR-0026, ADR-0028, ADR-0029

## Context

Ewout found the examples through Help, but could not see the notes and lines he had added.
ADR-0028 intentionally excluded every annotation, and the example player did not render drawing
or text overlays. Ewout approved `docs/plans/example-feedback.md`: the original example maker's
own annotations are published for all authenticated example viewers; other authors stay private.

## Decision

Migration 0031 adds `rowing_session.example_publisher_user_id`, stamped alongside the protected
example classification. A caller cannot set/change the publisher, even through creator reassignment.
The existing-example backfill uses only recorded creators with a current persisted platform grant;
uncertain/ownerless examples keep a null publisher and expose no annotations. Removing a platform
grant does not withdraw existing published examples or change their publisher. The account foreign
key preserves attribution while the example exists.

The pinned `rowlens_example_annotation(video, author)` checks the exact active example/verified
viewer through the existing example capability and matches the immutable publisher. Both the
restrictive annotation role and example policies require it in example scope. Ordinary feedback
visibility remains unchanged; `rowlens_can_see_moment` is not widened. Other-author notes on the
same frame, legacy/null authors, source references, assignments and recipient metadata stay denied.
The maker's own existing and future annotations on the example are public example material,
including items that had ordinary moment assignments; those assignments are never returned.

The example repository uses tenant RLS and returns only annotation ID/frame/kind/body/normalised
shape and `canEdit: false`. Shape parsing strips unknown JSON fields. No author identity, timestamp,
recipient or source metadata crosses the projection. Existing `private, no-store` responses remain.

The example player reuses DrawingLayer, VideoNotesOverlay, frame grouping and boat-line resolution.
Saved drawings and joint measurements appear on their exact frame; text has the normal playback
hold; manual/automatic boat lines use the normal current-line/fallback rules. Frame buttons and
markers navigate without invoking write APIs. Drawing/note overlays share the player's zoom and
fullscreen coordinate system, with no editable shapes or mutation tools. NL/EN management notices
on the ordinary training/video pages explain publication to every signed-in viewer. Help and the
example callout distinguish publisher explanations from other authors' private feedback.

## Consequences

This deliberately extends ADR-0028's safe projection for approved publisher-authored material;
it does not make all feedback public or grant club membership, editing, forwarding or staff rights.
Publisher reassignment is intentionally unsupported. Changing which author publishes an existing
example would need a separate reviewed publication action. Existing private material from other
people never becomes visible because they later take ownership of the training.

The migration is additive; older images continue omitting annotations from their example API.
A new client tolerates an older example response without annotations after a server rollback.
No new dependency, provider, host configuration or automatic production rollout is introduced.
