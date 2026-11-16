import { adminEmail } from './env.ts';
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
  await expect(page.getByTestId('examples').getByRole('button')).toHaveCount(0);
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'Training bewerken', exact: true }),
  ).toHaveCount(0);
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

test('RowLens admin creates, renames and opens examples from Help in their owning club', async ({
  page,
}, info) => {
  await signIn(page, adminEmail);
  await page.goto('./help');
  const examples = page.getByTestId('examples');
  await expect(
    examples.getByRole('button', { name: 'Nieuwe voorbeeldtraining', exact: true }),
  ).toBeVisible({ timeout: 3000 });
  let row = examples.locator('li', {
    has: page.getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  });
  const detail = await page.evaluate(
    async (url) =>
      (await (await fetch(url)).json()) as {
        examples: { id: string; clubId: string; title: string }[];
      },
    withBasePath('/projects/rowlens', '/api/examples'),
  );
  const example = detail.examples.find((s) => s.title === 'RowLens voorbeeld');
  expect(example?.clubId).toBeTruthy();
  await expect(row.getByRole('link', { name: 'Training bewerken', exact: true })).toHaveAttribute(
    'href',
    `${withBasePath('/projects/rowlens', `/sessions/${example?.id ?? ''}`)}?club=${example?.clubId ?? ''}`,
  );
  await row.getByRole('button', { name: 'Naam aanpassen', exact: true }).click();
  await row.getByLabel('Naam van de training', { exact: true }).fill('   ');
  await expect(row.getByRole('button', { name: 'Opslaan', exact: true })).toBeDisabled();
  await row.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(row.getByRole('link', { name: 'RowLens voorbeeld', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Naam aanpassen', exact: true }).click();
  const name = `Uitleg ${info.project.name}`;
  await row.getByLabel('Naam van de training', { exact: true }).fill(name);
  await row.getByRole('button', { name: 'Opslaan', exact: true }).click();
  row = examples.locator('li', { has: page.getByRole('link', { name, exact: true }) });
  await expect(row.getByRole('link', { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByRole('link', { name, exact: true })).toBeVisible();
  await row.getByRole('link', { name: 'Training bewerken', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('club')).toBe(example?.clubId);
  await page.locator('.app-header__nav').getByRole('link', { name: 'Uitleg', exact: true }).click();
  row = examples.locator('li', { has: page.getByRole('link', { name, exact: true }) });
  await row.getByRole('button', { name: 'Naam aanpassen', exact: true }).click();
  await row.getByLabel('Naam van de training', { exact: true }).fill('RowLens voorbeeld');
  await row.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(
    examples.getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await examples.getByRole('button', { name: 'Nieuwe voorbeeldtraining', exact: true }).click();
  const create = examples.getByRole('form', { name: 'Nieuwe voorbeeldtraining', exact: true });
  await create
    .getByLabel('Club van de voorbeeldtraining')
    .selectOption({ label: 'Gamma voorbeeldclub' });
  await create.getByLabel('Titel', { exact: true }).fill(`Nieuw voorbeeld ${info.project.name}`);
  await create.getByLabel('Datum', { exact: true }).fill('2026-11-16');
  await create.getByLabel('Boot', { exact: true }).selectOption('C2x');
  for (const height of await create
    .locator('input, select, button')
    .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height)))
    expect(height).toBeGreaterThanOrEqual(43.5);
  await layout(page);
  await page.screenshot({ path: info.outputPath('help-example-create.png'), fullPage: true });
  await examples.screenshot({ path: info.outputPath('help-example-create-card.png') });
  const createResponse = page.waitForResponse(
    (r) => r.url().includes('/api/sessions') && r.request().method() === 'POST',
  );
  await create.getByRole('button', { name: 'Voorbeeldtraining maken', exact: true }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(
    page.getByRole('heading', { name: `Nieuw voorbeeld ${info.project.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Dit is een voorbeeld voor alle ingelogde gebruikers.', { exact: false }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('club')).toBe(example?.clubId);
  await page.locator('.app-header__nav').getByRole('link', { name: 'Uitleg', exact: true }).click();
  await expect(
    examples.getByRole('link', { name: `Nieuw voorbeeld ${info.project.name}`, exact: true }),
  ).toBeVisible();
  await layout(page);
  for (const height of await examples
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height)))
    expect(height).toBeGreaterThanOrEqual(43.5);
  await page.screenshot({ path: info.outputPath('help-example-management.png'), fullPage: true });
});
