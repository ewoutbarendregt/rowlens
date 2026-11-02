import { lang } from '../i18n/language.ts';
const en = {
  title: 'Sign in to RowLens',
  intro: 'Enter the email address registered with your club. We will send you a six-digit code.',
  emailLabel: 'Email address',
  requestCode: 'Send code',
  sending: 'Sending…',
  codeTitle: 'Check your email',
  codeSent:
    'If this address has access, a six-digit code is on its way. It is valid for 10 minutes.',
  codeSentIf: 'If',
  codeSentRest: 'has access, a six-digit code is on its way. It is valid for 10 minutes.',
  thirtyDays: 'Signed in for 30 days on this device.',
  codeLabel: 'Login code',
  verify: 'Sign in',
  checking: 'Checking…',
  changeEmail: 'Use a different email address',
  invalid: 'That code is invalid or has expired. Check it and try again.',
  tooMany: 'Too many attempts. Wait a while and request a new code.',
  failed: 'Something went wrong. Try again in a moment.',
  closed: 'RowLens is not open yet.',
  noticeTitle: 'About this pilot',
  notice: [
    'This is a test version for one rowing club.',
    'Videos contain real people and are visible only to signed-in club members.',
    'Videos are not backed up during the pilot: if the server is lost, they are gone.',
  ],
  signedIn: 'Signed in for 30 days on this device as',
  openSessions: 'Sessions and videos',
  logoutOthers: 'Sign out other devices',
  othersDone: 'Other devices have been signed out.',
  logout: 'Sign out',
  account: 'Account and sign out',
};

const nl: typeof en = {
  title: 'Inloggen bij RowLens',
  intro:
    'Vul het e-mailadres in dat bij je club geregistreerd staat. We sturen je een zescijferige code.',
  emailLabel: 'E-mailadres',
  requestCode: 'Stuur code',
  sending: 'Versturen…',
  codeTitle: 'Controleer je e-mail',
  codeSent:
    'Als dit adres toegang heeft, is er een zescijferige code onderweg. Die is 10 minuten geldig.',
  codeSentIf: 'Als',
  codeSentRest: 'toegang heeft, is er een zescijferige code onderweg. Die is 10 minuten geldig.',
  thirtyDays: 'Je blijft 30 dagen ingelogd op dit apparaat.',
  codeLabel: 'Inlogcode',
  verify: 'Inloggen',
  checking: 'Controleren…',
  changeEmail: 'Een ander e-mailadres gebruiken',
  invalid: 'Die code is ongeldig of verlopen. Controleer hem en probeer het opnieuw.',
  tooMany: 'Te veel pogingen. Wacht even en vraag een nieuwe code aan.',
  failed: 'Er ging iets mis. Probeer het zo nog eens.',
  closed: 'RowLens is nog niet open.',
  noticeTitle: 'Over deze pilot',
  notice: [
    'Dit is een testversie voor één roeiclub.',
    'Video’s bevatten echte mensen en zijn alleen zichtbaar voor ingelogde clubleden.',
    'Tijdens de pilot worden video’s niet geback-upt: gaat de server verloren, dan zijn ze weg.',
  ],
  signedIn: 'Je bent op dit apparaat 30 dagen ingelogd als',
  openSessions: 'Trainingen en video’s',
  logoutOthers: 'Andere apparaten afmelden',
  othersDone: 'De andere apparaten zijn afgemeld.',
  logout: 'Afmelden',
  account: 'Account en afmelden',
};

export type AuthStrings = typeof en;

export function authStrings(language: string = lang()): AuthStrings {
  return language.toLowerCase().startsWith('nl') ? nl : en;
}
