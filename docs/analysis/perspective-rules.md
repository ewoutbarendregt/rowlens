# Analysis validity rules per perspective

Version: **0.1.0 (draft)** · Owner: analysis pipeline · Referenced by ADR-0009.

This table is the single source of truth for which metric may be reported from which camera
perspective. The pipeline loads a machine-readable copy (`worker/src/rowlens_worker/analysis/rules.toml`,
added in M2) and CI checks the two stay in sync. A metric not allowed here is **refused**, with the
reason shown to the user — never estimated.

| Metric | Boat (onboard, stern/bow) | Boat (coach boat, side) | Bank (side) | Drone (overhead) | Drone (oblique side) | Min. pose confidence | Min. strokes |
|---|---|---|---|---|---|---|---|
| Stroke rate | ✅ | ✅ | ✅ | ✅ | ✅ | 0.5 (wrists) | 3 |
| Drive:recovery ratio | ✅ | ✅ | ✅ | ✅ | ✅ | 0.6 | 3 |
| Rhythm consistency | ✅ | ✅ | ✅ | ✅ | ✅ | 0.6 | 5 |
| Crew sync (catch/finish offset) | ⚠️ visible seats only | ✅ | ✅ | ✅ | ✅ | 0.6 | 3 |
| Back / hip angle | ❌ | ✅ if ≤ 30° off perpendicular | ✅ if ≤ 30° off perpendicular | ❌ | ⚠️ ≤ 30° off | 0.7 | 3 |
| Knee / shin angle | ❌ | ✅ (same) | ✅ (same) | ❌ | ⚠️ (same) | 0.7 | 3 |
| Elbow angle | ❌ | ✅ near-side arm only | ✅ near-side arm only | ❌ | ⚠️ | 0.7 | 3 |

Legend: ✅ allowed · ⚠️ allowed with extra checks · ❌ refused.

Open items (to validate with coaches and the reference set in M2): the 30° camera-angle tolerance,
confidence thresholds, and whether onboard footage can support sync for seats facing the camera.
