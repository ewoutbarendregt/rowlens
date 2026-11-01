# Processors and data flows (AVG/GDPR)

Draft — completed before the first club goes live. Every new external service is added here **before**
it receives data, and linked from the privacy statement.

| Processor | Purpose | Data | Location | Status |
|---|---|---|---|---|
| Hetzner Online GmbH | Server hosting (trustable-prod), backups | all application data | Germany (nbg1) | in use (shared server) |
| Resend | Transactional e-mail (OTP, notifications), sender rowlens@trustable.nl | e-mail address, display name, notification text | to verify (EU region?) | decided |
| GitHub (GHCR, Actions) | Source code, container images | no user data | US | in use |
| Error tracking | none, logs only on our own server (ADR-0004) | — | — | not used |
| LLM provider | Plain-language explanations (opt-in per club) | pseudonymous structured metrics only | EU required | deferred to M2 (ADR-0010) |

Videos are stored on the same Hetzner server (a directory on its local disk; the renditions people watch are stripped of location and device metadata) and are **not backed up** during the
pilot (ADR-0006). The privacy statement must say so.
