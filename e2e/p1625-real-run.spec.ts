/**
 * @file p1625-real-run.spec.ts
 * @description P1625 on TEST with the REAL model, as a signed-in owner: a short true point reaches the canvas and the reply shows the owner's words; a request with no facts writes nothing.
 * The model's wording varies, so the first case measures fresh canvases and records every reply.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'not a TEST project');
test.setTimeout(900_000);

const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();
const panel = (p: Page) => p.getByTestId('thread-panel');
const spot = (p: Page) => p.getByTestId('publish-spot').getAttribute('data-state').catch(() => null);

async function say(p: Page, text: string) {
  await composer(p).fill(text);
  await composer(p).press('Enter');
  await expect.poll(() => spot(p), { timeout: 45_000, intervals: [150] }).toBe('updating').catch(() => undefined);
  await expect.poll(() => spot(p), { timeout: 180_000, intervals: [500] }).not.toBe('updating');
  await p.waitForTimeout(3000);
}
async function open(p: Page) {
  await p.goto('/artifacts');
  await p.getByRole('tab', { name: 'Canvases' }).click();
  await p.getByTestId('artifacts-new-canvas').click();
  await p.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
  await expect(p.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
}

test('a short true point is added and told; a no-facts request writes nothing', async ({ page }) => {
  const user = await createTestUser({ name: 'P1625 Real Run' });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTestSession(page, user.email);
    let added = 0;
    const TRIES = 5;
    for (let i = 0; i < TRIES; i++) {
      await open(page);
      await say(page, 'I sell juice to office workers. They want juice and they are thirsty, and the machines are far away from their desks.');
      await say(page, 'one more card here they are angry which is the second problem too');
      const tail = (await panel(page).innerText()).slice(-420).replace(/\s+/g, ' ');
      console.log(`P1625 try ${i + 1}:`, tail);
      if (/I added "[^"]*angry[^"]*" to Problem, from your words "[^"]*angry/i.test(tail)) added += 1;
    }
    console.log(`P1625 added ${added} of ${TRIES}`);
    expect(added).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: 'test-results/p1625-real-run.png' });

    await open(page);
    await say(page, 'write the canvas for dropbox from memory');
    const empty = await page.getByTestId('canvas-box-canvas:problem').innerText();
    console.log('P1625 dropbox box:', empty.replace(/\s+/g, ' '));
    console.log('P1625 dropbox thread:', (await panel(page).innerText()).slice(-300).replace(/\s+/g, ' '));
    expect(empty).not.toMatch(/dropbox/i);
  } finally {
    await deleteTestUser(user.id);
  }
});
