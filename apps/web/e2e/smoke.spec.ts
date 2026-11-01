import { expect, test } from '@playwright/test';
import { edgeUrl, expectedVersion } from './env.ts';

const BASE = '/projects/rowlens';

test('home page loads and reaches the API under the base path', async ({ page }) => {
  const sameOriginPaths: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === new URL(page.url() || req.url()).origin) sameOriginPaths.push(url.pathname);
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  await expect(page.getByRole('heading', { level: 1, name: 'RowLens' })).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText(`v${expectedVersion}`);

  expect(sameOriginPaths.length).toBeGreaterThan(0);
  for (const path of sameOriginPaths) expect(path.startsWith(`${BASE}/`)).toBe(true);
});

test('deep links to client routes get the app shell', async ({ page }) => {
  const response = await page.goto('./c/some-club/sessions/42');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('not-found')).toHaveText('404');

  await page.getByRole('link', { name: 'RowLens' }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/$`));
  await expect(page.getByRole('heading', { level: 1, name: 'RowLens' })).toBeVisible();
});

test('nothing is served outside the base path', async ({ request }) => {
  // Behind Caddy those paths belong to the other apps; edge.spec.ts covers that case.
  test.skip(edgeUrl !== undefined, 'covered by edge.spec.ts');
  expect((await request.get('/')).status()).toBe(404);
  expect((await request.get('/projects/audioscribe/')).status()).toBe(404);
});
