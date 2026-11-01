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

export function smtpDelivery(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}): DeliverLoginCode {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  return async (mail) => {
    const message = loginMessage(mail);
    await transport.sendMail({
      from: config.from,
      to: mail.email,
      ...message,
    });
  };
}
