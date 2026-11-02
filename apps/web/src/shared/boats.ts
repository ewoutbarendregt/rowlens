/**
 * Boat classes for a session lineup (#103), shared by the API (validation, DB check) and the UI.
 * Seats are numbered from the bow: 1 = bow … `rowers` = stroke; seat 0 is the cox. Coastal classes
 * come first because the first club rows coastal.
 */
export const BOAT_CLASSES = {
  C1x: { rowers: 1, cox: false, coastal: true },
  C2x: { rowers: 2, cox: false, coastal: true },
  'C2x+': { rowers: 2, cox: true, coastal: true },
  'C4x+': { rowers: 4, cox: true, coastal: true },
  'C4+': { rowers: 4, cox: true, coastal: true },
  '1x': { rowers: 1, cox: false, coastal: false },
  '2x': { rowers: 2, cox: false, coastal: false },
  '2-': { rowers: 2, cox: false, coastal: false },
  '2+': { rowers: 2, cox: true, coastal: false },
  '4x': { rowers: 4, cox: false, coastal: false },
  '4-': { rowers: 4, cox: false, coastal: false },
  '4+': { rowers: 4, cox: true, coastal: false },
  '4x+': { rowers: 4, cox: true, coastal: false },
  '8+': { rowers: 8, cox: true, coastal: false },
} as const;

export type BoatClass = keyof typeof BOAT_CLASSES;

export const BOAT_CLASS_NAMES = Object.keys(BOAT_CLASSES) as [BoatClass, ...BoatClass[]];

export const COX_SEAT = 0;

/** The seats of a boat in display order: bow first, stroke, then the cox. */
export function seatsOf(boat: BoatClass): number[] {
  const { rowers, cox } = BOAT_CLASSES[boat];
  const seats = Array.from({ length: rowers }, (_, i) => i + 1);
  return cox ? [...seats, COX_SEAT] : seats;
}

export type SeatRole = 'single' | 'bow' | 'stroke' | 'middle' | 'cox';

/** What a seat is called: a single sculler has one seat; otherwise seat 1 is bow, the last is stroke. */
export function seatRole(boat: BoatClass, seat: number): SeatRole {
  const { rowers } = BOAT_CLASSES[boat];
  if (seat === COX_SEAT) return 'cox';
  if (rowers === 1) return 'single';
  if (seat === 1) return 'bow';
  if (seat === rowers) return 'stroke';
  return 'middle';
}
