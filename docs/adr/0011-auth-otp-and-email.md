# ADR-0011: E-mail OTP authentication, invitations and e-mail delivery

- **Status**: proposed
- **Date**: 2026-11-01

## Context

Passwordless login by e-mail + one-time code, invitation of rowers by coaches, rate limiting, e-mail
notifications with opt-out, NL/EN. AudioScribe and trustable.nl already use OTP + Resend with
`…@trustable.nl` senders.

## Decision

- **Request code**: `POST /api/auth/otp` with e-mail. Always responds 202 with the same body (no account
  enumeration — unlike AudioScribe's accepted trade-off). If the e-mail belongs to a user or has a pending
  invitation, a 6-digit code + magic link are sent.
- **Code**: CSPRNG, stored as HMAC-SHA256 (server pepper), TTL **10 min**, single use, max **5 attempts**
  then invalidated. Rate limits: 3 codes / 15 min per e-mail, 10 / hour per IP, verify 10 / 15 min per IP;
  stored in Postgres (no Redis).
- **Session**: random 256-bit token, hashed in DB, cookie `__Secure-rowlens_sid` (HttpOnly, Secure,
  SameSite=Lax, Path=`BASE_PATH`), 30-day sliding expiry, revocable list in account settings.
- **CSRF**: double-submit token header on unsafe methods + `Origin`/`Sec-Fetch-Site` check.
- **Invitations**: coach invites e-mails to club + crew + role; token link (7 days, single use) lands on the
  OTP flow; accepting creates membership. Audited.
- **Self-signup**: off in M1 (invitation only). Club self-onboarding is M3.
- **E-mail**: nodemailer → Resend SMTP. Sender **to confirm**, e.g. `RowLens <rowlens@trustable.nl>`.
  Localised templates (MJML or React Email → HTML + text), all links absolute via the base-path URL
  builder. Notification preferences per user (immediate / daily digest / off). Unsubscribe link (one-click).
- Dev: codes printed to logs when SMTP is unset (AudioScribe convention), never in prod (startup check).

## Consequences

- No passwords to store or reset. Inbox access = account access; sessions are revocable.
- E-mail deliverability matters: SPF/DKIM/DMARC for the sender domain must be verified in Resend.
