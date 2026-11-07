import { activeClub } from './club-context.ts';
import { normalizeBasePath, withBasePath } from '../shared/base-path.ts';

/** Base path the client was built for (Vite `base`, e.g. `/projects/rowlens/`), normalised. */
export const basePath = normalizeBasePath(import.meta.env.BASE_URL);

/** Same-origin URL for an app path, e.g. `appUrl('/api/sessions')`. */
export function appUrl(path: string, clubId: string | null = activeClub()): string {
  const url = withBasePath(basePath, path);
  const club = clubId;
  if (club === null || !path.startsWith('/api/')) return url;
  const target = new URL(url, window.location.origin);
  target.searchParams.set('club', club);
  return target.pathname + target.search;
}
