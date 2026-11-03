import { type BoatClass, seatRole, type SeatRole } from '../../shared/boats.ts';

/** Who a note is for, as the API returns it per frame (#105). */
export interface MomentRowers {
  frame: number;
  rowers: { id: string; displayName: string; archived: boolean }[];
}

/** Who a note is shared with (#112), as the API returns it per frame. */
export interface MomentShares {
  frame: number;
  crew: { sharedBy: string | null; canUnshare: boolean } | null;
  rowers: {
    id: string;
    displayName: string;
    archived: boolean;
    sharedBy: string | null;
    canUnshare: boolean;
  }[];
}

export interface LineupSeatLike {
  seat: number;
  rower: { id: string; displayName: string; archived: boolean };
}

/** The session's lineup as picker suggestions, bow to stroke then cox, with each rower's seat. */
export function lineupSuggestions(
  boatType: BoatClass | null,
  lineup: readonly LineupSeatLike[],
  seatName: (role: SeatRole, seat: number) => string,
): { id: string; label: string; name: string }[] {
  if (boatType === null) return [];
  return lineup
    .filter((s) => !s.rower.archived)
    .map((s) => ({
      id: s.rower.id,
      label: seatName(seatRole(boatType, s.seat), s.seat),
      name: s.rower.displayName,
    }));
}

/** One rower on or off a note's "For" list (a chip per seat, mockup 1e). */
export function toggleRower(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * "Whole crew" as a switch: on adds every crew member still missing; when the whole crew is already
 * on, it takes the crew off again and keeps anyone from outside the lineup.
 */
export function toggleCrew(ids: readonly string[], crew: readonly string[]): string[] {
  if (crew.length > 0 && crew.every((id) => ids.includes(id))) {
    return ids.filter((id) => !crew.includes(id));
  }
  return [...ids, ...crew.filter((id) => !ids.includes(id))];
}

/** The frames whose note is for `rowerId`; every frame when no rower is chosen. */
export function framesFor(
  moments: readonly MomentRowers[],
  rowerId: string | null,
): ReadonlySet<number> | null {
  if (rowerId === null) return null;
  return new Set(moments.filter((m) => m.rowers.some((r) => r.id === rowerId)).map((m) => m.frame));
}

/** Rowers who have at least one note on this video, for the filter, in name order. */
export function rowersWithNotes(
  moments: readonly MomentRowers[],
): { id: string; displayName: string }[] {
  const byId = new Map<string, string>();
  for (const m of moments) for (const r of m.rowers) byId.set(r.id, r.displayName);
  return [...byId]
    .map(([id, displayName]) => ({ id, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
