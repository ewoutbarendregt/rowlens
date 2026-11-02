import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AccessPage } from './admin/AccessPage.tsx';
import { PLAYER_DEMO } from './features.ts';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { RowersPage } from './rowers/RowersPage.tsx';
import { RequireAuth } from './sessions/RequireAuth.tsx';
import { SessionPage } from './sessions/SessionPage.tsx';
import { SessionsPage } from './sessions/SessionsPage.tsx';
import { VideoPage } from './sessions/VideoPage.tsx';

// The import sits inside the flag check so a build without the flag drops the chunk entirely.
const PlayerDemoPage = PLAYER_DEMO
  ? lazy(() => import('./pages/PlayerDemoPage.tsx').then((m) => ({ default: m.PlayerDemoPage })))
  : null;

export function App() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route
        path="sessions"
        element={
          <RequireAuth>
            <SessionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="sessions/:id"
        element={
          <RequireAuth>
            <SessionPage />
          </RequireAuth>
        }
      />
      <Route path="admin" element={<AccessPage />} />
      <Route
        path="rowers"
        element={
          <RequireAuth>
            <RowersPage />
          </RequireAuth>
        }
      />
      <Route
        path="videos/:id"
        element={
          <RequireAuth>
            <VideoPage />
          </RequireAuth>
        }
      />
      {PlayerDemoPage !== null && (
        <Route
          path="demo/player"
          element={
            <Suspense fallback={null}>
              <PlayerDemoPage />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
