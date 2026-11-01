# ADR-0001: Record architecture decisions

- **Status**: accepted
- **Date**: 2026-11-01

## Context

RowLens is built largely by AI agents under human review. Decisions made in chat are lost; agents need
durable context to stay consistent across sessions.

## Decision

Every significant choice (stack, storage, security model, analysis method, provider) gets an ADR in
`docs/adr/NNNN-kebab-title.md`, using `0000-template.md`. ADRs are immutable once accepted; a change of
mind is a new ADR that supersedes the old one. PRs that implement or contradict an ADR link it.

## Consequences

`CLAUDE.md` stays short and points here. Reviewers can reject a PR for deviating from an accepted ADR.
