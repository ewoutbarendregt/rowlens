import type { Role } from './gate.ts';

/**
 * What a member may do (#40, ADR-0013), for the decisions the API makes itself. What a member may
 * *see* is enforced by the database (restrictive RLS policies); these rules sit on top for actions
 * on rows they can already see. `null` role: the pilot-code path, which acts as a coach.
 */
export interface Viewer {
  role: Role | null;
  userId: string | null;
}

export type Action =
  | { kind: 'manage_access' }
  | { kind: 'edit_annotation'; authorUserId: string | null }
  | { kind: 'unshare'; sharedByUserId: string | null }
  | { kind: 'share' }
  | { kind: 'assign' }
  | { kind: 'manage_roster' }
  | { kind: 'manage_lineup' }
  | { kind: 'upload' };

export const seesAll = (viewer: Viewer) => viewer.role !== 'rower';

export function can(viewer: Viewer, action: Action): boolean {
  switch (action.kind) {
    case 'manage_access':
      return viewer.role === 'admin';
    case 'edit_annotation':
      return seesAll(viewer) || (viewer.userId !== null && action.authorUserId === viewer.userId);
    case 'unshare':
      return seesAll(viewer) || (viewer.userId !== null && action.sharedByUserId === viewer.userId);
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
