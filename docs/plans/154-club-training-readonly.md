# Club training visibility and editing by role (#154)

Status: approved by Ewout ("voer het plan uit", 2026-11-06); implemented and verified locally; ready in [#155](https://github.com/ewoutbarendregt/rowlens/pull/155).
Requests: "als roeier moet je wel de trainingen van de andere roeiers kunnen zien, maar je mag ze niet aanpassen";
"Volledig alleen-lezen"; "eerst plan aanpassen. coaches en beheerders mogen overigens wel trainingen van anderen aanpassen".
Issue: https://github.com/ewoutbarendregt/rowlens/issues/154

## Revised permission matrix

| Roles | View trainings in the current club | Edit own training | Edit someone else's training |
|---|---|---|---|
| Rower only | All | Existing rower rights | No; fully read-only |
| Coach (including rower + coach) | All | Yes, with coach rights | Yes, with coach rights |
| Admin (with any other roles) | All | Yes | Yes |

Approved ownership definition: an own training was created by the current user. Merely appearing
in the lineup does not establish ownership. Training ownership does not grant a rower coach-only
stroke/angle analysis rights. Existing additional roles remain additive; being a rower never
reduces a separately granted coach/admin capability.

Ewout corrected the earlier proposal: coaches must be able to edit other members' trainings even
when they neither created nor rowed in them. Do not preserve the old own/reachable-only coaching
scope. Coaches need club-wide training visibility and management; admins retain the same scope.

## What fully read-only means for a rower

- Browse all current-club trainings, videos and necessary crew names. Playback, stepping, speed,
  zoom and personal preferences remain usable. No cross-club access, standalone Rowers directory
  or other users' account settings.
- In a foreign training, no renaming/deleting, lineup changes, video uploads/replacement/removal,
  upload continuation/cancellation, stroke/angle/boat-line mutations or media-file changes.
- No adding, editing or deleting notes/drawings there, including feedback previously authored by
  the viewer. No assignment, sharing/unsharing or other feedback mutations. Authorship alone
  must not bypass a foreign training's read-only rule.
- Existing private-note visibility remains for rowers: all-training access does not publish private
  feedback to them. Coaches/admins retain their elevated note/analysis permissions across all club
  trainings; ordinary rowers retain only existing author/role rights in their own trainings.
- Coach/admin training management does not grant account administration or creator reassignment
  to coaches; those existing admin-only operations remain admin-only. Club roster permissions and
  personal-settings permissions from #152 are unchanged.

## Findings

`rowlens_can_see_session` currently permits admin/service, creator, crew and sessions with feedback
for the member. Session/video/lineup policies reuse visibility for SELECT and mutations (`FOR ALL`).
Simply broadening the visibility helper would also broaden rower writes. Split reading from
editing. `rowlens_coaches_video` must support the newly requested club-wide coach scope.

Several mutation handlers currently rely on visibility/RLS rather than explicit resource write
permission. Session/video deletion and upload/cancellation also affect media files. Authorize
before collecting/deleting/writing media; a denied database mutation alone must not leave files
changed or falsely report success.

Relevant paths: server/db/schema.ts and SQL helpers/policies; server/auth/can.ts;
server/api/{sessions,videos,uploads,lineups,annotations,moments,strokes,angles}.ts;
client session/video/lineup/upload/notes controls and NL/EN strings.

## Approved implementation

1. One migration separates read and write policies/helpers while retaining tenant RLS and explicit
   service handling. All members read all current-club trainings. Write permission combines
   resource ownership for rowers with club-wide coach/admin capabilities. No new table/dependency.
   Update the permission ADRs to supersede the former own/reachable-only training scope.
2. Use the same resource decisions for API mutations before filesystem effects, and return
   server-derived capabilities to the UI. Rower-only foreign trainings have no editable controls;
   coach/admin controls remain available throughout the club. Own settings remain available.
3. Test two rowers, an unrelated coach, an admin and another club: all current-club trainings
   readable; every foreign-training rower write denied without data/media changes; coach/admin
   writes allowed even without participation/creation. Cover own rower rights, private notes,
   previously authored foreign feedback, ownerless legacy sessions and all role combinations.
   Run web/worker/local/edge checks plus iPhone WebKit and 1000×540 before a PR.

Implementation uses migration 0019 (20 migrations total locally), separate resource read/write policies,
server-derived capabilities and pre-media parent locks. Permissions are rechecked in a fresh statement
after a lock wait, so a concurrent creator transfer cannot authorize an upload with stale ownership.
ADR-0020 records the accepted decision. No merge/deployment for #154; production stays sha-b000ca4
and deployment log #153 remains a separate PR.
