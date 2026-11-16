import { withBasePath } from '../src/shared/base-path.ts';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the isolated visibility configuration');
async function layout(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('primary club, participation boundary, examples and saved filter choices', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./sessions');
  await page.getByTestId('filters').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const club = page.getByLabel('Club', { exact: true });
  await expect(club).toHaveValue(/.+/);
  await expect(club.locator('option:checked')).toHaveText('Beta testclub');
  await expect(
    page.getByTestId('session-list').getByRole('link', { name: 'Eigen Beta', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Onzichtbare training', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await club.selectOption({ label: 'Alpha testclub' });
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await page.getByLabel('Alleen trainingen waarin ik voorkom', { exact: true }).check();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Filters wissen', exact: true }).click();
  await expect(club.locator('option:checked')).toHaveText('Beta testclub');
  await club.selectOption('');
  await page.reload();
  await expect(club).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Beta', exact: true })).toBeVisible();
  await page.getByTestId('account-menu').locator('summary').click();
  const primary = page.getByLabel('Primaire club', { exact: true });
  const save = page.waitForResponse(
    (r) => r.url().includes('/api/me/settings') && r.request().method() === 'PATCH',
  );
  await primary.selectOption({ label: 'Alpha testclub' });
  expect((await save).ok()).toBe(true);
  await page.goto('./sessions');
  await expect(club.locator('option:checked')).toHaveText('Alpha testclub');
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await layout(page);
  await page.screenshot({ path: info.outputPath('primary-club.png'), fullPage: true });
  // Reset to the initial preference so every viewport starts with the same fixture.
  await page.getByTestId('account-menu').locator('summary').click();
  const reset = page.waitForResponse(
    (r) => r.url().includes('/api/me/settings') && r.request().method() === 'PATCH',
  );
  await primary.selectOption({ label: 'Beta testclub' });
  expect((await reset).ok()).toBe(true);
});
test('example playback and Help work for a club member and a clubless account', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./sessions');
  await page
    .getByTestId('examples')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'RowLens voorbeeld', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByText('Hidden private fixture')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen/ })).toHaveCount(0);
  await page.getByTestId('player-frame').waitFor();
  await layout(page);
  await page.screenshot({ path: info.outputPath('example-playback.png'), fullPage: true });
  await page.locator('.app-header__nav').getByRole('link', { name: 'Uitleg', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uitleg', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Kies je club', exact: true }).click();
  await expect(page.locator('#clubs')).toBeInViewport();
  await layout(page);
  await page.screenshot({ path: info.outputPath('help.png'), fullPage: true });
  // Unnamed clubless registrations can open Help/examples without inventing a membership.
  await page.context().clearCookies();
  await page.goto('./');
  const statuses = await page.evaluate(
    async ({ otp, verify, email }) => {
      const registered = await fetch(otp, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, clubId: null }),
      });
      const { requestId } = (await registered.json()) as { requestId: string };
      const verified = await fetch(verify, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: '284619', requestId }),
      });
      return [registered.status, verified.status];
    },
    {
      otp: withBasePath('/projects/rowlens', '/api/auth/registration/otp'),
      verify: withBasePath('/projects/rowlens', '/api/auth/registration/verify'),
      email: `clubless-${info.project.name}@example.test`,
    },
  );
  expect(statuses).toEqual([202, 204]);
  await page.goto('./help');
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await page
    .getByTestId('examples')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await layout(page);
});

test('example publisher notes, drawings and boat line are read-only and follow the video frame', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./help');
  await page
    .getByTestId('examples')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  const notes = page.getByTestId('example-notes');
  await expect(notes).toContainText('Voorbeeld: rustig inzetten');
  await expect(page.locator('body')).not.toContainText(
    /Hidden private fixture|Hidden other author|Hidden publisher identity/,
  );
  await notes.getByRole('button', { name: /Notitie bij frame 10/ }).click();
  await expect(page.locator('video')).toBeInViewport({ ratio: 0.5 });
  await expect(page.getByTestId('player-frame')).toHaveText('10');
  const layer = page.locator('.drawing-layer');
  await expect(layer.locator('[data-kind]')).toHaveCount(4);
  await expect(layer.locator('.drawing--boat')).toHaveCount(1);
  await expect(page.getByTestId('video-note-overlay')).toContainText('Voorbeeld: rustig inzetten');
  await expect(page.locator('.drawing--pickable')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen|Delen/ })).toHaveCount(0);
  await page.getByTestId('zoom').getByRole('button', { name: 'Inzoomen', exact: true }).click();
  const picture = await layer.boundingBox();
  expect(picture?.width).toBeGreaterThan(100);
  const savedLine = layer.locator('g[data-kind="line"]:not(.drawing--boat) line.drawing__line');
  await expect(savedLine).toHaveAttribute('x1', '64');
  await expect(savedLine).toHaveAttribute('y1', '72');
  await expect(savedLine).toHaveAttribute('x2', '512');
  await expect(savedLine).toHaveAttribute('y2', '108');
  await expect(layer).not.toHaveAttribute('viewBox', '0 0 640 360');
  await layout(page);
  await page.screenshot({ path: info.outputPath('example-feedback-zoom.png'), fullPage: true });
  await page.getByRole('button', { name: /Volledig scherm/, exact: true }).click();
  await expect(page.locator('.player')).toHaveClass(/player--fullscreen/);
  await expect(page.locator('.player .drawing-layer [data-kind]')).toHaveCount(4);
  await expect(page.locator('.player [data-testid="video-note-overlay"]')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('example-feedback-fullscreen.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Volgende frame', exact: true }).click();
  await expect(page.getByTestId('player-frame')).toHaveText('11');
  await expect(layer.locator('[data-kind]')).toHaveCount(1);
  await expect(layer.locator('.drawing--boat')).toHaveCount(1);
  await expect(page.getByTestId('video-note-overlay')).toContainText('Voorbeeld: rustig inzetten');
  // A long-lived new client can briefly meet an older server after a rollback.
  await page.route('**/api/examples/*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { videos?: { annotations?: unknown }[] };
    if (body.videos) for (const clip of body.videos) delete clip.annotations;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByTestId('example-notes').locator('li')).toHaveCount(0);
  await expect(page.locator('.drawing--boat')).toHaveCount(1);
});
