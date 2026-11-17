# ADR-0031: Explicit publication of existing trainings from Help

- **Status**: accepted (Ewout: “Ga verder”, 2026-11-16)
- **Date**: 2026-11-16
- **Related**: ADR-0005, ADR-0013, ADR-0028, ADR-0030

## Context

Ewout requested Help management for creating, editing and renaming examples and clarified
“Ook bestaande trainingen selecteren”. He approved the concrete publication/privacy boundary in
`docs/plans/help-example-management.md`. Ordinary trainings may belong to a non-admin author;
publication must therefore choose the publishing administrator explicitly without transferring ownership.

## Decision

Help offers global RowLens administrators the existing new/rename/ordinary-editor shortcuts and a
club-scoped search of unpublished trainings. Candidate responses contain only bounded management
metadata (20 rows, title/date/boat/video count and UUID cursor); literal search does not treat user
input as wildcard SQL. Explicit inline confirmation describes the exact training/club, all signed-in
viewers, live future changes, publisher-only annotations and the lack of a withdrawal action.

Migration0032 adds no table. `rowlens_example_manager` verifies current persisted platform authority,
verified identity, active club and ordinary tenant context. The pinned security-definer publication
function takes the established club-access advisory lock, share-locks live identity/grant/club and
locks the exact club's training; authority is rechecked after waiting. The first publication is audited.
Existing examples are idempotent and retain their original immutable publisher, including unknown
legacy attribution. Training IDs, owning club, creator and ordinary permissions are preserved.

The classification trigger remains protective for ordinary INSERT/UPDATE operations. Its invoker
context distinguishes ordinary application SQL from the table-owner context of the protected
publication function; a caller cannot promote by forging the transaction marker, even with a current
platform grant. The marker, exact tenant and live authority must also match. Future migrations must
keep the protected function and table under their common trusted owner.

Only the selecting administrator's existing/future annotations become public through ADR-0030's
unchanged narrow example projection. Other authors' feedback, recipient metadata and source layers
remain excluded. Existing automatic publication of new global-admin trainings is retained.
All API operations use tenant repositories; both endpoints are private/no-store and mutations require
normal CSRF/session protection. Club administrators/coaches/rowers receive no management capability.

## Consequences

Publication is a deliberate audience expansion of the original live training, not a copy or ownership
transfer. The original creator can continue ordinary permitted edits, whose video/crew/analysis
changes are visible in the example. Publishing does not expose that creator's private annotations.
There is no unpublish or publisher reassignment in this scope. Archiving still hides club examples.
No dependency, provider, external processing, production configuration or automatic rollout is added.
The migration is compatible with earlier images: publication persists and earlier example viewers
use their existing safe projection.

## Amendment — publication from the training page (2026-11-17)

The Help picker is removed. A RowLens administrator publishes the training they are viewing with
"Publiceren als voorbeeld" and the same inline confirmation; the endpoint and every rule above are
unchanged. The candidates search endpoint is no longer used by the client.
