import type { Role } from './gate.ts';

/**
 * What a member may do (#40, #108, ADR-0013), for the decisions the API makes itself. What a member
 * may *see* is enforced by the database (restrictive RLS policies): the admin sees the club, coaches
 * and rowers their own sessions. These rules sit on top, for rows the member can already see.
 * `null` role: the pilot-code path, which sees the club like an admin.
 */
export interface Viewer {
  role: Role | null;
  userId: string | null;
}

export type Action =
  | { kind: 'manage_access' }
  | { kind: 'assign_session_creator' }
  | { kind: 'edit_annotation'; authorUserId: string | null }
  | { kind: 'unshare'; sharedByUserId: string | null }
  | { kind: 'share' }
  | { kind: 'assign' }
  | { kind: 'manage_roster' }
  | { kind: 'manage_lineup' }
  | { kind: 'upload' }
  | { kind: 'mark_strokes' }
  | { kind: 'measure_angles' };

/** The whole club: the admin (and the pilot path). */
export const seesAll = (viewer: Viewer) => viewer.role === 'admin' || viewer.role === null;

/** Every note in the sessions they can see: coaches coach those sessions. */
const runsSessions = (viewer: Viewer) => seesAll(viewer) || viewer.role === 'coach';

export function can(viewer: Viewer, action: Action): boolean {
  switch (action.kind) {
    case 'manage_access':
    case 'assign_session_creator':
      return viewer.role === 'admin';
    case 'edit_annotation':
      return (
        runsSessions(viewer) || (viewer.userId !== null && action.authorUserId === viewer.userId)
      );
    // Stroke marks and angle measurements are the basis of every timing and angle; the coaches of a
    // session set them (#85, ADR-0017).
    case 'mark_strokes':
    case 'measure_angles':
      return runsSessions(viewer);
    case 'unshare':
      return (
        runsSessions(viewer) || (viewer.userId !== null && action.sharedByUserId === viewer.userId)
      );
    // Ewout (2026-11-02): rowers may share, assign, upload and keep the roster and lineups, on
    // whatever they can see.
    case 'share':
    case 'assign':
    case 'manage_roster':
    case 'manage_lineup':
    case 'upload':
      return true;
  }
}
