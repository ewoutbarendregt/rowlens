# Rower: browse other club trainings without editing (#154)

Status: proposed; permission-policy migration awaits Ewout's architectural approval.
Request: "als roeier moet je wel de trainingen van de andere roeiers kunnen zien, maar je mag ze niet aanpassen".
Issue: https://github.com/ewoutbarendregt/rowlens/issues/154

## Scope to confirm

- Rower-only users can list/open all trainings, videos and necessary crew information in their
  current club. No cross-club access, standalone Rowers directory or other users' settings.
- A training made by someone else is read-only. An own training means one created by the current
  user, not simply one in whose lineup they appear. Existing additional coach/admin capabilities
  remain; test all role combinations without accidentally expanding their write scope.
- No renaming/deleting another person's training, changing its lineup, adding/removing/replacing
  videos or changing stroke/angle/boat-line data. Playback, stepping, speed, zoom and personal
  preferences remain usable while viewing. Do not present unauthorized editing controls.
- Existing private-note visibility remains: broader training access does not publish private notes.
  Clarification pending: should foreign trainings be fully read-only, or may a rower add/manage
  their own notes/drawings there? Never allow changing someone else's private feedback by default.

## Findings

`rowlens_can_see_session` currently permits admin/service, creator, crew and sessions with feedback
for the member. Session/video/lineup policies reuse visibility for SELECT and mutations (`FOR ALL`).
Simply broadening the visibility helper would also broaden writes. `rowlens_coaches_video` also
uses visibility: preserve its existing management scope when combined roles gain broader reading.

Several mutation handlers currently rely on visibility/RLS rather than explicit session ownership.
Session/video deletion and upload/cancellation also affect media files. Check write authorization
before collecting/deleting/writing media; a denied database mutation alone must not leave files
changed or falsely report success.

Relevant paths: server/db/schema.ts and its SQL helpers/policies; server/auth/can.ts;
server/api/{sessions,videos,uploads,lineups,annotations,moments,strokes,angles}.ts;
client session/video/lineup/upload/notes controls and NL/EN strings.

## Proposed implementation

1. One new migration separates read and write policies/helpers, preserving tenant RLS and explicit
   service handling. Allow club-wide rower reading, use resource ownership and existing elevated
   permissions for writes. No new table or dependency. Update the permission ADRs for this change.
2. Apply the same resource decisions to API mutations (before filesystem effects) and expose
   server-derived capabilities to the client. Foreign-training controls become read-only; own
   training editing and personal settings remain available. Feedback follows the clarified choice.
3. Add integration/API/direct-RLS tests with two rowers, two owned trainings and an unrelated club;
   verify every mutation refusal leaves data and media unchanged. Cover private notes, role
   combinations, ownerless legacy sessions, user-visible session filtering and read-only playback.
   Run the full web/worker/local/edge checks plus iPhone WebKit and 1000×540 before a PR.

No implementation, migration, merge or deployment has been performed for this proposal.
Production stays sha-b000ca4; deployment log #153 remains a separate PR.
