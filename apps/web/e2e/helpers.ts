import { expect, type Page } from '@playwright/test';
import { pilotCode } from './env.ts';

/** Through the gate like a user (#84). */
export async function signIn(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByLabel(/^(Access code|Toegangscode)$/).fill(pilotCode);
  await page.getByRole('button', { name: /^(Continue|Verder)$/ }).click();
  await expect(page.getByTestId('club-name')).toBeVisible();
}
