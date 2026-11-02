/** Set by `pnpm e2e:edge`: tests run through the local Caddy stack instead of a server started here. */
export const edgeUrl = process.env['E2E_EDGE_URL'];

/** Fixed only in NODE_ENV=test; production rejects this deterministic authentication code. */
export const authEmail = 'coach.e2e@example.com';
export const authCode = '284619';

/** APP_VERSION of the server under test: playwright.config.ts (`e2e`) or the edge compose file (`edge`). */
export const expectedVersion = edgeUrl === undefined ? 'e2e' : 'edge';
