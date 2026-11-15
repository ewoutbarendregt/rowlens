# ADR-0029: Explicit read-only training sharing within a club

- **Status**: accepted (Ewout: "ja", 2026-11-15)
- **Date**: 2026-11-15
- **Related**: ADR-0005, ADR-0013, ADR-0019–0021, ADR-0026, ADR-0028

## Context

Ewout wants rowers and coaches to share whole trainings with all club members or selected members.
He approved `docs/plans/training-sharing.md` with "ja". Feedback-frame sharing is a separate
permission and cannot substitute for training access. ADR-0028's creator/participant-only ordinary
read rule needs an explicit same-club sharing exception without granting editing or leaking notes.

## Decision

Migration 0030 adds `session_share`, `session_share_event` and a parent `sharing_revision`.
A grant has club/member scope; partial unique indexes allow one club-wide grant plus one per
recipient. Composite parent keys and a nullable composite membership key enforce the same club.
Deleting a membership cascades individual grants; rejoining does not revive them. Club-wide sharing
includes future approved members. Pending applicants, foreign accounts and archived clubs gain
no access. Existing creator/crew/staff rights remain independently effective after revocation.

Only a currently authorized creator or club staff member may manage sharing; platform actors retain
persisted selected-club authority. `rowlens_can_manage_session_sharing` reuses the live actor check
from ADR-0026 plus resource edit authority. A rower recipient or participant gains no ability to
forward, edit, upload or delete. All seven additive role sets retain their intended capabilities.

`rowlens_set_session_sharing` is a pinned protected operation inside a scoped repository/tenant
transaction. It serializes on the existing club-access advisory lock, locks actor identity,
current actor/recipient memberships and platform authority, then locks the parent. It rechecks
current authority after waiting, validates recipients and rejects stale revisions before writes.
Only grant differences are inserted/deleted. An AFTER INSERT/DELETE trigger atomically records the
actual actor/scope/recipient/action and increments the parent revision, including membership
cascades. System/owner cascades without an account context record a null actor rather than invent
attribution. Audit UUIDs survive grant, membership and training deletion; no names/emails/media are
stored in the event. Direct app-role grant/audit mutations are denied; events cannot be updated
or deleted. Reads are limited to sharing managers (or current club administrators for history).

`rowlens_session_shared` requires a current membership in the active selected club and a matching
explicit/club-wide grant. It contributes only to ordinary session SELECT authority, inherited by
child/video/media policies. It is disabled for example scope and older missing-capability images;
sharing cannot reactivate older visibility-implies-mutation handlers. The existing owner/staff
write helpers remain unchanged. Media continues private/no-store authorization per logical entry.

Training access does not change private feedback visibility. Authored/assigned/shared notes remain
subject to their own policy; a note share alone still cannot open a training. Reusing a recording
requires current source/target rights under ADR-0026. Withdrawing source access hides source feedback
references, while an already authorized independent training entry keeps its existing media rights.

The bounded recipient endpoint is available only to managers of that exact training. It searches
current club account names across all roles and returns IDs/names only (20 results plus a more flag),
never emails or a global directory. Whole-training recipients see a read-only page and a Shared with
you label, separate from actual creator/participation/notes filters. Primary club selection is unchanged.

A collapsed Sharing card below the training facts names the current club, shows the saved audience,
and supports club-wide and individual choices, explicit save, conflict reload and inline revocation.
NL/EN instructions explain independent rights and feedback privacy. Global RowLens examples retain
their separate all-signed-in audience, even when ordinary club sharing is withdrawn. Their example
viewer cannot manage grants. No email, notification, anonymous link, provider or dependency is added.

## Consequences

ADR-0028's ordinary visibility becomes creator OR actual participant OR current same-club sharing,
plus existing staff rights. Sharing remains an explicit exception, not a new role or membership.
The migration is additive and starts with no grants/revision zero. A prior safe image may not expose
the new UI but cannot turn a read grant into a mutation capability. Older missing-capability images
do not activate sharing reads. Root/child RLS, live-role changes, stale/concurrent saves, parent
ownership transfer, membership cascades and audit retention have database/API regressions.

The new browser suite uses synthetic data at 1000x540/1440x900 and iPhone13 WebKit, checks real video
decode/private feedback boundaries and measures touch/overflow. CI runs it after the existing
visibility/unified suites. Local review stays on the copied development stack; production requires
an explicit owner merge/deploy instruction.
