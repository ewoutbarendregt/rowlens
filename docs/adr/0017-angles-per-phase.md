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
