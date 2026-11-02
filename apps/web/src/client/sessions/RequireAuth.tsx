import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth.ts';
import { AppHeader } from '../ui/AppHeader.tsx';

/** Club pages require an active user session; otherwise return to the login page. */
export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  /** Admin-only pages send everyone else to the sessions list (#108). */
  role?: 'admin';
}) {
  const { state } = useAuth();
  if (state.kind === 'loading') return null;
  if (state.kind !== 'open') return <Navigate to="/" replace />;
  if (role === 'admin' && state.user.role !== 'admin') return <Navigate to="/sessions" replace />;
  return (
    <>
      <AppHeader state={state} />
      {children}
    </>
  );
}
