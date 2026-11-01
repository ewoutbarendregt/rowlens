import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { usePilot } from '../pilot/usePilot.ts';

/** Club pages need pilot access (#84); without it, back to the gate on the home page. */
export function RequirePilot({ children }: { children: ReactNode }) {
  const { state } = usePilot();
  if (state.kind === 'loading') return null;
  if (state.kind !== 'open') return <Navigate to="/" replace />;
  return children;
}
