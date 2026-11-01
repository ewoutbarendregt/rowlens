/** Set by `pnpm e2e:edge`: tests run through the local Caddy stack instead of a server started here. */
export const edgeUrl = process.env['E2E_EDGE_URL'];

/** Pilot access code of both E2E servers (e2e/server.ts and the edge compose file); test-only. */
export const pilotCode = 'e2e-pilot-code-only';

/** APP_VERSION of the server under test: playwright.config.ts (`e2e`) or the edge compose file (`edge`). */
export const expectedVersion = edgeUrl === undefined ? 'e2e' : 'edge';
