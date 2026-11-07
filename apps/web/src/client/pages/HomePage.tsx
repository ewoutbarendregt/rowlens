import { Link, Navigate } from 'react-router';
import { LoginGate } from '../auth/LoginGate.tsx';
import { authStrings } from '../auth/strings.ts';
import { useAuth } from '../auth/useAuth.ts';
import { PLAYER_DEMO } from '../features.ts';
import { LanguageSwitch } from '../ui/LanguageSwitch.tsx';
import { ThemeSwitch } from '../ui/ThemeSwitch.tsx';
import { useAppVersion } from '../useAppVersion.ts';

/** The login page; once signed in, the sessions list is the start page (#108). */
export function HomePage() {
  const version = useAppVersion();
  const { state, refresh } = useAuth();
  const t = authStrings();

  if (state.kind === 'open')
    return <Navigate to={state.unified && !state.club.id ? '/clubs' : '/sessions'} replace />;

  return (
    <main className="shell login">
      <div className="login__card">
        <header className="login__head">
          <h1 className="wordmark">RowLens</h1>
          {version !== null && (
            <span className="version" data-testid="app-version">
              {/^\d/.test(version) ? `v${version}` : version}
            </span>
          )}
        </header>
        {state.kind === 'closed' && <p className="version">{t.closed}</p>}
        {state.kind === 'locked' && (
          <LoginGate onAccess={refresh} unified={state.unified === true} />
        )}
      </div>
      <LanguageSwitch />
      <ThemeSwitch />
      {PLAYER_DEMO && (
        <Link className="home-link" to="/demo/player">
          ▶ demo/player
        </Link>
      )}
    </main>
  );
}
