# ADR-0027: Sequential numeric user-facing versions

- **Status**: accepted
- **Date**: 2026-11-10
- **Deciders**: Ewout (product owner), Codex (implementation)

## Context

Ewout explicitly requires the visible version to consist of numbers and increase sequentially.
The former package-version + SHA label was an implementation identifier, while root release-please
numbering remains at 0.0.0. A numeric sequence must advance automatically rather than relying on
manual package bumps or accepting the blocked release bot's proposals.

## Decision

The existing `images` workflow's `github.run_number` supplies the patch component. Major/minor
come from the root package version. With the current 0.0 base and completed image build 58, the
next build is 0.0.59, then 0.0.60. Both matrix jobs use the same workflow sequence. Reruns retain
that number; new main builds advance it. The pure release generator validates all inputs.

`APP_RELEASE` is passed to the web image build and validated by Vite. The client bundle, its
build-info.json and both images' OCI version labels carry the same numeric release. Login and the
signed-in header display only that release: no v prefix, hash or suffix. A local build without an
override displays the root package version (currently 0.0.0). Existing image SHA tags and readiness
version checks retain their diagnostic/deployment meaning; no deploy helper/server changes are
needed. Merges still only publish images, and every production deployment still needs approval.

## Consequences

Numbers identify builds; skipped/failed builds and builds never deployed can leave gaps between
production versions. A rollback correctly displays the older build's number. Preserve the `images`
workflow identity/counter; a future replacement must carry forward a higher sequence explicitly.
The fixed root version is a development fallback, not the production release counter. No new
permissions, dependencies, shared-server settings, tables or migrations are introduced.

## Alternatives considered

Manual per-PR bumps can be missed and conflict across parallel PRs. A deployment-time counter
requires new mutable release state/server changes and gives one image several version identities.
Retaining the SHA as the visible version does not meet the explicit numeric requirement.
