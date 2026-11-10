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
| [0011](0011-auth-otp-and-email.md) | E-mail OTP authentication, invitations, e-mail delivery | accepted (auth; invitations deferred) |
| [0012](0012-ui-design-tokens.md) | UI style from the Nouryon Design System, without its brand | superseded by 0014 |
| [0013](0013-role-visibility.md) | What a rower sees, enforced by the database | accepted |
| [0014](0014-classical-design-system.md) | Classical design system, self-hosted, with derived dark and high-contrast modes | accepted |
| [0015](0015-interface-language.md) | Dutch by default, with a language switch | accepted |
| [0016](0016-stroke-marks.md) | Stroke marks by the coach, for the whole boat | accepted |
| [0017](0017-angles-per-phase.md) | Angles per rower and phase, measured by the coach | accepted |
| [0018](0018-boat-line-per-frame.md) | The boat line found in every frame, the coach's line wins | accepted |
| [0019](0019-user-settings-and-role-sets.md) | Central account preferences, additive role sets and admin editing | accepted |

| [0020](0020-club-training-permissions.md) | Club-wide training reading with ownership and staff editing | accepted |

| [0021](0021-unified-accounts-and-club-admission.md) | Unified accounts, club admission and full platform administration | accepted |

| [0022](0022-club-archiving.md) | Reversible club archiving and separate administration screens | accepted |

| [0023](0023-user-directory-and-identity-management.md) | Scoped user table, verified identity changes and global role management | accepted |

| [0024](0024-explicit-registration-and-club-choice.md) | Explicit verified registration with optional club choice and scoped review | accepted |

New ADR: copy `0000-template.md` to the next number.

| [0025](0025-initial-admission-notifications-and-training-overview.md) | Initial admission notifications, explicit clubless review and multi-club training overview | accepted |

| [0026](0026-independent-training-video-reuse.md) | Shared recordings, independent training feedback and read-only source references | accepted |

| [0027](0027-sequential-numeric-versions.md) | Sequential numeric user-facing build versions | accepted |
