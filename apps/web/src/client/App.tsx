import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { PLAYER_DEMO } from './features.ts';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

// The import sits inside the flag check so a build without the flag drops the chunk entirely.
const PlayerDemoPage = PLAYER_DEMO
  ? lazy(() => import('./pages/PlayerDemoPage.tsx').then((m) => ({ default: m.PlayerDemoPage })))
  : null;

export function App() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
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
