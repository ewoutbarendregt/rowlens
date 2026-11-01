// Pilot gate strings in NL and EN (moves into the i18n catalogs with #34).
const en = {
  title: 'Pilot access',
  intro: 'RowLens is in a pilot with one club. Enter the access code you got from your coach.',
  codeLabel: 'Access code',
  submit: 'Continue',
  checking: 'Checking…',
  invalid: 'That code is not right. Check it and try again.',
  tooMany: 'Too many attempts. Wait a minute and try again.',
  failed: 'Something went wrong. Try again in a moment.',
  closed: 'RowLens is not open yet.',
  noticeTitle: 'Before you start',
  notice: [
    'This is a test version. The videos you upload are real footage of real people.',
    'Videos are not backed up during the pilot: if the server is lost, they are gone.',
    'Everyone with the code can watch, upload and delete every video. Share it only within the club.',
  ],
  signedIn: 'You have access for 30 days on this device.',
  comingNext: 'Uploading and viewing your own videos comes next.',
  logout: 'Sign out',
};

const nl: typeof en = {
  title: 'Toegang tot de pilot',
  intro:
    'RowLens draait als pilot bij één club. Vul de toegangscode in die je van je coach hebt gekregen.',
  codeLabel: 'Toegangscode',
  submit: 'Verder',
  checking: 'Controleren…',
  invalid: 'Die code klopt niet. Controleer hem en probeer het opnieuw.',
  tooMany: 'Te veel pogingen. Wacht een minuut en probeer het opnieuw.',
  failed: 'Er ging iets mis. Probeer het zo nog eens.',
  closed: 'RowLens is nog niet open.',
  noticeTitle: 'Voordat je begint',
  notice: [
    'Dit is een testversie. De video’s die je uploadt zijn echte beelden van echte mensen.',
    'Tijdens de pilot wordt er geen back-up van video’s gemaakt: gaat de server verloren, dan zijn ze weg.',
    'Iedereen met de code kan alle video’s bekijken, uploaden en verwijderen. Deel hem alleen binnen de club.',
  ],
  signedIn: 'Je hebt 30 dagen toegang op dit apparaat.',
  comingNext: 'Video’s uploaden en bekijken komt hierna.',
  logout: 'Afmelden',
};

export type PilotStrings = typeof en;

export function pilotStrings(language: string = navigator.language): PilotStrings {
  return language.toLowerCase().startsWith('nl') ? nl : en;
}
