import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { withBasePath } from '../src/shared/base-path.ts';
import { adminEmail, authEmail, edgeUrl } from './env.ts';
import { openProcessedClip, signIn, signOut } from './helpers.ts';
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
async function mutate(page: Page, method: string, path: string, data?: unknown) {
  const csrf =
    (await page.context().cookies()).find((cookie) => cookie.name === 'rowlens_csrf')?.value ?? '';
  return page.request.fetch(withBasePath('/projects/rowlens', path), {
    method,
    headers: {
      origin: new URL(page.url()).origin,
      'x-csrf-token': csrf,
      'sec-fetch-site': 'same-origin',
    },
    ...(data === undefined ? {} : { data }),
  });
}

test('rowers browse other trainings read-only; coach/admin roles can manage every club training', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const tag = `${info.project.name.replace(/\W/g, '')}.${String(Date.now())}`;
  const a = `view.${tag}@example.com`,
    b = `maker.${tag}@example.com`;
  const title = `Club training ${String(Date.now())}`;
  await signIn(page, adminEmail);
  for (const email of [a, b])
    expect(
      (await mutate(page, 'POST', '/api/admin/access', { email, roles: ['rower'] })).status(),
    ).toBe(201);
  const person = await mutate(page, 'POST', '/api/rowers', {
    displayName: `Viewer ${tag}`,
    email: a,
    confirmNew: true,
  });
  expect(person.status()).toBe(201);
  const rower = (await person.json()) as { id: string };
  const device = {
    baseURL: new URL('./', page.url()).href,
    viewport: page.viewportSize(),
    isMobile: info.project.use.isMobile ?? false,
    hasTouch: info.project.use.hasTouch ?? false,
    userAgent: await page.evaluate(() => navigator.userAgent),
  };
  const ca = await browser.newContext(device),
    cb = await browser.newContext(device);
  const viewer = await ca.newPage(),
    maker = await cb.newPage();
  let sessionId: string;
  let videoUrl = '';
  try {
    if (edgeUrl !== undefined) {
      await openProcessedClip(maker, readFileSync(FIXTURE), title, b);
      videoUrl = maker.url();
      const videoId = videoUrl.split('/').at(-1) ?? '';
      const detail = (await (await maker.request.get(`./api/videos/${videoId}`)).json()) as {
        sessionId: string;
      };
      sessionId = detail.sessionId;
      expect(
        (
          await mutate(maker, 'POST', `/api/videos/${videoId}/annotations`, {
            kind: 'note',
            frame: 0,
            body: 'Shared read-only feedback',
          })
        ).status(),
      ).toBe(201);
      expect(
        (
          await mutate(maker, 'PUT', `/api/videos/${videoId}/frames/0/shares`, {
            crew: false,
            rowerIds: [rower.id],
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await mutate(maker, 'POST', `/api/videos/${videoId}/annotations`, {
            kind: 'note',
            frame: 1,
            body: 'Private other-rower feedback',
          })
        ).status(),
      ).toBe(201);
    } else {
      await signIn(maker, b);
      const created = await mutate(maker, 'POST', '/api/sessions', { title, date: '2026-11-06' });
      expect(created.status()).toBe(201);
      sessionId = ((await created.json()) as { id: string }).id;
    }
    await signIn(viewer, a);
    await viewer.goto('./sessions');
    await expect(viewer.getByTestId('session-list')).toContainText(title);
    await viewer.getByRole('link', { name: title, exact: true }).click();
    await expect(viewer.getByTestId('training-read-only')).toBeVisible();
    await expect(viewer.getByRole('button', { name: /^(Rename|Naam aanpassen)$/ })).toHaveCount(0);
    await expect(viewer.locator('input[type=file]')).toHaveCount(0);
    await expect(
      viewer.getByRole('button', { name: /^(Delete session|Training verwijderen)$/ }),
    ).toHaveCount(0);
    await viewer.getByTestId('lineup-fold').locator('summary').click();
    await expect(viewer.getByTestId('lineup-fold').locator('input,select')).toHaveCount(0);
    expect([403, 404]).toContain(
      (await mutate(viewer, 'PATCH', `/api/sessions/${sessionId}`, { title: 'Denied' })).status(),
    );
    expect([403, 404]).toContain(
      (await mutate(viewer, 'DELETE', `/api/sessions/${sessionId}`)).status(),
    );
    const adminDetail = (await (await page.request.get(`./api/sessions/${sessionId}`)).json()) as {
      canEdit: boolean;
    };
    expect(adminDetail.canEdit).toBe(true);
    const width = await viewer.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    await viewer.screenshot({ path: info.outputPath('readonly-training.png'), fullPage: true });
    if (edgeUrl !== undefined) {
      await viewer.goto(videoUrl);
      await expect(viewer.getByTestId('training-read-only')).toBeVisible();
      await expect(viewer.locator('video')).toHaveJSProperty('readyState', 4);
      const notes = viewer.locator('#side-panel-notes');
      await expect(notes).toContainText('Shared read-only feedback');
      await expect(notes).not.toContainText('Private other-rower feedback');
      await expect(notes.locator('textarea,input,button[type=submit]')).toHaveCount(0);
      await expect(viewer.locator('.draw__tools')).toHaveCount(0);
      await expect(notes.getByRole('button', { name: /Delete|Verwijder|delen|Share/ })).toHaveCount(
        0,
      );
      const videoId = videoUrl.split('/').at(-1) ?? '';
      expect([403, 404]).toContain(
        (
          await mutate(viewer, 'POST', `/api/videos/${videoId}/annotations`, {
            kind: 'note',
            frame: 2,
            body: 'Denied',
          })
        ).status(),
      );
      const play = viewer.getByRole('button', { name: /^(Play|Afspelen)$/ });
      if (info.project.use.hasTouch) await play.tap();
      else await play.click();
      await expect
        .poll(() => viewer.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
        .toBeGreaterThan(0.05);
      const pause = viewer.getByRole('button', { name: /^(Pause|Pauzeren)$/ });
      if (info.project.use.hasTouch) await pause.tap();
      else await pause.click();
      await expect(viewer.locator('video')).toHaveJSProperty('paused', true);
      await viewer.screenshot({ path: info.outputPath('readonly-player.png'), fullPage: true });
      // A live role change must refresh capabilities and private-feedback scope without a reload.
      const users = (await (await page.request.get('./api/admin/users')).json()) as {
        entries: { id: string | null; email: string }[];
      };
      const grantId = users.entries.find((entry) => entry.email === a)?.id ?? '';
      expect(
        (
          await mutate(page, 'PATCH', `/api/admin/access/${grantId}`, { roles: ['rower', 'coach'] })
        ).status(),
      ).toBe(204);
      await viewer.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(viewer.getByTestId('training-read-only')).toHaveCount(0);
      await expect(viewer.locator('.draw__tools')).toBeVisible();
      await expect(notes).toContainText('Private other-rower feedback');
      expect(
        (
          await mutate(page, 'PATCH', `/api/admin/access/${grantId}`, { roles: ['rower'] })
        ).status(),
      ).toBe(204);
      await viewer.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(viewer.getByTestId('training-read-only')).toBeVisible();
      await expect(viewer.locator('.draw__tools')).toHaveCount(0);
      await expect(notes).not.toContainText('Private other-rower feedback');
      await expect(notes).toContainText('Shared read-only feedback');
    }
    // A rower still owns what they create; the same page exposes its real editing controls.
    const mine = await mutate(viewer, 'POST', '/api/sessions', {
      title: `Owned ${tag}`,
      date: '2026-11-06',
    });
    expect(mine.status()).toBe(201);
    const own = ((await mine.json()) as { id: string }).id;
    await viewer.goto(`./sessions/${own}`);
    await expect(viewer.getByTestId('training-read-only')).toHaveCount(0);
    await expect(viewer.locator('input[type=file]')).toHaveCount(1);
    await expect(viewer.getByRole('button', { name: /^(Rename|Naam aanpassen)$/ })).toBeVisible();
    // The unrelated coach needs neither authorship nor a crew seat.
    await signOut(page);
    await signIn(page, authEmail);
    await page.goto(`./sessions/${sessionId}`);
    await expect(page.getByTestId('training-read-only')).toHaveCount(0);
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await page.getByRole('button', { name: /^(Rename|Naam aanpassen)$/ }).click();
    await page
      .getByLabel(/^(Session name|Naam van de training)$/)
      .fill('Edited by an unrelated coach');
    await page
      .getByTestId('rename-form')
      .getByRole('button', { name: /^(Save|Opslaan)$/ })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Edited by an unrelated coach',
    );
    expect((await mutate(page, 'DELETE', `/api/sessions/${own}`)).status()).toBe(204);
    expect((await mutate(page, 'DELETE', `/api/sessions/${sessionId}`)).status()).toBe(204);
  } finally {
    await ca.close();
    await cb.close();
  }
});
