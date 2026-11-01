# ADR-0009: Analysis pipeline outline (M2)

- **Status**: proposed — outline; model choice confirmed by evaluation in M2
- **Date**: 2026-11-01

## Context

Analysis is indicative but **every number must be traceable** to frames, keypoints, model/pipeline
versions and parameters, must show confidence, and must **refuse** rather than guess. Three perspectives
(boat, bank, drone) with different validity. Multi-person boats (CX4+: four rowers + cox) need seat
assignment confirmed by a human. Models must be open and self-hostable; the worker must be able to move to
a GPU host.

## Decision

**Stages** (each a pure, versioned step; outputs stored as artefacts under
`clubs/{c}/videos/{v}/analysis/{runId}/`):

1. **Quality gate** — resolution, fps ≥ 25, blur/exposure, perspective declared by uploader. Fail → no run,
   reason shown.
2. **Person detection + tracking** — top-down detector (RTMDet via rtmlib/ONNX) + ByteTrack; track ids.
3. **Seat assignment** — UI shows detected tracks on a frame; uploader assigns tracks → seats/rowers once
   per video. Analysis of a person only proceeds after confirmation (manual over silent automation).
4. **2D pose** — candidate: **RTMPose** (Apache-2.0, via rtmlib + ONNX Runtime, CPU-viable, GPU-ready).
   Keypoints per frame with per-keypoint confidence; One-Euro smoothing with recorded parameters.
5. **Stroke segmentation** — per rower, from wrist/handle horizontal trajectory and knee angle:
   catch = trajectory extremum (sternward), finish = extremum (bowward); drive/recovery between. Signal
   processing (filtering + peak detection) — deterministic, unit-tested against synthetic signals.
6. **Metrics** — stroke rate (strokes/min), drive:recovery ratio, rhythm consistency (CV of stroke
   period), joint angles (back, hip, knee, elbow, shin) at catch and finish, crew sync (catch/finish offset
   per seat vs. stroke seat and crew mean, ms).
7. **Validity rules** — `docs/analysis/perspective-rules.md` is the single, versioned rule table
   (metric × perspective × minimum confidence × min. strokes). Engine outputs either a value or a
   `refused(reason)`. E.g. joint angles require a side view (bank, or boat-side); drone-from-above allows
   rate/sync but not sagittal angles.
8. **Reference comparison** — reference posture per phase as a keypoint template, configurable per boat
   class + perspective, normalised for limb lengths; shown as stick-figure overlay / side-by-side.
9. **Explanation** — structured metrics → LLM (ADR-0010) → plain-language feedback + drills, in the
   rower's locale. Only the structured metrics are sent, never video.

**Traceability data model**
- `analysis_run`: video, rendition hash (sha256), pipeline version (git sha + semver), model ids with
  weights sha256, all parameters (JSON), started/finished, status.
- `metric`: run, rower/seat, stroke index (nullable), name, value, unit, confidence, status
  (`ok|refused`), reason, `evidence` = frame indices/ranges + keypoint artefact refs + overlay image refs.
- UI: clicking a metric opens the player at the evidence frames with the keypoint overlay.

**Evaluation**
- `eval/reference/` manifest of hand-labelled clips (videos stored in a private bucket, not in git):
  stroke catch/finish frames, selected joint angles per stroke, perspective.
- `eval` job runs in CI on changes under `worker/src/rowlens_worker/analysis/**`, on a self-hosted or
  scheduled runner if clips are too large for GitHub-hosted; reports MAE (frames, degrees, spm) and the delta
  vs. `main` as a PR comment. Regressions beyond a threshold fail the check.

## Consequences

- Clear, explainable chain from pixels to sentence; slower than end-to-end models but defensible.
- CPU-only pose on a 2-min 60 fps clip × 5 people is slow (tens of minutes); the `gpu` queue class lets a GPU
  host take it later. Frame subsampling for rate/sync is a recorded parameter.

## Alternatives considered

- **MediaPipe Pose** (Apache-2.0) — fast, but single-person; poor in a crowded boat. Kept for single-sculler
  / bank shots in the evaluation.
- **YOLO-pose (Ultralytics)** — accurate and easy, but **AGPL-3.0** (or paid licence) — would impose AGPL
  obligations on a hosted service. Excluded unless you accept that.
- **Vision-LLM on raw video** — not traceable, sends video to a provider. Rejected (except as opt-in research).
