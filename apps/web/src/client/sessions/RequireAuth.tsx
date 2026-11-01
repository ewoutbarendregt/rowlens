import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth.ts';

/** Club pages require an active user session; otherwise return to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.kind === 'loading') return null;
  if (state.kind !== 'open') return <Navigate to="/" replace />;
  return children;
}
