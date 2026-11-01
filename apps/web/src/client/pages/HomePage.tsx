import { Link } from 'react-router';
import { api } from '../api.ts';
import { PLAYER_DEMO } from '../features.ts';
import { AccessGate } from '../pilot/AccessGate.tsx';
import { pilotStrings } from '../pilot/strings.ts';
import { usePilot } from '../pilot/usePilot.ts';
import { useAppVersion } from '../useAppVersion.ts';

export function HomePage() {
  const version = useAppVersion();
  const { state, refresh } = usePilot();
  const t = pilotStrings();

  const logout = () => {
    void api('/api/pilot/logout', { method: 'POST' }).finally(refresh);
  };

  return (
    <main className="shell">
      <h1 className="wordmark">RowLens</h1>
      {version !== null && (
        <p className="version" data-testid="app-version">
          {/^\d/.test(version) ? `v${version}` : version}
        </p>
      )}
      {state.kind === 'closed' && <p className="version">{t.closed}</p>}
      {state.kind === 'locked' && <AccessGate onAccess={refresh} />}
      {state.kind === 'open' && (
        <section className="club" aria-label={state.club.name}>
          <h2 data-testid="club-name">{state.club.name}</h2>
          <p>{t.signedIn}</p>
          <Link className="button-link" to="/sessions">
            {t.openSessions}
          </Link>
          <button type="button" onClick={logout}>
            {t.logout}
          </button>
        </section>
      )}
      {PLAYER_DEMO && (
        <Link className="home-link" to="/demo/player">
          ▶ demo/player
        </Link>
      )}
    </main>
  );
}
