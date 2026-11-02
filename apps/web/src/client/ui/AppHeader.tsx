import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { adminStrings } from '../admin/strings.ts';
import { api } from '../api.ts';
import { authStrings } from '../auth/strings.ts';
import type { AuthState } from '../auth/useAuth.ts';
import { rowerStrings } from '../rowers/strings.ts';
import { sessionStrings } from '../sessions/strings.ts';
import { Icon } from './icons.tsx';
import { ThemeSwitch } from './ThemeSwitch.tsx';

/**
 * The bar on every page after login (#108): Sessions, Rowers, Admin (admins only), and an account
 * menu with display mode and signing out. Styled after the design system's top navigation.
 */
export function AppHeader({ state }: { state: Extract<AuthState, { kind: 'open' }> }) {
  const t = authStrings();
  const navigate = useNavigate();
  const [othersDone, setOthersDone] = useState(false);

  const logout = () => {
    void api('/api/auth/logout', { method: 'POST' }).finally(() => {
      void navigate('/', { replace: true });
    });
  };

  const logoutOthers = () => {
    setOthersDone(false);
    void api('/api/auth/logout-others', { method: 'POST' }).then((response) => {
      if (response.ok) setOthersDone(true);
    });
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <span className="app-header__brand">
          RowLens{' '}
          <span className="app-header__club" data-testid="club-name">
            {state.club.name}
          </span>
        </span>
        <nav className="app-header__nav" aria-label="RowLens">
          <NavLink to="/sessions" end={false}>
            {sessionStrings().sessions}
          </NavLink>
          <NavLink to="/rowers">{rowerStrings().rowers}</NavLink>
          {state.user.role === 'admin' && <NavLink to="/admin">{adminStrings().admin}</NavLink>}
        </nav>
        <details className="account" data-testid="account-menu">
          <summary aria-label={t.account}>
            <span className="account__email">{state.user.email}</span>
            <Icon name="chevronDown" size={14} />
          </summary>
          <div className="account__panel">
            <p className="muted">
              {t.signedIn} <strong>{state.user.email}</strong>.
            </p>
            <ThemeSwitch />
            <button className="button--quiet" type="button" onClick={logoutOthers}>
              {t.logoutOthers}
            </button>
            {othersDone && <p role="status">{t.othersDone}</p>}
            <button type="button" onClick={logout}>
              {t.logout}
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
