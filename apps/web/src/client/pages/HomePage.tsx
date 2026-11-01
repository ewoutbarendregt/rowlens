import { Link } from 'react-router';
import { PLAYER_DEMO } from '../features.ts';
import { useAppVersion } from '../useAppVersion.ts';

// Placeholder shell for M0 (#19). Copy beyond the product name arrives with i18n (#34).
export function HomePage() {
  const version = useAppVersion();
  return (
    <main className="shell">
      <h1 className="wordmark">RowLens</h1>
      {version !== null && (
        <p className="version" data-testid="app-version">
          {/^\d/.test(version) ? `v${version}` : version}
        </p>
      )}
      {PLAYER_DEMO && (
        <Link className="home-link" to="/demo/player">
          ▶ demo/player
        </Link>
      )}
    </main>
  );
}
