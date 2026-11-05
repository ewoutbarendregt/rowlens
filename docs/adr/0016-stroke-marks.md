# ADR-0016: Stroke marks by the coach, for the whole boat

- **Status**: accepted
- **Date**: 2026-11-03
- **Deciders**: Ewout (product owner), Claude (lead engineer)

## Context

Ewout wants to focus on analysis tools for coaches. Everything on the head coach's list (#127) hangs
on the moments of a stroke: angles at the catch, half slide and finish; crew uniformity; the drive to
recovery ratio. Automatic stroke segmentation (ADR-0009, stage 5) needs pose estimation that RowLens
doesn't have yet, and ADR-0009 needs hand-labelled catch and finish frames to evaluate it against.

## Decision

- **Coaches mark the strokes by hand** while stepping (#85): catch, finish and, optionally, the half
  slide. Marks are frames on the CFR rendition (ADR-0007), one per frame, in table `stroke_mark`.
- **For the whole boat** (Ewout, 2026-11-03): one series per video, the boat's rhythm. Per-rower
  marks can follow when crew timing needs them.
- **Coaches of the session and the admin set them**; everyone who sees the video sees them and the
  timings (`can(mark_strokes)` in the API, restrictive RLS policies underneath).
- **The half slide is only what the coach marks**, on the drive (between catch and finish) or the
  recovery (between finish and next catch). It is never derived from the midpoint, because the
  recovery isn't uniform.
- **Timings are computed, not stored** (`shared/strokes.ts`, pure). A stroke runs from catch to next
  catch: rate (spm), drive, recovery and their ratio, each with the frames it came from, or the
  reason it can't be given (last stroke, finish missing, two finishes). Averages need at least 3
  complete strokes (`perspective-rules.md`).
- The marks are the **reference set** for automatic segmentation later (ADR-0009 evaluation).

## Consequences

- Marking a 5-minute piece is real work (about 150 strokes). That's why there are keys (I, H, U;
  ↑ / ↓ to move between catches) and why one series covers the boat.
- Changing a mark changes every timing at once, and nothing goes stale.
- Per-phase angles (step 2) attach to these frames; automatic marks later get compared against them.

## Addendum (2026-11-03): arrows, and the middle of the drive as a calculated option

- Under the video the catch shows as an **arrow down**, the finish as an **arrow up**; a marked half
  slide stays a short tick (Ewout).
- Ewout asked for the **middle of the drive, calculated**, as an option. It is the frame halfway in
  time between catch and finish (`Stroke.driveMiddle` in `shared/strokes.ts`), shown as an open
  circle on the timeline and named "calculated" in its label. It is **off by default** and remembered
  per device. A half slide the coach marked on the drive always wins, and the calculated point is
  never stored or used as a measured half slide: it is a guide for stepping, not evidence.


## Addendum (2026-11-05): explicit removal of stored marks

Alongside toggling a kind on its own frame, coaches/admins can expand a mark editor in Strokes.
Every stored catch, finish and half slide has a jump and a Delete action, with an in-page
confirmation naming its kind and frame. Deletion targets that frame regardless of the playback
cursor, uses the existing tenant/role-protected API, and refreshes the derived timings and timeline.
Marks outside complete strokes remain removable. No schema or permission changes are needed.
