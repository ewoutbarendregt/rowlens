import { Link } from 'react-router';
import { api } from '../api.ts';
import { LoginGate } from '../auth/LoginGate.tsx';
import { authStrings } from '../auth/strings.ts';
import { useAuth } from '../auth/useAuth.ts';
import { PLAYER_DEMO } from '../features.ts';
import { useAppVersion } from '../useAppVersion.ts';
import { useState } from 'react';

export function HomePage() {
  const version = useAppVersion();
  const { state, refresh } = useAuth();
  const [othersDone, setOthersDone] = useState(false);
  const t = authStrings();

  const logout = () => {
    void api('/api/auth/logout', { method: 'POST' }).finally(refresh);
  };

  const logoutOthers = () => {
    setOthersDone(false);
    void api('/api/auth/logout-others', { method: 'POST' }).then((response) => {
      if (response.ok) setOthersDone(true);
    });
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
      {state.kind === 'locked' && <LoginGate onAccess={refresh} />}
      {state.kind === 'open' && (
        <section className="club" aria-label={state.club.name}>
          <h2 data-testid="club-name">{state.club.name}</h2>
          <p>
            {t.signedIn} <strong>{state.user.email}</strong>.
          </p>
          <Link className="button-link" to="/sessions">
            {t.openSessions}
          </Link>
          <button className="button--quiet" type="button" onClick={logoutOthers}>
            {t.logoutOthers}
          </button>
          {othersDone && <p role="status">{t.othersDone}</p>}
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
