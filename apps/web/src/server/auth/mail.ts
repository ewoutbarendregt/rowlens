import nodemailer from 'nodemailer';

export interface LoginMail {
  email: string;
  code: string;
  locale: 'nl' | 'en';
  loginUrl: string;
}

export type DeliverLoginCode = (mail: LoginMail) => Promise<void>;

/** "You have access to RowLens" (#42), sent when an admin admits an address. */
export interface InviteMail {
  email: string;
  clubName: string;
  loginUrl: string;
}

export type DeliverInvite = (mail: InviteMail) => Promise<void>;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/**
 * The invitation in Dutch and English in one mail: the admin doesn't know the person's language,
 * and RowLens learns it at their first login.
 */
export function inviteMessage({ clubName, loginUrl }: InviteMail): {
  subject: string;
  text: string;
  html: string;
} {
  const nl = `Je hebt toegang tot RowLens van ${clubName}. Log in met dit e-mailadres; je krijgt dan een code per mail.`;
  const en = `You now have access to RowLens for ${clubName}. Sign in with this e-mail address and we'll send you a code.`;
  return {
    subject: `Toegang tot RowLens / Access to RowLens (${clubName})`,
    text: `${nl}\n\n${en}\n\n${loginUrl}`,
    html: `<p>${escapeHtml(nl)}</p><p>${escapeHtml(en)}</p><p><a href="${escapeHtml(loginUrl)}">Open RowLens</a></p>`,
  };
}

export function loginMessage({ code, locale, loginUrl }: LoginMail): {
  subject: string;
  text: string;
  html: string;
} {
  const nl = locale === 'nl';
  const subject = nl ? 'Je RowLens-inlogcode' : 'Your RowLens login code';
  const intro = nl ? 'Je inlogcode is:' : 'Your login code is:';
  const expiry = nl
    ? 'De code is 10 minuten geldig en kan één keer worden gebruikt.'
    : 'The code is valid for 10 minutes and can be used once.';
  const link = nl ? 'Open RowLens' : 'Open RowLens';
  return {
    subject,
    text: `${intro} ${code}\n\n${expiry}\n\n${loginUrl}`,
    html: `<p>${intro}</p><p style="font-size:32px;font-weight:700;letter-spacing:0.2em">${code}</p><p>${expiry}</p><p><a href="${loginUrl}">${link}</a></p>`,
  };
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * Port 465 is TLS from the first byte; any other port (587 on trustable-prod, where outbound 465 is
 * blocked) must upgrade with STARTTLS before the API key is sent, or the connection fails. Short
 * timeouts make an unreachable server show up in the log within seconds instead of minutes.
 */
export function smtpTransportOptions(config: SmtpConfig) {
  const implicitTls = config.port === 465;
  return {
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  };
}

export function smtpDelivery(config: SmtpConfig): DeliverLoginCode {
  const transport = nodemailer.createTransport(smtpTransportOptions(config));
  return async (mail) => {
    const message = loginMessage(mail);
    await transport.sendMail({
      from: config.from,
      to: mail.email,
      ...message,
    });
  };
}

export function smtpInviteDelivery(config: SmtpConfig): DeliverInvite {
  const transport = nodemailer.createTransport(smtpTransportOptions(config));
  return async (mail) => {
    await transport.sendMail({ from: config.from, to: mail.email, ...inviteMessage(mail) });
  };
}
