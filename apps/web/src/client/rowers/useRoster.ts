import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';

export interface Rower {
  id: string;
  displayName: string;
  email: string | null;
  /** Scoped crew endpoint identifies only the current member, without exposing e-mails. */
  mine?: boolean;
  archivedAt: string | null;
}

/** What adding a rower can end in: added, or a question for the coach first. */
export type AddResult =
  | { kind: 'added'; rower: Rower }
  | { kind: 'similar'; candidates: Rower[] }
  | { kind: 'email_taken' }
  | { kind: 'failed' };

export async function addRower(
  displayName: string,
  options: { email?: string; confirmNew?: boolean } = {},
): Promise<AddResult> {
  try {
    const res = await api('/api/rowers', {
      method: 'POST',
      body: { displayName, email: options.email, confirmNew: options.confirmNew ?? false },
    });
    if (res.status === 201) return { kind: 'added', rower: (await res.json()) as Rower };
    if (res.status === 409) {
      const body = (await res.json()) as { error: string; candidates?: Rower[] };
      if (body.error === 'similar') return { kind: 'similar', candidates: body.candidates ?? [] };
      if (body.error === 'email_taken') return { kind: 'email_taken' };
    }
  } catch {
    // Network error: same answer as a server error.
  }
  return { kind: 'failed' };
}

/** The club roster (#104), loaded once per page; `reload` after a change. */
export function useRoster(
  archived?: 'include' | 'only',
  sessionId?: string | null,
  sharing = false,
) {
  const [rowers, setRowers] = useState<Rower[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (sessionId === null) {
      setRowers(null);
      setFailed(false);
      return;
    }
    try {
      const res = await api(
        sessionId === undefined
          ? `/api/rowers${archived === undefined ? '' : `?archived=${archived}`}`
          : `/api/sessions/${sessionId}/rowers${sharing ? '?sharing=true' : ''}`,
      );
      if (!res.ok) throw new Error();
      setRowers(((await res.json()) as { rowers: Rower[] }).rowers);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [archived, sessionId, sharing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rowers, failed, reload };
}
