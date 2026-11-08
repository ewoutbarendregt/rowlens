# BUG-056: registration mail rejected by Microsoft

Status: owner applied DNS repair; authoritative/public checks pass, awaiting fresh mail receipt.

## Provider delivery confirmed after repair — 2026-11-08

Read-only provider metadata now reports the latest registration message (08:32:25 UTC) as
**delivered**, whereas the three older attempts remain bounced. This supports restoration of
delivery after the owner's DNS changes; it is not a claim of direct inbox placement or a new
administrator-notification test. No message was sent for this check. Keep direct owner receipt
confirmation distinct from provider status.

## DNS repair verified — 2026-11-08

Ewout added the two TXT records himself and confirmed "toegevoegd". Both exact values now resolve
from all three authoritative servers (ns3/ns4.firstfind.nl, ns5.firstfind.net) and public resolvers
1.1.1.1/8.8.8.8: **10/10 checks pass**. Next: owner requests one fresh code through Account aanmaken;
inspect the resulting Resend delivery status and confirm actual receipt. Existing bounced codes
are not evidence of post-repair failure. No test message was sent by the agent; BUG-056 remains
in progress until receipt is confirmed. No application deployment/restart is required.

## Evidence (2026-11-08, read-only)

Production logs include a registration OTP request with HTTP 202 and no SMTP exception.
One recent registration proof exists; the email and IP limit buckets have one hit each, below
configured defaults (3 per email / 15 minutes and 10 per IP / hour). No secret, address or code
is included in this report.

The existing Resend credential was used inside the running RowLens container for read-only
GET requests. Three recent registration messages are **bounced**, while several ordinary login
messages are **delivered**. Microsoft returns **550 5.7.1**, diagnostic **AS9031519**:
message lacks SPF/DKIM/DMARC authentication records. This identifies an authentication/delivery
failure, not a failure to create or submit the registration code. It does not establish that
all new accounts or all receiving providers are affected.

Live DNS, including authoritative ns3.firstfind.nl and public resolvers 1.1.1.1/8.8.8.8:

- `send.trustable.nl` TXT: absent. Resend's configured SPF record is
  `v=spf1 include:amazonses.com ~all`; its matching MX already exists.
- `_dmarc.trustable.nl` TXT: absent.
- `resend._domainkey.trustable.nl` TXT: present, matching the configured public DKIM key.
- Resend still labels the domain/records verified; that cached status does not override live DNS.

Do not claim DKIM is missing: a public key exists, but successful message-level verification
requires a delivered message's headers. The provider API reports bounces after SMTP acceptance,
so absence of an application SMTP error does not prove delivery.

## Exact proposed shared-DNS change

Add these **two** records to the existing trustable.nl DNS zone:

| Type | Relative name | Value | TTL |
|---|---|---|---|
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Provider default |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | Provider default |

The DMARC policy starts in monitoring mode. It does not request rejection/quarantine or invent
a report mailbox. Preserve existing root SPF, mail/MX records, DKIM, websites and server settings.
No application release, database migration, key rotation or server restart is needed for this
DNS proposal. Shared DNS requires explicit approval per AGENTS.md; no DNS connector is available
in this session, so use owner-entered records or an owner-opened authenticated DNS control page.

## Acceptance checks after the approved change

1. Both authoritative and public DNS resolve exactly one intended SPF/DMARC record at these names.
   Allow for cached negative answers and propagation; do not repeatedly send mail while waiting.
2. Resend domain validation agrees with live records; inspect bounce/suppression status before
   retrying. Do not remove suppressions without reviewing the specific reason.
3. Owner requests one fresh registration code through Account aanmaken after propagation.
   Check that provider status becomes delivered and owner confirms receipt/use. A provider
   delivered status alone does not guarantee inbox placement. Do not consume or expose their code.
4. Where available, inspect recipient message authentication headers for SPF/DKIM/DMARC passing;
   test existing login too. Keep the issue open until registration receipt is confirmed.

No test email, account mutation or registration verification was performed during diagnosis.
A future proposal for asynchronous delivery feedback requires its own scoped design; do not
introduce a webhook/table/processor merely to resolve this DNS incident.

## Primary sources

- [Resend missing login-code guidance](https://resend.com/guides/email/users-never-got-login-code)
- [Resend DMARC guidance](https://resend.com/docs/dashboard/domains/dmarc)
- [AWS SES custom MAIL FROM SPF records](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
