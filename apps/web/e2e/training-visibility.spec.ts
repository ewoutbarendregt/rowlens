import { adminEmail } from './env.ts';
import { withBasePath } from '../src/shared/base-path.ts';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the isolated visibility configuration');
async function layout(page: Page) {
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
  // The example lives in a club the viewer is not in, and still shows under their own club filter.
  const exampleLink = page
    .getByTestId('session-list')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true });
  await expect(exampleLink).toBeVisible();
  const exampleRow = page.getByTestId('session-list').locator('tr', {
    has: page.getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  });
  await expect(exampleRow.getByTestId('example-badge')).toHaveText('Voorbeeld');
  await expect(page.getByTestId('examples')).toHaveCount(0);
  // The other filters apply to examples as well.
  await page.getByPlaceholder('Woorden in de titel', { exact: true }).fill('niet bestaand');
  await expect(exampleLink).toHaveCount(0);
  await page.getByPlaceholder('Woorden in de titel', { exact: true }).fill('voorbeeld');
  await expect(exampleLink).toBeVisible();
  await page.getByPlaceholder('Woorden in de titel', { exact: true }).fill('');
  await club.selectOption({ label: 'Alpha testclub' });
  await expect(exampleLink).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await page.getByLabel('Alleen trainingen waarin ik voorkom', { exact: true }).check();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  // The viewer is not in the example's crew, so "only where I take part" leaves it out.
  await expect(exampleLink).toHaveCount(0);
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
  await expect(exampleLink).toBeVisible();
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
/** The example's id and club, as every signed-in account can discover them. */
async function exampleNamed(page: Page, title: string) {
  const list = await page.evaluate(
    async (url) =>
      (await (await fetch(url)).json()) as {
        examples: { id: string; clubId: string; title: string }[];
      },
    withBasePath('/projects/rowlens', '/api/examples'),
  );
  const found = list.examples.find((s) => s.title === title);
  if (!found) throw new Error(`Missing example ${title}`);
  return found;
}

/** Opens a training's first video from the normal training page. */
async function openFirstVideo(page: Page) {
  await page.getByTestId('video-list').locator('a.video__name').first().click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
}

test('examples open read-only in the normal pages, for a member of another club and a clubless account', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./sessions');
  await expect(page.getByTestId('session-list')).toBeVisible();
  // From here on, the example pages may only use the example API, never a club endpoint.
  const clubCalls: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/api\/(videos|sessions|annotations|angles|rowers|source-annotations)\//.test(path))
      clubCalls.push(path);
  });
  await page
    .getByTestId('session-list')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  // The normal training page, fed by the example API only.
  await expect(page.getByRole('heading', { name: 'RowLens voorbeeld', exact: true })).toBeVisible();
  await expect(page.getByTestId('example-read-only')).toBeVisible();
  await expect(page.getByTestId('video-list').getByTestId('video')).toHaveCount(1);
  await expect(page.getByText('synthetic.webm')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Naam aanpassen|Verwijderen|Training delen/ }),
  ).toHaveCount(0);
  await expect(page.getByTestId('publish-example')).toHaveCount(0);
  await expect(page.getByText('Originele training beheren')).toHaveCount(0);
  await layout(page);
  await page.screenshot({ path: info.outputPath('example-training.png'), fullPage: true });
  await openFirstVideo(page);
  expect(new URL(page.url()).pathname).toMatch(/\/examples\/[^/]+\/videos\/[^/]+$/);
  await expect(page.getByTestId('example-read-only')).toBeVisible();
  await expect(page.getByText('Hidden private fixture')).toHaveCount(0);
  await expect(page.locator('.draw')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen/ })).toHaveCount(0);
  await page.getByTestId('player-frame').waitFor();
  await layout(page);
  await page.screenshot({ path: info.outputPath('example-playback.png'), fullPage: true });
  await page.getByRole('link', { name: /Terug naar RowLens voorbeeld/ }).click();
  await expect(page.getByTestId('example-read-only')).toBeVisible();
  await expect(page.getByText(/Annotaties uit andere trainingen/)).toHaveCount(0);
  expect(clubCalls).toEqual([]);
  // Uitleg is text only again.
  await page.locator('.app-header__nav').getByRole('link', { name: 'Uitleg', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uitleg', exact: true })).toBeVisible();
  await expect(page.getByTestId('examples')).toHaveCount(0);
  await expect(page.locator('main video, main button')).toHaveCount(0);
  await page.getByRole('link', { name: 'Kies je club', exact: true }).click();
  await expect(page.locator('#clubs')).toBeInViewport();
  await layout(page);
  await page.screenshot({ path: info.outputPath('help.png'), fullPage: true });
  const example = await exampleNamed(page, 'RowLens voorbeeld');
  // Unnamed clubless registrations can open an example link without inventing a membership.
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
  await page.goto(`./examples/${example.id}`);
  await expect(page.getByRole('heading', { name: 'RowLens voorbeeld', exact: true })).toBeVisible();
  await openFirstVideo(page);
  await layout(page);
});

test('example publisher notes, drawings and boat line are read-only and follow the video frame', async ({
  page,
}, info) => {
  await signIn(page);
  const example = await exampleNamed(page, 'RowLens voorbeeld');
  await page.goto(`./examples/${example.id}`);
  await openFirstVideo(page);
  const notes = page.getByTestId('notes');
  await expect(notes).toContainText('Voorbeeld: rustig inzetten');
  await expect(page.locator('body')).not.toContainText(
    /Hidden private fixture|Hidden other author|Hidden publisher identity/,
  );
  const fingerprint = () =>
    page.locator('video').evaluate((video) => {
      if (!(video instanceof HTMLVideoElement)) throw new Error('Missing synthetic video');
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing synthetic frame canvas');
      context.drawImage(video, 0, 0, 64, 36);
      return Array.from(context.getImageData(0, 0, 64, 36).data).reduce(
        (hash, value) => (Math.imul(hash, 31) + value) | 0,
        0,
      );
    });
  const initialPicture = await fingerprint();
  await notes.getByRole('button', { name: /Naar frame 10/ }).click();
  await expect(page.locator('video')).toBeInViewport({ ratio: 0.5 });
  await expect(page.getByTestId('player-frame')).toHaveText('10');
  // A correct counter alone must not hide a decoder that is still displaying the initial picture.
  await expect.poll(fingerprint).not.toBe(initialPicture);
  const layer = page.locator('.drawing-layer');
  // The publisher's line, arrow and angle, like on any video's frame.
  await expect(layer.locator('[data-kind]')).toHaveCount(3);
  await expect(page.getByTestId('video-note-overlay')).toContainText('Voorbeeld: rustig inzetten');
  await expect(page.locator('.drawing--pickable')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen|Delen/ })).toHaveCount(0);
  // As on every video, the boat line is shown with the Angles tab.
  await page.getByRole('tab', { name: /Hoeken/ }).click();
  await expect(layer.locator('.drawing--boat')).toHaveCount(1);
  await expect(layer.locator('[data-kind]')).toHaveCount(4);
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
  // A long-lived new client can briefly meet an older server after a rollback.
  await page.route('**/api/examples/*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { videos?: { annotations?: unknown }[] };
    if (body.videos) for (const clip of body.videos) delete clip.annotations;
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByTestId('notes').getByTestId('moment')).toHaveCount(0);
  await expect(page.getByText('Geen notities om te tonen.')).toBeVisible();
});

test('a training a RowLens admin creates is an example in the list; rename uses the normal title edit', async ({
  page,
}, info) => {
  await signIn(page, adminEmail);
  await page.goto('./sessions');
  await page.getByRole('button', { name: 'Nieuwe training', exact: true }).click();
  const create = page.locator('form', {
    has: page.getByRole('heading', { name: 'Nieuwe training', exact: true }),
  });
  await create
    .getByRole('combobox', { name: 'Club', exact: true })
    .selectOption({ label: 'Gamma voorbeeldclub' });
  const title = `Nieuw voorbeeld ${info.project.name}`;
  await create.getByLabel('Titel', { exact: true }).fill(title);
  await create.getByLabel('Datum', { exact: true }).fill('2026-11-16');
  await create.getByLabel('Boot', { exact: true }).selectOption('C2x');
  const created = page.waitForResponse(
    (r) => r.url().includes('/api/sessions') && r.request().method() === 'POST',
  );
  await create.getByRole('button', { name: 'Training aanmaken', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(
    page.getByText('Dit is een voorbeeld voor alle ingelogde gebruikers.', { exact: false }),
  ).toBeVisible();
  // Already an example, so there is nothing to publish.
  await expect(page.getByTestId('publish-example')).toHaveCount(0);
  const renamed = `${title} hernoemd`;
  await page.getByRole('button', { name: 'Naam aanpassen', exact: true }).click();
  await page.getByLabel('Naam van de training', { exact: true }).fill(renamed);
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();
  await layout(page);
  await page.screenshot({ path: info.outputPath('admin-example-training.png'), fullPage: true });
  // Members of other clubs find it in their own list, under their own club filter.
  await page.context().clearCookies();
  await signIn(page);
  await page.goto('./sessions');
  const link = page.getByTestId('session-list').getByRole('link', { name: renamed, exact: true });
  await expect(link).toBeVisible();
  await expect(
    page
      .getByTestId('session-list')
      .locator('tr', { has: page.getByRole('link', { name: renamed, exact: true }) })
      .getByTestId('example-badge'),
  ).toBeVisible();
  await link.click();
  await expect(page.getByTestId('example-read-only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Naam aanpassen', exact: true })).toHaveCount(0);
});

test('RowLens admin publishes an existing training from the training itself, with confirmation', async ({
  page,
}, info) => {
  await signIn(page, adminEmail);
  const title = `Bestaand voorbeeld ${info.project.name}`;
  await page.goto(`./sessions?clubFilter=all&q=${encodeURIComponent(title)}`);
  const row = page.getByTestId('session-list').getByRole('link', { name: title, exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const publish = page.getByTestId('publish-example');
  await publish.getByRole('button', { name: 'Publiceren als voorbeeld', exact: true }).click();
  const confirm = publish.getByTestId('confirm');
  await expect(confirm).toContainText('Alle ingelogde gebruikers');
  await expect(confirm).toContainText('jouw eigen bestaande en toekomstige notities');
  await confirm.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await publish.getByRole('button', { name: 'Publiceren als voorbeeld', exact: true }).click();
  await page.route('**/api/example-management/*/publish*', (route) =>
    route.fulfill({ status: 503, json: { error: 'synthetic_failure' } }),
  );
  await confirm.getByRole('button', { name: 'Voorbeeld publiceren', exact: true }).click();
  await expect(publish.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/example-management/*/publish*');
  for (const height of await publish
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height)))
    expect(height).toBeGreaterThanOrEqual(43.5);
  await layout(page);
  await publish.screenshot({ path: info.outputPath('publish-confirm.png') });
  await confirm.getByRole('button', { name: 'Voorbeeld publiceren', exact: true }).click();
  await expect(publish).toHaveCount(0);
  await expect(
    page.getByText('Dit is een voorbeeld voor alle ingelogde gebruikers.', { exact: false }),
  ).toBeVisible();
  const example = await exampleNamed(page, title);
  // The creator keeps their own training (with the badge); the example view shows only the
  // publisher's notes, as any other signed-in account sees them.
  await page.context().clearCookies();
  await signIn(page);
  await page.goto('./sessions?clubFilter=all');
  await expect(
    page
      .getByTestId('session-list')
      .locator('tr', { has: page.getByRole('link', { name: title, exact: true }) })
      .getByTestId('example-badge'),
  ).toBeVisible();
  await page.goto(`./examples/${example.id}`);
  await openFirstVideo(page);
  await expect(page.getByTestId('notes')).toContainText('Gepubliceerd door beheerder');
  await expect(page.locator('body')).not.toContainText('Hidden original creator feedback');
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen|Delen/ })).toHaveCount(0);
  await layout(page);
});
