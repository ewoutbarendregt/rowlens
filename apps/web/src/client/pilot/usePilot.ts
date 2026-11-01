import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';

export type PilotState =
  | { kind: 'loading' }
  | { kind: 'closed' }
  | { kind: 'locked' }
  | { kind: 'open'; club: { slug: string; name: string } };

/** Whether this browser has pilot access (#84), and the club it acts in. */
export function usePilot(): { state: PilotState; refresh: () => void } {
  const [state, setState] = useState<PilotState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const stale = new AbortController();
    void (async () => {
      const next = await loadState().catch((): PilotState => ({ kind: 'closed' }));
      if (!stale.signal.aborted) setState(next);
    })();
    return () => {
      stale.abort();
    };
  }, [version]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  return { state, refresh };
}

async function loadState(): Promise<PilotState> {
  const res = await api('/api/pilot/status');
  if (!res.ok) return { kind: 'closed' };
  const status = (await res.json()) as { enabled: boolean; access: boolean };
  if (!status.enabled) return { kind: 'closed' };
  if (!status.access) return { kind: 'locked' };
  const club = await api('/api/club');
  if (!club.ok) return { kind: 'locked' };
  return { kind: 'open', club: (await club.json()) as { slug: string; name: string } };
}
