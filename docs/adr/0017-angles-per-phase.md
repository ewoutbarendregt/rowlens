# ADR-0017: Angles per rower and phase, measured by the coach

- **Status**: accepted
- **Date**: 2026-11-03
- **Deciders**: Ewout (product owner), Claude (lead engineer)

## Context

With stroke marks (ADR-0016) RowLens knows where each catch, half slide and finish is. The head coach
wants knee, hip and arm angles at those moments, the upper body's position against the boat, and
whether the crew's angles are equal (#127, groups A and B). The drawing tool (#60) measured loose
angles, without a rower or a phase, so nothing could be compared or averaged. Automatic pose
estimation (ADR-0009) is later work and needs hand-measured references to be evaluated against.

## Decision

- **The coach measures by hand, per rower, joint and frame**, in table `angle_measure`: the tapped
  points (fractions of the picture), the rower (roster), the joint. One per rower, joint and frame;
  measuring again replaces it. Values are computed, not stored (`shared/angles.ts`).
- **Definitions** (Ewout, 2026-11-03), tapped in this order:

  | Joint | Points | Value |
  |---|---|---|
  | Knee | hip → knee → ankle | inner angle at the knee; 180° straight |
  | Hip | shoulder → hip → knee | inner angle at the hip |
  | Elbow | shoulder → elbow → wrist | inner angle at the elbow; 180° straight |
  | Upper body | hip → shoulder | angle from the perpendicular to the boat line; forward (toward the stern) positive |

- **The boat line**: two points per video, bow side first (`video_boat_line`). The upper body is
  measured against it, so a tilted camera doesn't skew it and forward is known. Without it, upper
  body values are refused with that reason.
- **Only on marked frames** (catch, half slide, finish). The phase comes from the mark; a half slide
  counts as drive or recovery as in `strokesFrom`. If the mark is removed later, the measurement stays
  but counts in no phase, and the page says so.
- **Coaches of the session and the admin measure** (`can(measure_angles)`, restrictive RLS);
  everyone who sees the video sees the measurements and tables.
- **Per joint a table**: rows are rowers in boat order, columns the phases. Each cell has the mean, n,
  the spread (min–max) and the frames it comes from (a click jumps there). The last row is the
  **difference in the crew**: highest minus lowest rower mean.
- Angles are only reliable from the side. On a video uploaded as filmed from the boat or a drone the
  page says so (`perspective-rules.md`), but doesn't refuse: the coach knows the camera.
- **Merging roster entries** moves measurements through a definer function
  (`rowlens_merge_angle_measures`, migration 0014), limited to the current club and two of its rowers.
  Otherwise a merging member's role policies would skip measurements in sessions they can't see, and
  the rower's key would block the merge.
- These measurements are the **reference set** for automatic angles later (ADR-0009 evaluation).

## Consequences

- Measuring a crew at three phases over several strokes takes the coach a while (3 taps per joint).
  The table shows how many strokes each mean is over, so a mean of one is visibly thin.
- The wrist angle (head coach) needs hand keypoints and isn't in this set yet.

## Addendum (2026-11-04): the boat line found in every frame

The worker now finds the boat line in every frame; a coach's line wins on its frame and steers the
search (ADR-0018).

## Addendum (2026-11-03): several boat lines; drawing made for fingers

- **A boat line per moment.** A moving camera turns the boat in the picture quickly (Ewout), so a
  video holds several boat lines, each from its frame on (`video_boat_line` keyed by video and frame,
  migration 0015). An upper-body measurement uses the last line set at or before its frame; before
  the first line, the first (`boatLineAt`). Existing lines start at frame 0.
- **Drawing with a finger** (the head coach on an iPhone: "at the slightest touch you have a line";
  the boat line was "too sensitive"). For drawings, measurements and boat lines alike:
  - a point is placed only by a short, still tap; a swipe, a second finger or a long press places
    nothing;
  - nothing is saved until **Save** (Enter); every point stays draggable until then, at half speed
    with a finger, so it can be placed precisely without the finger covering it;
  - "Start over" clears the points, Backspace takes the last one back, Esc cancels.


## Addendum (2026-11-05): a saved drawing can be moved; its rower is chosen in the picture (#141)

- **Everything on the picture can be changed afterwards.** Tapping a drawing — a note's line, arrow
  or angle, an angle measurement, the boat line — selects it: a light halo, a ring on each point.
  Dragging a ring moves that point (exactly with the mouse, at half speed with a finger), and letting
  go saves it: `PATCH /api/annotations/:id` with `{ points }` for an annotation, `PUT
  /api/videos/:id/angles` for a measurement (same rower, joint and frame) and `PUT
  /api/videos/:id/boat-line` for a line. Correcting the line the worker found makes it a coach's line
  on that frame, which wins and restarts the search (ADR-0018); without a bow side nobody knows which
  end is which, so the found line can only be moved once that is chosen.
- **Who may move what** stays the database's call: `canEdit` from the API for annotations (the author
  or a coach of the session, migration 0011/0012) and `can(measure_angles)` for measurements and
  boat lines.
- **The pick is in screen pixels, not the DOM's.** A fingertip-sized press area is what matters, so
  the layer finds the nearest point of the selected drawing itself, 28 screen pixels away at any zoom
  (the same reach as drawing mode), instead of an invisible SVG stroke: the stroke hit area of a small
  circle proved unreliable (`vector-effect: non-scaling-stroke` skips its centre in Chromium). The
  press area sits on top of the drawings so no stroke can take a press away from a ring; a press
  beside the drawing drops the selection instead of playing the video, and only when it started there
  (WebKit sends the click to whatever is under the finger at release).
- **The attributes belong beside the points**: while measuring, the rower and the joint are chosen in
  the bar over the picture (in full screen too) instead of the Angles tab below it, which is off
  screen on a phone. The bar keeps one row on a phone; the labels of the two choices are hidden there
  and the hint truncates rather than making the bar taller than the picture can spare.
- **Drawings show on their own frame only** (Ewout): stepping one frame away hides them, so the
  explanation's playback hold (`NOTE_HOLD_SECONDS`) no longer carries them along. The track's markers
  still say where a note or drawing is, and the note toggle hides drawings with the notes.

## Addendum (2026-11-05): keep the whole picture available for editing

A review of the basics at 1000×540 found that the measurement bar intercepts clicks intended for
points in the lower part of the picture (BUG-021). Drawing and measurement controls now sit in a
strip directly below the picture, still inside the player in native fullscreen and the iPhone
immersive fallback. This supersedes the over-picture placement above; the rower and joint remain
beside the picture instead of requiring the off-screen Angles panel. Selects and buttons have
explicit 44 px touch targets; saving and permissions are unchanged.
