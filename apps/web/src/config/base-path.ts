/**
 * Single owner of base-path handling (ADR-0003). Nothing else in the app concatenates
 * URL paths by hand: routes, assets, API, tus, cookies and e-mail links all go through here.
 */

const SEGMENT = /^[A-Za-z0-9._~-]+$/;

/** Normalises a configured base path to `''` (root) or `/a/b` (leading slash, no trailing slash). */
export function normalizeBasePath(input: string | undefined): string {
  const trimmed = (input ?? '').trim();
  const segments = trimmed.split('/').filter((s) => s !== '');
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || segment === '.' || segment === '..') {
      throw new Error(`Invalid BASE_PATH segment: ${JSON.stringify(segment)}`);
    }
  }
  return segments.length === 0 ? '' : `/${segments.join('/')}`;
}

/** Prefixes an app-relative path (must start with `/`) with the normalised base path. */
export function withBasePath(basePath: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`App path must start with a single "/": ${JSON.stringify(path)}`);
  }
  return `${basePath}${path}`;
}

/** Absolute URL for links that leave the app (e-mails, tus Location headers, redirects). */
export function absoluteUrl(publicOrigin: string, basePath: string, path: string): string {
  const origin = new URL(publicOrigin);
  if (origin.pathname !== '/' || origin.search !== '' || origin.hash !== '') {
    throw new Error(`PUBLIC_ORIGIN must be an origin without a path: ${publicOrigin}`);
  }
  return new URL(withBasePath(basePath, path), origin).toString();
}

/** Returns the app-relative path for a request path inside the base path, or `null` if outside. */
export function stripBasePath(basePath: string, requestPath: string): string | null {
  if (basePath === '') return requestPath;
  if (requestPath === basePath) return '/';
  if (requestPath.startsWith(`${basePath}/`)) return requestPath.slice(basePath.length);
  return null;
}
