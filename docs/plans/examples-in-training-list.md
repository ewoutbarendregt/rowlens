# Plan: example trainings in the normal training list

Status: approved ("Ja, bouwen", 2026-11-17) and implemented locally on `claude/feat/examples-in-training-list`. Amends ADR-0028/0031 (UI only).

Implementation notes: the example route is `/examples/:id` (training) and `/examples/:id/videos/:videoId`
(video), so old links keep working without a redirect. The `ExampleCreate` form was dropped too: a
training a RowLens admin creates is already an example (ADR-0028 trigger). The example projection
keeps no timestamps (ADR-0030), so example cards show no "created on" time.

## Request

Ewout: RowLens-admin videos should "always be available under the filter with the same
functionality as videos with other visibility", not as a separate video corner under Uitleg.

Answers to the clarifying questions (2026-11-17):

1. Viewers from other clubs open examples in the **normal training and video pages, read-only**
   (video, frame stepping, strokes, angles, the publisher's notes and drawings). No own notes.
2. Examples are **always shown, whatever club is selected**, marked "Voorbeeld"; search, boat type,
   date and sort filters still apply to them.
3. The example section under **Uitleg is removed**; RowLens admins publish or rename an example from
   a button on the training itself.

## Current state (main 5c2b4d8)

- `SessionsPage` drops `isExample` rows from `/api/account/sessions` and renders `<Examples />`
  as a separate block under the list; `HelpPage` renders `<Examples manage />` (create, rename,
  select-existing via `ExamplePicker`/`ExampleManagement`).
- Example cards open `/examples/:id` (`ExamplePage`, a separate read-only player) backed by the
  RLS-scoped `/api/examples/:id` (+ media) endpoints (ADR-0028's narrow cross-club read).
- Normal `SessionPage`/`VideoPage` call club APIs (`/api/sessions/:id`, `/api/videos/:id/...`) that
  a non-member cannot and must not reach.

## Proposal

No migration, no new table, no change to RLS or the example read API.

1. **List.** The unified overview also loads `/api/examples` and merges them into the same list:
   - Examples bypass the club filter only; search, boat, date, notes and sort apply as usual.
   - De-duplicate by id: a training the viewer can already read through its club stays a normal card
     (normal rights), with the "Voorbeeld" badge added.
   - The separate `<Examples />` block under the list goes away.
2. **Normal pages in example mode.** A foreign example card opens the normal training route with an
   example marker (`/sessions/:id?example=1`, via `base-path.ts`). `SessionPage` and `VideoPage` get
   a small read-only data source that loads `/api/examples/:id` once and serves video, strokes,
   angles, auto boat line and publisher annotations from it, with media from the example media URL.
   Every edit control is hidden in this mode (title, crew, upload, delete, strokes, angles, drawing,
   notes, sharing), like a read-only participant view. The server keeps rejecting writes regardless.
   `/examples/:id` stays as a redirect to the new URL so old links keep working; `ExamplePage` is
   then removed once its behaviour is covered by the normal pages, including the BUG-070 Linux
   WebKit seek/paint repair (shared Player code, so this is kept, with its regression tests).
3. **Publishing from the training.** On a training in its own club context, a RowLens admin sees
   "Publiceren als voorbeeld" with the existing inline confirmation (ADR-0031 rules unchanged:
   original owner/club stay, only the publisher's own notes/drawings become example material).
   Rename uses the existing normal title edit. Creating an example = creating a normal training as
   a RowLens admin (already classified automatically by ADR-0028's trigger).
4. **Uitleg.** Text only again; the visibility/sharing texts are updated (NL + EN) to say examples
   appear in the training list. `ExamplePicker` and the Help management UI are removed; the
   `/api/example-management/*` publish endpoint is reused by the new button, the candidates search
   is dropped if nothing else uses it.

## Tests (definition of done)

- Unit: merge/de-duplicate/filter logic (club filter bypass, other filters applied).
- Browser (Chromium 1000×540 + 1440×900, iPhone 13 WebKit): non-member sees the example card under
  any club filter, opens it in the normal pages read-only with no edit controls, steps frames and sees
  publisher notes/drawings; member of the owning club keeps normal rights; admin publishes from the
  training with inline confirmation; Uitleg has no example section; old `/examples/:id` redirects.
- Existing example security tests (forged writes, cross-club denial) stay green unchanged.

## Not included

Own notes/drawings by viewers on examples, unpublishing, any production change. Security review
note in the PR (cross-club read path reused in the normal pages).
