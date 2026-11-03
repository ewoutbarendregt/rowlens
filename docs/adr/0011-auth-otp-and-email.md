# ADR-0011: E-mail OTP authentication, invitations and e-mail delivery

- **Status**: accepted (one-club authentication implemented; invitations deferred)
- **Date**: 2026-11-01

## Context

Passwordless login by e-mail + one-time code, invitation of rowers by coaches, rate limiting, e-mail
notifications with opt-out, NL/EN. AudioScribe and trustable.nl already use OTP + Resend with
`…@trustable.nl` senders.

## Decision

- **Request code**: `POST /api/auth/otp` with e-mail. Always responds 202 with the same body (no account
  enumeration — unlike AudioScribe's accepted trade-off). During the one-club phase the operator-managed
  allowlist provisions that address in the pilot club and sends a 6-digit code.
- **Code**: CSPRNG, stored as HMAC-SHA256 (server pepper), TTL **10 min**, single use, max **5 attempts**
  then invalidated. Rate limits: 3 codes / 15 min per e-mail, 10 / hour per IP, verify 10 / 15 min per IP;
  stored in Postgres (no Redis).
- **Session**: random 256-bit token, hashed in DB, cookie `__Secure-rowlens_sid` (HttpOnly, Secure,
  SameSite=Lax, Path=`BASE_PATH`), 30-day sliding expiry, revocable list in account settings.
- **CSRF**: double-submit token header on unsafe methods + `Origin`/`Sec-Fetch-Site` check.
- **Invitations (later)**: after the one-club product is complete, a coach can invite e-mails to club +
  crew + role; token link (7 days, single use) lands on the OTP flow; accepting creates membership.
  Audited. This is not part of the current allowlist implementation.
- **Self-signup**: off in M1 (invitation only). Club self-onboarding is M3.
- **E-mail**: nodemailer → Resend SMTP. Sender **`RowLens <rowlens@trustable.nl>`** through the existing
  Resend account (confirmed 2026-11-01). Localised HTML + text login templates and an absolute link to
  the base-path login page. Notification templates, preferences and unsubscribe are added with
  notifications rather than the login implementation.
- Dev: codes printed to logs when SMTP is unset (AudioScribe convention), never in prod (startup check).

## Consequences

- No passwords to store or reset. Inbox access = account access; sessions are revocable.
- E-mail deliverability matters: SPF/DKIM/DMARC for the sender domain must be verified in Resend.

## Addendum 2026-11-02: in-app access list and roles (#42)

Admins now admit people in the app (Admin → Access) with a role (rower, coach, admin) instead of
the operator editing `AUTH_ALLOWED_EMAILS`. The first admins come from the server setting
`AUTH_ADMIN_EMAILS`: always admin and not editable in the app, so a club can't lock itself out and no
personal e-mail address has to live in the repository. `AUTH_ALLOWED_EMAILS` keeps working (as coach).
Removing someone deletes their membership, which ends their sessions. Invitation token links remain
later work.

## Addendum (2026-11-03): the member's own profile

`app_user` holds the member's first and last name and default boat (migration 0016). The app role
still can't read or write `app_user`: `rowlens_my_profile()` and `rowlens_set_my_profile()` reach only
the row of `rowlens_user_id()`, the signed-in user, and setting the name also sets `display_name`, so
notes and "writing as" use it. `rowlens_club_members()` now returns names too, so a session shows who
made it. Until both names are set, the app asks for them before anything else.

