import { ClubsPage } from './clubs/ClubsPage.tsx';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AccessPage } from './admin/AccessPage.tsx';
import { PLAYER_DEMO, UNIFIED_USERS } from './features.ts';
import { useLanguage } from './i18n/language.ts';
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
  // Strings are read while rendering: a language switch re-renders everything from here, without
  // remounting (a playing video and running uploads carry on).
  useLanguage();
  return (
    <Routes>
      <Route index element={<HomePage />} />
      {UNIFIED_USERS && (
        <Route
          path="clubs"
          element={
            <RequireAuth accountOnly>
              <ClubsPage />
            </RequireAuth>
          }
        />
      )}
      {UNIFIED_USERS && (
        <Route
          path="users"
          element={
            <RequireAuth accountOnly role="admin">
              <AccessPage key="users" directory />
            </RequireAuth>
          }
        />
      )}
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
      <Route
        path="admin"
        element={
          <RequireAuth role="admin">
            <AccessPage key="club-admin" />
          </RequireAuth>
        }
      />
      <Route
        path="rowers"
        element={
          <RequireAuth role="roster">
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
