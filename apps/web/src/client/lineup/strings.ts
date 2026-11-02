import type { SeatRole } from '../../shared/boats.ts';
import { lang } from '../i18n/language.ts';

// Lineup strings in NL and EN (move into the i18n catalogs with #34).
const en = {
  lineup: 'Lineup',
  boat: 'Boat',
  chooseBoat: 'Choose a boat',
  coastal: 'Coastal',
  flatWater: 'Flat water',
  copyFrom: 'Copy from an earlier session',
  copyNone: 'No earlier lineups yet.',
  save: 'Save lineup',
  cancel: 'Cancel',
  saved: 'Lineup saved.',
  empty: 'No lineup yet: choose the boat, then who sat where.',
  failed: 'The lineup could not be saved. Check your connection and try again.',
  archivedRower: 'An archived rower can’t be put in a seat. Restore them on the Rowers page first.',
  seat: (role: SeatRole, seat: number) =>
    ({
      single: 'Rower',
      bow: `Bow (${String(seat)})`,
      stroke: `Stroke (${String(seat)})`,
      middle: String(seat),
      cox: 'Cox',
    })[role],
  seatLabel: (role: SeatRole, seat: number) =>
    role === 'middle' ? `Seat ${String(seat)}` : en.seat(role, seat),
  archived: 'archived',
};

const nl: typeof en = {
  lineup: 'Opstelling',
  boat: 'Boot',
  chooseBoat: 'Kies een boot',
  coastal: 'Coastal',
  flatWater: 'Vlakwater',
  copyFrom: 'Kopieer van een eerdere training',
  copyNone: 'Nog geen eerdere opstellingen.',
  save: 'Opstelling opslaan',
  cancel: 'Annuleren',
  saved: 'Opstelling opgeslagen.',
  empty: 'Nog geen opstelling: kies de boot en daarna wie waar zat.',
  failed:
    'De opstelling kon niet worden opgeslagen. Controleer je verbinding en probeer het opnieuw.',
  archivedRower:
    'Een gearchiveerde roeier kan niet in een plek worden gezet. Zet die eerst terug op de Roeiers-pagina.',
  seat: (role: SeatRole, seat: number) =>
    ({
      single: 'Roeier',
      bow: `Boeg (${String(seat)})`,
      stroke: `Slag (${String(seat)})`,
      middle: String(seat),
      cox: 'Stuur',
    })[role],
  seatLabel: (role: SeatRole, seat: number) =>
    role === 'middle' ? `Plek ${String(seat)}` : nl.seat(role, seat),
  archived: 'gearchiveerd',
};

export type LineupStrings = typeof en;

export function lineupStrings(): LineupStrings {
  return lang() === 'nl' ? nl : en;
}
