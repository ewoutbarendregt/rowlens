# Sharing a training with club members

Status: proposed; awaiting architectural approval from Ewout (2026-11-15).
Branch: `codex/feat/training-sharing`, stacked on visibility/Help PR #184.

## Request

> il wil een training als roeier of coach kunnen delen met alle leden van de club of met individuele leden

## Current behavior

ADR-0028/migration 0029 allow a rower to read a training they created or participate in; staff retain
club-wide access. Existing `moment_share` and `momentSharesOf` concern individual feedback frames,
not a training. Reusing a recording (ADR-0026) grants neither participation nor source access.
There is no session-sharing table or capability. PR #184 remains open, unmerged and undeployed;
all nine checks in CI run 43709685832 succeeded before this proposal. Its separate local review
stack is still available at http://127.0.0.1:5175/projects/rowlens/.

## Proposed product behavior

- Add a Sharing card to the training page, below its facts, for its creator and current club staff.
  A rower manages sharing on their own trainings; coaches/club admins manage it on club trainings.
  Existing platform administrators retain their selected-club authority. A participant or recipient
  does not gain the right to forward another person's training or edit its audience.
- Choose All club members, individual active club accounts, or both. The individual picker includes
  all club roles, not just rowers. It searches names within this club, shows selected recipients and
  exposes no email addresses or standalone account directory. An empty selection with the club-wide
  option off means no additional access beyond creator, participants and staff.
- The card explains that sharing grants viewing access to the training, its videos, lineup and
  existing visible technique measurements. It grants no edit/upload/delete/reshare capability.
  Authenticated staff keep their existing independent edit rights; sharing does not downgrade them.
- Shared trainings appear in the recipient's ordinary training list, subject to their normal club
  and other filters. A label explains that the training was shared; it does not pretend they were
  in the lineup, created it or received private feedback. Primary-club defaults stay unchanged.
- All club members means current approved members and future approved members of that same active
  club. Pending applicants, accounts from other clubs and clubless accounts gain no access.
- Private notes/drawings, assignments and individual/crew feedback shares keep their existing rules.
  Sharing a training alone never exposes every note, automatically shares with its crew, or grants
  source-feedback access. Once training access exists, an explicitly assigned/shared note within it
  can be read under its current feedback policy. An isolated note share still cannot open a training.
- Removing one recipient withdraws that explicit grant. Turning off club-wide sharing withdraws
  that club-wide grant. Remaining creator/participant/staff/individual/club-wide authority still
  applies. Show the effective audience clearly so an independently authorized person is not described
  as blocked. Removing club membership immediately removes access and deletes individual grants;
  rejoining does not revive old individual grants, but active club-wide sharing applies normally.
- Changing the creator preserves the training's explicit sharing configuration; only currently
  authorized managers may change it. Historical sharer roles do not grant continuing management.
- Global administrator examples remain separate and filter-independent. Their read-only example
  viewer cannot manage sharing; restricting a club share cannot make a global example private.
  Existing recording reuse continues only from a currently accessible source in the same club;
  removing a share hides protected source feedback, while an already authorized independent copy
  retains its existing training/recording rights under ADR-0026.
- Update the NL/EN Help sections and permission explanations alongside the UI. No emails,
  notifications, anonymous links, new provider or dependencies are part of this request.

## Architecture requiring approval

One additive migration (expected 0030 after 0029), containing:

1. Tenant-scoped `session_share`: session and club IDs, club/member scope, nullable recipient
   account ID, granting actor and timestamp. Scope/null checks and partial unique indexes allow
   one club-wide grant and one grant per recipient. Composite club/session keys forbid cross-club
   parents. A composite club/recipient membership key, cascading on membership removal, forbids
   individual recipients outside that club. Club-wide rows have no recipient account.
2. Append-only `session_share_event`: club/session/actor IDs, affected scope/recipient and action/time
   for grant/revoke history, with no names/emails or media. Events retain historical UUIDs when
   membership/grants change; do not erase history on revocation. Policies limit reads to authorized
   management and forbid app-role event updates/deletes. Event writes occur only through the
   protected mutation, in the same transaction as the audience change.
3. A sharing revision on the parent training, updated atomically with an audience replacement.
   Reject stale edits with a conflict response and reload option, matching existing settings UX.
4. Pinned permission helpers and restrictive session/child RLS: creator OR actual participant OR
   an active same-club explicit/club-wide grant, plus existing staff access. Read grants never
   feed editing helpers. New tables receive tenant RLS, restrictive role policies, example-scope
   denial and schema/cross-club regressions. No trusted client role or audience flag.

All operations use tenant-scoped repositories and `withTenant`. The current verified club actor,
actual membership/roles or persisted platform grant must be rechecked for management (as in
ADR-0026), not inferred from an earlier role snapshot. Lock the editable parent and recheck current
authority before changing grants/revision/history. A protected bounded recipient projection is
available only to a sharing manager of that exact training. Request validation checks every target
against its active club membership, including changes made while the form was open.

The access helper reads a narrow protected grant projection to avoid RLS recursion through the
session it is authorizing. It validates the selected club, real current membership and active club.
Never broaden tenant policies or use owner-role route queries. Media follows the same logical-entry
read boundary and continues private/no-store; source feedback remains independently authorized.
Archived clubs remain inaccessible. Service processing remains explicit and ordinary examples keep
their existing separate read-only scope.

Record an accepted ADR (next number at implementation) that extends ADR-0028's ordinary read rule
and documents the separation from feedback sharing and platform examples. Leave creator/participant
rules and older-image write safeguards intact. An older web image may not expose the new Sharing UI;
new persisted grants must not silently grant mutation rights in an older capability mode.

## Verification and delivery

- SQL/API regressions for creator, cox/rower participant, selected recipient, unrelated member,
  coach/admin/all additive role combinations, platform actor and two clubs. Verify child/detail/media
  read scope, denied edits/forwarding, malformed/stale writes and revoked actor/recipient membership.
- Club-wide and individual grants can coexist. Test independent revocation, future approved members,
  pending/foreign recipients, membership removal/rejoin, creator transfer and archived clubs.
- Private feedback/source references remain private; explicit note recipients can read only once
  the training is accessible. Reusing a newly shared recording preserves independent local analysis.
- Verify example audience cannot be narrowed through ordinary sharing and its viewer cannot mutate
  grants. Validate append-only audit, same-club keys and all tenant/example policy invariants.
- Browser checks at 1000x540/1440x900 Chromium and iPhone13 WebKit: recipient search/selection,
  club-wide choice, saved audience/reload/conflict/revoke, recipient read-only view/list label,
  filter semantics, Help and measured overflow/touch targets.
- Required format/lint/typecheck/full web/database and relevant browser checks, security review note,
  project logs and local review. Keep this one change in a separate PR stacked on #184 until its
  parent is merged. Approval covers local implementation/migration only, never merge or deployment.

No functional code/schema/database has been changed for this proposal.
