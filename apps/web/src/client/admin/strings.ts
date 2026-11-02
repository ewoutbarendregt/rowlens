import { lang } from '../sessions/strings.ts';

// Admin strings in NL and EN (move into the i18n catalogs with #34).
const en = {
  admin: 'Admin',
  access: 'Access',
  intro: 'Who may sign in to RowLens, and as what. People get an e-mail and sign in with a code.',
  home: 'Home',
  admit: 'Give access',
  email: 'E-mail address',
  role: 'Role',
  roles: { rower: 'Rower', coach: 'Coach', admin: 'Admin' },
  admitted: (email: string) => `${email} has access and got an e-mail.`,
  admittedNoMail: (email: string) =>
    `${email} has access, but the e-mail could not be sent. Let them know yourself.`,
  exists: 'This address already has access.',
  serverManaged: 'This address is set on the server and always has admin access.',
  failed: 'That didn’t work. Check your connection and try again.',
  loadFailed: 'Could not load the access list. Check your connection and reload.',
  people: 'People with access',
  server: 'Set on the server',
  notYet: 'Not signed in yet',
  lastSeen: (when: string) => `Last active ${when}`,
  changeRole: (email: string) => `Role of ${email}`,
  remove: 'Remove access',
  confirmRemove: (email: string) =>
    `Remove access for ${email}? They are signed out everywhere and can’t sign in again.`,
  removeYes: 'Yes, remove',
  self: 'You can’t change your own access.',
  lastAdmin: 'There must be at least one admin.',
};

const nl: typeof en = {
  admin: 'Beheer',
  access: 'Toegang',
  intro:
    'Wie mag inloggen in RowLens, en als wat. Mensen krijgen een e-mail en loggen in met een code.',
  home: 'Start',
  admit: 'Toegang geven',
  email: 'E-mailadres',
  role: 'Rol',
  roles: { rower: 'Roeier', coach: 'Coach', admin: 'Beheerder' },
  admitted: (email: string) => `${email} heeft toegang en kreeg een e-mail.`,
  admittedNoMail: (email: string) =>
    `${email} heeft toegang, maar de e-mail kon niet worden verstuurd. Laat het zelf even weten.`,
  exists: 'Dit adres heeft al toegang.',
  serverManaged: 'Dit adres staat op de server en is altijd beheerder.',
  failed: 'Dat lukte niet. Controleer je verbinding en probeer het opnieuw.',
  loadFailed: 'De toegangslijst kon niet worden geladen. Controleer je verbinding en herlaad.',
  people: 'Mensen met toegang',
  server: 'Ingesteld op de server',
  notYet: 'Nog niet ingelogd',
  lastSeen: (when: string) => `Laatst actief ${when}`,
  changeRole: (email: string) => `Rol van ${email}`,
  remove: 'Toegang intrekken',
  confirmRemove: (email: string) =>
    `Toegang van ${email} intrekken? Diegene wordt overal uitgelogd en kan niet meer inloggen.`,
  removeYes: 'Ja, intrekken',
  self: 'Je kunt je eigen toegang niet wijzigen.',
  lastAdmin: 'Er moet minstens één beheerder blijven.',
};

export type AdminStrings = typeof en;

export function adminStrings(): AdminStrings {
  return lang() === 'nl' ? nl : en;
}
