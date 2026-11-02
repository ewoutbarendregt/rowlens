import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';

interface AuthUser {
  email: string;
  displayName: string;
  locale: 'nl' | 'en';
}

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'closed' }
  | { kind: 'locked' }
  | { kind: 'open'; user: AuthUser; club: { slug: string; name: string } };

export function useAuth(): { state: AuthState; refresh: () => void } {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const stale = new AbortController();
    void loadState().then(
      (next) => {
        if (!stale.signal.aborted) setState(next);
      },
      () => {
        if (!stale.signal.aborted) setState({ kind: 'closed' });
      },
    );
    return () => {
      stale.abort();
    };
  }, [version]);

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);
  return { state, refresh };
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
  if (!status.access || status.user === undefined) return { kind: 'locked' };
  const club = await api('/api/club');
  if (!club.ok) return { kind: 'locked' };
  return {
    kind: 'open',
    user: status.user,
    club: (await club.json()) as { slug: string; name: string },
  };
}
