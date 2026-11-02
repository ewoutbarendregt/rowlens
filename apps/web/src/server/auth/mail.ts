import nodemailer from 'nodemailer';

export interface LoginMail {
  email: string;
  code: string;
  locale: 'nl' | 'en';
  loginUrl: string;
}

export type DeliverLoginCode = (mail: LoginMail) => Promise<void>;

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
