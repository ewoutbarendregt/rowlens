import { lang } from '../i18n/language.ts';
const en = {
  club: 'Club',
  sharing: 'Share training',
  sharedWithMe: 'Shared with you',
  none: 'No additional sharing',
  all: 'All club members',
  selected: (n: number) => (n === 1 ? 'Shared with 1 member' : `Shared with ${String(n)} members`),
  intro:
    'Give members of this club viewing access to this training, its videos, crew and measurements. Private feedback keeps its own permissions.',
  clubHint:
    'Includes members admitted to this club later. People from other clubs do not get access.',
  members: 'Individual members',
  search: 'Search club members by name',
  searchHint: 'Enter at least two characters. All club roles can be selected.',
  noMatches: 'No matching members.',
  more: 'More matches are available. Refine the name to find the right member.',
  unknown: 'Member without a name',
  add: (name: string) => `Add ${name}`,
  remove: (name: string) => `Remove ${name}`,
  save: 'Save sharing',
  saved: 'Sharing saved.',
  loading: 'Loading sharing…',
  failed: 'Could not load or save sharing. Try again.',
  searchFailed: 'Could not find members. Try the search again.',
  conflict: 'Sharing changed elsewhere. Reload before saving again.',
  invalid:
    'A selected account is no longer a member of this club. Reload and select the recipients again.',
  reload: 'Reload sharing',
  confirmStop: 'Yes, stop sharing',
  stop: 'Stop sharing',
  stopQuestion:
    'Withdraw all additional viewing access? The creator, crew and staff keep their existing access.',
  accessRemains:
    'The creator, participants and staff keep their existing rights. When All club members is selected, unselected members can also view the training. Sharing does not give editing or forwarding rights.',
  exampleAudience:
    'This is also a RowLens example. All signed-in users can still view the example when club sharing is withdrawn.',
};
const nl: typeof en = {
  club: 'Club',
  sharing: 'Training delen',
  sharedWithMe: 'Met jou gedeeld',
  none: 'Niet extra gedeeld',
  all: 'Alle clubleden',
  selected: (n: number) => (n === 1 ? 'Gedeeld met 1 lid' : `Gedeeld met ${String(n)} leden`),
  intro:
    'Geef leden van deze club kijkrechten op de training, video’s, opstelling en metingen. Privéfeedback houdt zijn eigen rechten.',
  clubHint:
    'Geldt ook voor leden die later tot deze club worden toegelaten. Mensen van andere clubs krijgen geen toegang.',
  members: 'Individuele leden',
  search: 'Zoek clubleden op naam',
  searchHint: 'Vul minstens twee tekens in. Je kunt leden met elke clubrol kiezen.',
  noMatches: 'Geen passende leden gevonden.',
  more: 'Er zijn meer resultaten. Maak de naam specifieker om het juiste lid te vinden.',
  unknown: 'Lid zonder naam',
  add: (name: string) => `${name} toevoegen`,
  remove: (name: string) => `${name} verwijderen`,
  save: 'Delen opslaan',
  saved: 'Delen opgeslagen.',
  loading: 'Delen laden…',
  failed: 'Delen kon niet worden geladen of opgeslagen. Probeer opnieuw.',
  searchFailed: 'Leden zoeken is mislukt. Probeer de zoekopdracht opnieuw.',
  conflict: 'Het delen is elders gewijzigd. Herlaad voordat je opnieuw opslaat.',
  invalid:
    'Een gekozen account is geen lid meer van deze club. Herlaad en kies de ontvangers opnieuw.',
  reload: 'Delen herladen',
  confirmStop: 'Ja, delen stoppen',
  stop: 'Delen stoppen',
  stopQuestion:
    'Alle extra kijkrechten intrekken? De maker, ploeg en medewerkers houden hun bestaande toegang.',
  accessRemains:
    'De maker, deelnemers, coaches en beheerders houden hun bestaande rechten. Als Alle clubleden aanstaat, kunnen ook niet-afzonderlijk gekozen leden de training bekijken. Delen geeft geen bewerkrechten of toestemming om verder te delen.',
  exampleAudience:
    'Dit is ook een RowLens-voorbeeld. Iedereen die is ingelogd kan het voorbeeld blijven bekijken als je het delen binnen de club stopt.',
};
export const sharingStrings = () => (lang() === 'nl' ? nl : en);
