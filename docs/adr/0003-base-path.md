# ADR-0003: Serve under `/projects/rowlens` without prefix stripping

- **Status**: proposed. Hosting choice accepted 2026-11-01: run on the shared `trustable.nl` origin for the first club, and move to an own host before a second club onboards.
- **Date**: 2026-11-01

## Context

RowLens is served at `https://trustable.nl/projects/rowlens`. Everything must work under that prefix:
client routing, static assets, API calls, tus upload `Location` headers, video URLs, cookies, OTP and
notification e-mail links, the PWA manifest/service worker scope. AudioScribe has Caddy strip the prefix
and uses relative URLs — fine for a single static page, error-prone for an app that generates absolute
URLs (tus, e-mail links, redirects).

The path is shared with trustable.nl's own SPA and AudioScribe: **same origin**.

## Decision

1. The app is **mounted at its base path** and Caddy forwards the path **unchanged** (no `strip_prefix`).
   One env var, `BASE_PATH=/projects/rowlens` (and `PUBLIC_ORIGIN=https://trustable.nl`), drives:
   router base, asset base (build-time `base` + runtime check), API prefix `${BASE_PATH}/api`, tus endpoint
   `${BASE_PATH}/api/uploads`, cookie `Path=${BASE_PATH}`, manifest `start_url`/`scope`, service-worker
   scope, and the absolute URL builder used for e-mails.
2. A single module (`apps/web/src/config/base-path.ts`) owns base-path normalisation and URL building;
   nothing else concatenates paths by hand. Unit tests cover `''`, `'/'`, trailing slashes and nesting.
3. Local dev and CI also run with `BASE_PATH=/projects/rowlens`, so prefix bugs surface before prod.
   An E2E test runs the full app behind a Caddy container with the same route as prod.
4. Cookies: `__Secure-rowlens_sid`, `HttpOnly; Secure; SameSite=Lax; Path=/projects/rowlens`.
   (`__Host-` is impossible with a non-root path.)
5. Proposed Caddy change (trustable.nl repo, **needs your approval**; placed before the default route):

   ```caddy
   # RowLens — mounted at its base path; prefix is NOT stripped
   redir /projects/rowlens /projects/rowlens/ 308
   route /projects/rowlens/* {
     request_body {
       max_size 64MB          # tus chunk size is 16–50 MB; whole files never go in one request
     }
     reverse_proxy rowlens-web:3000 {
       flush_interval -1       # streaming responses (video ranges, SSE progress)
     }
   }
   ```

## Consequences / risks

- **Same-origin risk**: cookie `Path` scoping is *not* a security boundary. An XSS in trustable.nl's SPA
  or AudioScribe could issue credentialed same-origin requests to RowLens's API and read responses.
  Mitigations now: strict CSP on RowLens, CSRF token + `Origin` check on unsafe methods, no tokens in
  `localStorage`. **Recommendation: move to an own host (`rowlens.trustable.nl` or a product domain) before
  onboarding a second club.** Because of (1)–(2) that move is a config change, not a code change.
- Service worker scope is limited to `/projects/rowlens/`, which is what we want.

## Alternatives considered

- **Strip prefix (AudioScribe pattern)** — the app must then reconstruct its public URL from
  `X-Forwarded-Prefix` for every absolute URL; easy to get wrong in tus and e-mails. Rejected.
