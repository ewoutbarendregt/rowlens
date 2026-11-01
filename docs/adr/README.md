# Architecture Decision Records

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | accepted |
| [0002](0002-hosting-and-isolation.md) | Hosting on trustable-prod as an isolated Compose project | proposed |
| [0003](0003-base-path.md) | Serve under `/projects/rowlens` without prefix stripping | proposed (origin accepted) |
| [0004](0004-application-stack.md) | Application stack | proposed |
| [0005](0005-tenancy-and-authorization.md) | Tenancy and authorization in the data-access layer | proposed |
| [0006](0006-object-storage-and-backups.md) | Object storage, disk safety and backups | accepted |
| [0007](0007-upload-transcode-playback.md) | Upload, transcoding and frame-accurate playback | proposed |
| [0008](0008-job-queue.md) | Postgres-backed job queue shared by Node and Python | proposed |
| [0009](0009-analysis-pipeline.md) | Analysis pipeline outline | proposed |
| [0010](0010-llm-provider-abstraction.md) | LLM provider abstraction and data minimisation | proposed (provider deferred to M2) |
| [0011](0011-auth-otp-and-email.md) | E-mail OTP authentication, invitations, e-mail delivery | proposed |

New ADR: copy `0000-template.md` to the next number.
