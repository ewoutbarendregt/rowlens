import { useEffect, useSyncExternalStore } from 'react';
import type { BoatClass } from '../../shared/boats.ts';
import { api } from '../api.ts';
import { rolesSchema, type Role } from '../../shared/roles.ts';
import { ownSettings } from '../settings/controller.ts';

interface AuthUser {
  id: string;
  roles: Role[];
  email: string;
  displayName: string;
  /** The club roster name when linked, otherwise the account display name. */
  authorName: string;
  locale: 'nl' | 'en';
  role: 'rower' | 'coach' | 'admin';
  /** Linked to a roster entry; a rower sees nothing until a coach adds their e-mail there. */
  linked: boolean;
  /** Their own name (2026-11-03); until both are set, the app asks for them first. */
  firstName: string | null;
  lastName: string | null;
  /** The boat a new session starts with; null: C4x+. */
  defaultBoatType: BoatClass | null;
}

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'closed' }
  | { kind: 'locked' }
  | { kind: 'open'; user: AuthUser; club: { slug: string; name: string } };

let current: AuthState = { kind: 'loading' };
let started = false;
let sequence = 0;
let consumers = 0;
const listeners = new Set<() => void>();
const snapshot = () => current;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
/** Drop account state immediately when signing out, including pending preference responses. */
export function forgetAuth(): void {
  sequence++;
  current = { kind: 'loading' };
  ownSettings.setUser(null);
  for (const listener of listeners) listener();
}
export function refreshAuth(): void {
  const request = ++sequence;
  void loadState()
    .catch((): AuthState => ({ kind: 'closed' }))
    .then((next) => {
      if (request !== sequence) return;
      current = next;
      const previous = ownSettings.get().userId;
      ownSettings.setUser(next.kind === 'open' ? next.user.id : null);
      if (next.kind === 'open' && previous === next.user.id) void ownSettings.refresh();
      for (const listener of listeners) listener();
    });
}
export function useAuth(): { state: AuthState; refresh: () => void } {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!started) {
      started = true;
      refreshAuth();
    }
    if (consumers++ === 0) window.addEventListener('focus', refreshAuth);
    return () => {
      if (--consumers === 0) window.removeEventListener('focus', refreshAuth);
    };
  }, []);
  return { state, refresh: refreshAuth };
}

async function loadState(): Promise<AuthState> {
  const response = await api('/api/auth/status');
  if (!response.ok) return { kind: 'closed' };
  const status = (await response.json()) as {
    enabled: boolean;
    access: boolean;
    user?: AuthUser;
  };
  if (!status.enabled) return { kind: 'closed' };
  if (
    !status.access ||
    status.user === undefined ||
    !rolesSchema.safeParse(status.user.roles).success ||
    typeof status.user.id !== 'string'
  )
    return { kind: 'locked' };
  const club = await api('/api/club');
  if (!club.ok) return { kind: 'locked' };
  return {
    kind: 'open',
    user: status.user,
    club: (await club.json()) as { slug: string; name: string },
  };
}
