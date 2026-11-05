/**
 * @file p1639-real-run.spec.ts
 * @description P1639 on TEST with the REAL model: the owner's own negative with typos, on an empty canvas, is added and told. A reversal is not tested here: the model does not write one on demand.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'not a TEST project');
test.setTimeout(600_000);
const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();
const spot = (p: Page) => p.getByTestId('publish-spot').getAttribute('data-state').catch(() => null);

test('the owner\'s own negative with typos reaches an empty canvas', async ({ page }) => {
  const user = await createTestUser({ name: 'P1639 Real Run' });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, user.email);
    let added = 0;
    const TRIES = 5;
    for (let i = 0; i < TRIES; i++) {
      await page.goto('/artifacts');
      await page.getByRole('tab', { name: 'Canvases' }).click();
      await page.getByTestId('artifacts-new-canvas').click();
      await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
      await expect(page.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
      await composer(page).fill('the probme is peopel dont like jouice');
      await composer(page).press('Enter');
      await expect.poll(() => spot(page), { timeout: 45_000, intervals: [150] }).toBe('updating').catch(() => undefined);
      await expect.poll(() => spot(page), { timeout: 180_000, intervals: [500] }).not.toBe('updating');
      await page.waitForTimeout(3000);
      const tail = (await page.getByTestId('thread-panel').innerText()).slice(-330).replace(/\s+/g, ' ');
      console.log(`P1639 try ${i + 1}:`, tail);
      if (/I added "[^"]*juice[^"]*" to Problem, from your words/i.test(tail)) added += 1;
    }
    console.log(`P1639 added ${added} of ${TRIES}`);
    expect(added).toBeGreaterThanOrEqual(3);
  } finally {
    await deleteTestUser(user.id);
  }
});
