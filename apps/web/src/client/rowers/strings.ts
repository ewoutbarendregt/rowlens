import { lang } from '../sessions/strings.ts';

// Roster strings in NL and EN (move into the i18n catalogs with #34).
const en = {
  rowers: 'Rowers',
  intro:
    'Everyone who rows or coxes in your club. People don’t need an account to be on this list.',
  home: 'Home',
  sessions: 'Sessions',
  search: 'Search',
  searchPlaceholder: 'Name',
  none: 'No rowers yet. Add the first one above or from a session lineup.',
  noMatch: 'Nobody with that name.',
  add: 'Add rower',
  name: 'Name',
  namePlaceholder: 'e.g. Jan de Vries',
  email: 'E-mail (optional)',
  emailHint: 'Only used later to link this person to their own login.',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  archive: 'Archive',
  restore: 'Restore',
  archived: 'Archived',
  showArchived: 'Show archived rowers',
  hideArchived: 'Hide archived rowers',
  archivedHint: 'Archived rowers stay in old lineups but can’t be picked for new ones.',
  merge: 'Merge…',
  mergeInto: (name: string) => `Merge “${name}” into`,
  mergeQuestion: (from: string, into: string) =>
    `Merge “${from}” into “${into}”? Everything of “${from}” moves to “${into}”. This cannot be undone.`,
  mergeYes: 'Yes, merge',
  similar: (name: string) => `“${name}” looks like someone already on the list:`,
  useExisting: (name: string) => `Use ${name}`,
  addAnyway: 'No, add a new rower',
  emailTaken: 'Another rower already has this e-mail address.',
  failed: 'That didn’t work. Check your connection and try again.',
  loadFailed: 'Could not load the rowers. Check your connection and reload.',
  // Picker
  pick: 'Choose a rower',
  clear: (name: string) => `Remove ${name}`,
  addNamed: (name: string) => `Add “${name}”`,
  typeToAdd: 'Search or add a name',
  inUse: 'already in this lineup',
};

const nl: typeof en = {
  rowers: 'Roeiers',
  intro:
    'Iedereen die bij je club roeit of stuurt. Een account is niet nodig om op deze lijst te staan.',
  home: 'Start',
  sessions: 'Trainingen',
  search: 'Zoeken',
  searchPlaceholder: 'Naam',
  none: 'Nog geen roeiers. Voeg de eerste hierboven toe of vanuit een opstelling.',
  noMatch: 'Niemand met die naam.',
  add: 'Roeier toevoegen',
  name: 'Naam',
  namePlaceholder: 'bijv. Jan de Vries',
  email: 'E-mail (optioneel)',
  emailHint: 'Alleen om deze persoon later aan een eigen login te koppelen.',
  save: 'Opslaan',
  cancel: 'Annuleren',
  edit: 'Bewerken',
  archive: 'Archiveren',
  restore: 'Terugzetten',
  archived: 'Gearchiveerd',
  showArchived: 'Gearchiveerde roeiers tonen',
  hideArchived: 'Gearchiveerde roeiers verbergen',
  archivedHint:
    'Gearchiveerde roeiers blijven in oude opstellingen staan, maar zijn niet meer te kiezen.',
  merge: 'Samenvoegen…',
  mergeInto: (name: string) => `“${name}” samenvoegen met`,
  mergeQuestion: (from: string, into: string) =>
    `“${from}” samenvoegen met “${into}”? Alles van “${from}” gaat naar “${into}”. Dit kan niet ongedaan worden gemaakt.`,
  mergeYes: 'Ja, samenvoegen',
  similar: (name: string) => `“${name}” lijkt op iemand die al op de lijst staat:`,
  useExisting: (name: string) => `${name} kiezen`,
  addAnyway: 'Nee, nieuwe roeier toevoegen',
  emailTaken: 'Een andere roeier heeft dit e-mailadres al.',
  failed: 'Dat lukte niet. Controleer je verbinding en probeer het opnieuw.',
  loadFailed: 'De roeiers konden niet worden geladen. Controleer je verbinding en herlaad.',
  pick: 'Kies een roeier',
  clear: (name: string) => `${name} weghalen`,
  addNamed: (name: string) => `“${name}” toevoegen`,
  typeToAdd: 'Zoek of voeg toe',
  inUse: 'staat al in deze opstelling',
};

export type RowerStrings = typeof en;

export function rowerStrings(): RowerStrings {
  return lang() === 'nl' ? nl : en;
}
