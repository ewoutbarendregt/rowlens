# Manage examples from Help, including existing trainings

Status: existing-training selection requested by Ewout (2026-11-16); publication rule below awaits
architectural approval under AGENTS.md. Branch: `codex/feat/help-example-management`, stacked on
`codex/fix/example-feedback` / PR #190. Existing create/edit/rename shortcuts are implemented separately.

## Existing behavior and reusable work

All newly created platform-admin trainings are already examples (ADR-0028), with frozen publisher
feedback (ADR-0030). Help currently offers no management controls. Its ordinary training editor can
already create, rename, upload and edit with the owning-club context. New Help controls reuse those
routes; no new editing permission is needed. The public catalog now supplies its already-discoverable
owning-club ID so every shortcut uses the correct tenant, even when another club is active.

## Proposed existing-training selection

A RowLens administrator can choose Add existing training in Help, select an active owning club,
search its trainings, and select a training not already published as an example. Display only the
bounded authorized management summary needed for selection; never fetch all private feedback to
build the picker. Show the exact training, club and global signed-in audience before publication.

An inline confirmation makes that training's videos, title, crew display information and permitted
analysis readable to every signed-in example viewer. The original training/creator/club and its
ordinary editing/participation/sharing rights are preserved; this is not a copied training. The
publishing administrator's own notes and drawings become the example feedback. Other authors'
notes (including the original non-admin creator's notes), assignments, shares and source-reference
feedback remain private. Existing automatically published examples keep their immutable publisher;
renaming or editing never changes which author is published. Management notices must describe the
publisher, rather than implying that a non-admin original creator's notes were published.

The earlier rule that platform-admin-created trainings are examples remains in force. This proposal
adds explicit promotion of an existing ordinary training; it does not introduce deletion or silently
withdraw existing examples. Removing examples would be a separate product decision.

## Permission implementation

Add migration 0032 after #190's 0031; no new table, dependency or external provider. Extend the
protected classification trigger only for an explicit authenticated publication operation. Pin a
narrow tenant-scoped publish function to the verified actor and current persisted global grant;
lock the grant, active owning club and parent training and recheck authority after waiting. Stamp
publisher=current actor only on the first false-to-true publication. Normal session updates cannot
set/change classification or publisher. Already published rows stay idempotent, retaining their
original publisher (including null legacy attribution); creator transfer never republishes another
author. Record the real actor/target through existing platform auditing.

Only a currently authorized RowLens administrator can use candidate/publish endpoints. Club admins,
coaches, rowers, pending/foreign accounts and forged/stale role snapshots cannot publish. All data
access remains in TenantContext/repositories/RLS. Existing exact-example safe projections and
private/no-store media authorization continue to apply after explicit publication.

## Review and verification

Test locked concurrent publication/revocation/archive behavior, correct club, immutable publisher,
ordinary update forgery, idempotence, preserving original ownership, and excluded other-author/
source/private feedback. Browser tests cover bounded selection, inline confirmation/cancel/error,
publication visible to a rower/clubless account, read-only controls, renaming and opening the ordinary
editor in the correct club on 1000x540/1440x900 Chromium and iPhone13 WebKit. No production rollout
is authorized by approval of this implementation plan.
