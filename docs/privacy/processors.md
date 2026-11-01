# Processors and data flows (AVG/GDPR)

Draft — completed before the first club goes live. Every new external service is added here **before**
it receives data, and linked from the privacy statement.

| Processor | Purpose | Data | Location | Status |
|---|---|---|---|---|
| Hetzner Online GmbH | Server hosting (trustable-prod), backups | all application data | Germany (nbg1) | in use (shared server) |
| Hetzner Object Storage *or* Volume | Video storage (ADR-0006) | videos, analysis artefacts | Germany/Finland | to decide |
| Resend | Transactional e-mail (OTP, notifications) | e-mail address, display name, notification text | to verify (EU region?) | proposed |
| GitHub (GHCR, Actions) | Source code, container images | no user data | US | in use |
| Error tracking (Sentry EU / GlitchTip) | Exceptions | pseudonymous ids, no video, no e-mail | EU | to decide |
| LLM provider | Plain-language explanations (opt-in per club) | pseudonymous structured metrics only | EU required | to decide (ADR-0010) |
