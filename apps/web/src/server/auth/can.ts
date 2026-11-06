import { canManageRoster, type Role } from '../../shared/roles.ts';

/**
 * What a member may do (#40, #108, ADR-0013), for the decisions the API makes itself. What a member
 * may *see* is enforced by the database (restrictive RLS policies): the admin sees the club, coaches
 * and rowers their own sessions. These rules sit on top, for rows the member can already see.
 * `null` role: the pilot-code path, which sees the club like an admin.
 */
export interface Viewer {
  roles?: readonly Role[] | undefined;
  /** Legacy test/service context; real sessions always carry roles. */
  role?: Role | null;
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
  | { kind: 'measure_angles' }
  | { kind: 'rename_session'; createdByUserId: string | null };

/** The whole club: the admin (and the pilot path). */
const rolesOf = (viewer: Viewer): readonly Role[] =>
  viewer.roles ?? (viewer.role == null ? [] : [viewer.role]);
const service = (viewer: Viewer) =>
  viewer.userId === null && viewer.roles === undefined && viewer.role == null;
export const seesAll = (viewer: Viewer) => rolesOf(viewer).includes('admin') || service(viewer);

/** Every note in the sessions they can see: coaches coach those sessions. */
const runsSessions = (viewer: Viewer) => seesAll(viewer) || rolesOf(viewer).includes('coach');

export function can(viewer: Viewer, action: Action): boolean {
  if (!service(viewer) && rolesOf(viewer).length === 0) return false;
  switch (action.kind) {
    case 'manage_access':
    case 'assign_session_creator':
      return rolesOf(viewer).includes('admin');
    case 'edit_annotation':
      return (
        runsSessions(viewer) || (viewer.userId !== null && action.authorUserId === viewer.userId)
      );
    // Stroke marks and angle measurements are the basis of every timing and angle; the coaches of a
    // session set them (#85, ADR-0017).
    case 'mark_strokes':
    case 'measure_angles':
      return runsSessions(viewer);
    // Its coaches and the admin, and whoever made it (2026-11-03).
    case 'rename_session':
      return (
        runsSessions(viewer) || (viewer.userId !== null && action.createdByUserId === viewer.userId)
      );
    case 'unshare':
      return (
        runsSessions(viewer) || (viewer.userId !== null && action.sharedByUserId === viewer.userId)
      );
    // Roster management requires coach/admin (#151). Rowers retain sharing, assignments,
    // uploads and lineups within their visible trainings.
    case 'manage_roster':
      return service(viewer) || canManageRoster(rolesOf(viewer));
    case 'share':
    case 'assign':
    case 'manage_lineup':
    case 'upload':
      return true;
  }
}
