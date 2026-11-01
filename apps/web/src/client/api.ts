import { appUrl } from './env.ts';

/** Same-origin JSON call under the base path; the browser adds the Origin the server checks. */
export async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(appUrl(path), {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
}
