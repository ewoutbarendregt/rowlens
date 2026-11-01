import { normalizeBasePath, withBasePath } from '../shared/base-path.ts';

/** Base path the client was built for (Vite `base`, e.g. `/projects/rowlens/`), normalised. */
export const basePath = normalizeBasePath(import.meta.env.BASE_URL);

/** Same-origin URL for an app path, e.g. `appUrl('/api/sessions')`. */
export function appUrl(path: string): string {
  return withBasePath(basePath, path);
}
