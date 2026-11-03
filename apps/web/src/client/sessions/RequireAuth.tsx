import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth.ts';
import { authStrings } from '../auth/strings.ts';
import { AppHeader } from '../ui/AppHeader.tsx';
import { ProfileForm } from '../ui/ProfileForm.tsx';

/** Club pages require an active user session; otherwise return to the login page. */
export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  /** Admin-only pages send everyone else to the sessions list (#108). */
  role?: 'admin';
}) {
  const { state, refresh } = useAuth();
  const t = authStrings();
  if (state.kind === 'loading') return null;
  if (state.kind !== 'open') return <Navigate to="/" replace />;
  if (role === 'admin' && state.user.role !== 'admin') return <Navigate to="/sessions" replace />;
  // Everyone gives their name first (Ewout, 2026-11-03): it shows on sessions and notes.
  const named = state.user.firstName !== null && state.user.lastName !== null;
  return (
    <>
      <AppHeader state={state} onProfileSaved={refresh} />
      {named ? (
        children
      ) : (
        <main className="page">
          <section className="card welcome" data-testid="welcome">
            <h1>{t.welcome}</h1>
            <p>{t.welcomeText}</p>
            <ProfileForm
              firstName={null}
              lastName={null}
              defaultBoatType={state.user.defaultBoatType}
              withBoat={false}
              onSaved={refresh}
            />
          </section>
        </main>
      )}
    </>
  );
}
