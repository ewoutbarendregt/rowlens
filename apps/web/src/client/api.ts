import { activeClub } from './club-context.ts';
import { appUrl } from './env.ts';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Same-origin JSON call under the base path; the browser adds the Origin the server checks. */
export async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const club = activeClub();
  const method = init.method ?? 'GET';
  const csrf = UNSAFE.has(method) ? csrfToken() : null;
  return fetch(appUrl(path), {
    method,
    credentials: 'same-origin',
    headers: {
      ...(club === null ? {} : { 'x-rowlens-club': club }),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(csrf === null ? {} : { 'x-csrf-token': csrf }),
    },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
}

/** Non-HttpOnly CSRF token for tus and JSON mutations; the server compares its session hash. */
export function csrfToken(): string | null {
  for (const part of document.cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'rowlens_csrf') return value.join('=');
  }
  return null;
}
