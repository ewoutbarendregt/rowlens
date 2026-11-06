import { canManageRoster, type Role } from '../../shared/roles.ts';

/**
 * Role/author capabilities layered over tenant RLS (ADR-0019/0020). All members read club trainings;
 * mutation handlers and RLS additionally require creator or coach/admin resource write permission.
 * Explicit legacy service contexts retain processing access; authenticated empty roles fail closed.
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
    // uploads and lineups within their editable trainings (resource checks at API/RLS boundaries).
    case 'manage_roster':
      return service(viewer) || canManageRoster(rolesOf(viewer));
    case 'share':
    case 'assign':
    case 'manage_lineup':
    case 'upload':
      return true;
  }
}
