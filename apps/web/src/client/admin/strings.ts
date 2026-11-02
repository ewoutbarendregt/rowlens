import { lang } from '../i18n/language.ts';

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
  tabs: { users: 'Users', roles: 'Roles' },
  rolesIntro:
    'What each role sees and may do. The roles are fixed; give someone another role under Users.',
  can: 'Sees and may',
  rights: [
    {
      what: 'Sessions',
      admin: 'All of the club',
      coach: 'Made by them or rowed in',
      rower: 'Made by them or rowed in',
    },
    {
      what: 'Notes in those sessions',
      admin: 'All, and change them',
      coach: 'All, and change them',
      rower: 'Meant for or shared with them; change their own',
    },
    { what: 'Write and draw notes', admin: 'Yes', coach: 'Yes', rower: 'Yes' },
    {
      what: 'Share notes',
      admin: 'Yes, and take back any share',
      coach: 'Yes, and take back any share',
      rower: 'Yes, take back their own',
    },
    { what: 'Upload videos, lineups, roster', admin: 'Yes', coach: 'Yes', rower: 'Yes' },
    { what: 'Admin: users and roles', admin: 'Yes', coach: 'No', rower: 'No' },
    { what: 'Give a session to a coach', admin: 'Yes', coach: 'No', rower: 'No' },
  ],
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
  tabs: { users: 'Gebruikers', roles: 'Rollen' },
  rolesIntro:
    'Wat elke rol ziet en mag. De rollen liggen vast; geef iemand een andere rol onder Gebruikers.',
  can: 'Ziet en mag',
  rights: [
    {
      what: 'Trainingen',
      admin: 'Alle van de club',
      coach: 'Zelf aangemaakt of in meegeroeid',
      rower: 'Zelf aangemaakt of in meegeroeid',
    },
    {
      what: 'Notities in die trainingen',
      admin: 'Alle, en wijzigen',
      coach: 'Alle, en wijzigen',
      rower: 'Voor hem of met hem gedeeld; eigen wijzigen',
    },
    { what: 'Notities schrijven en tekenen', admin: 'Ja', coach: 'Ja', rower: 'Ja' },
    {
      what: 'Notities delen',
      admin: 'Ja, en elk delen intrekken',
      coach: 'Ja, en elk delen intrekken',
      rower: 'Ja, eigen delen intrekken',
    },
    { what: 'Video’s uploaden, opstellingen, ploeglijst', admin: 'Ja', coach: 'Ja', rower: 'Ja' },
    { what: 'Beheer: gebruikers en rollen', admin: 'Ja', coach: 'Nee', rower: 'Nee' },
    { what: 'Een training aan een coach geven', admin: 'Ja', coach: 'Nee', rower: 'Nee' },
  ],
};

export type AdminStrings = typeof en;

export function adminStrings(): AdminStrings {
  return lang() === 'nl' ? nl : en;
}
