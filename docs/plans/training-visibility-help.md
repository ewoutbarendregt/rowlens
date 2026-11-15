# Training visibility, primary club and help

Status: approved by Ewout with “ja” (2026-11-15); implementation and verification in progress.
Branch: `codex/feat/training-visibility-help`.

## Findings

ADR-0020 and migration 0019 deliberately allow every club member to read all club trainings.
`rowlens_can_see_session` and the restrictive session SELECT policy both need revision; filtering
only `SessionsPage` would leave direct session/video/media URLs accessible. ADR-0013's former
reachable-session rule also includes individually shared feedback, so restoring it unchanged would
not satisfy creator-or-participant-only visibility.

The unified overview aggregates authorized clubs in separate tenant transactions. Settings have
no primary-club field. Default filters currently select all clubs. The application has no general
usage guide. Existing working-copy club-editor and analysis experiments are unrelated and remain
untouched in the original checkout; this proposal is isolated in a managed worktree.

## Proposed behavior

- Rower-only members read ordinary trainings only when they created them or their verified linked
  account appears in the lineup, including the cox. Shared/assigned feedback alone does not grant
  access to an otherwise inaccessible training. Coaches and club admins retain current club-scoped
  access; role sets remain additive. RowLens admins retain existing platform authority.
- Enforce the same boundary on list/detail, videos, playback/renditions/posters, lineup, feedback,
  measurements and other child resources. Preserve the existing write-permission rules: appearing
  in a lineup does not grant ownership or staff capabilities.
- Add a nullable `primaryClubId` to central account settings, with the same revision/conflict
  mechanism. A member can select only an active club they belong to, including when an admin edits
  their settings. Joining a club does not silently replace an existing valid preference.
- On the first unfiltered overview visit, select the valid primary club; with one membership use
  that club. If several clubs exist without a preference, choose the first by name with ID as a
  stable tie-breaker. If a preference becomes unavailable, use that same fallback without granting
  access or silently rewriting the preference. With no memberships show the clubless state and
  examples. Explicit URL filters, including an explicit all-clubs choice, take precedence; reset
  returns to the default club. Selection of a filter does not switch the active tenant or drafts.
- Trainings created by a server-verified RowLens administrator become examples automatically.
  Persist that classification at creation, independent of later creator reassignment or withdrawal
  of the creator's administrator grant. A reviewed migration classifies existing trainings whose
  recorded creator currently has the persisted platform grant; never infer historical authority or
  assign unknown/ownerless sessions by name. Club administrators cannot create global examples.
- Show a separate labelled Examples section beside ordinary results, independent of the club and
  participation filters, with no duplicate ordinary cards. Examples are viewable by every signed-in
  account, including clubless accounts and accounts from other clubs. Anonymous internet access is
  outside this proposal. Visitors get read-only playback and explicitly example-visible analysis;
  private feedback, account emails/directories and unrelated club content stay inaccessible.
- Put a permanent Help navigation link in the application header and a contextual link beside
  Examples. The NL/EN guide covers creating a training, crew/cox selection, uploading, playback,
  frame stepping/speed/zoom, marking strokes, drawing/angles, feedback/sharing, training visibility,
  club selection and primary club. Describe only implemented capabilities and role-appropriate
  controls. Use screenshots/media only if synthetic or explicitly approved for this purpose.

## Architecture requiring approval

Add one coordinated additive migration for the primary-club preference, persisted example
classification and protected read policies/functions. Follow the migration number at implementation
 time; the original checkout already contains an unrelated uncommitted migration 0027.

Ordinary content retains `TenantContext` plus restrictive RLS. Example discovery exposes only
published example IDs and owning club IDs through a narrow protected function. Resolve each example
under its own server-validated tenant and an explicit read-only example scope. SQL must validate
that exact example against the authenticated account and persisted classification; a client club ID,
role or example flag never grants membership, staff authority or platform access. Allowlist example
fields/endpoints and subordinate resources; deny account/roster directories, private notes, mutation
and unrelated content. Tenant isolation remains unchanged for ordinary trainings. Archived clubs
remain inaccessible, including examples, consistently with ADR-0022.

Review all dependent helpers/policies and feature-off/previous-image behavior before finalizing SQL.
Use a server-owned capability version if required to keep legacy-image behavior consistent during
migration/rollback. Do not weaken read policies to accommodate an older image. The implementation
ADR must explicitly supersede ADR-0020's rower-wide reading and document this narrow cross-club
example exception to ADR-0021. No new dependency or external provider is proposed.

## Verification and delivery

1. Regressions for all seven role sets, creator/participant/cox/unrelated viewer, linked/unlinked
   identities, lineup removal, role revocation, shared-only feedback and two-club denial.
2. Direct app-role SQL plus list/detail/video/media and child-resource tests, including attempted
   forged contexts/IDs, example writes/private data, clubless viewers and archived clubs.
3. Settings tests for valid/foreign/archived clubs, concurrent save conflicts, unavailable primary
   membership, URL precedence, reset and explicit all-clubs selection.
4. Browser checks on 1000x540 and normal laptop Chromium plus iPhone 13 WebKit: primary filter,
   read-only examples, Help discovery, navigation and overflow/touch targets.
5. Required format/lint/typecheck/full web/database checks and relevant build/browser checks;
   update project logs, ADR/index, privacy documentation and security review note in the PR.

Approval authorizes local implementation and migration only. No merge or production deployment is
requested or authorized. The implementation must be tried on the local stack before delivery.
