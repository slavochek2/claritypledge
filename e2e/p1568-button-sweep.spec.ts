/**
 * @file p1568-button-sweep.spec.ts
 *
 * P1568 visual sweep: the main flows at 1280, 375 and 320 after the default Button became blue.
 * Screenshots go to test-results/p1568/ for a separate visual-QA review. Each page also asserts
 * no Button renders the old near-black default fill (bg-primary) unless it opted in with variant="dark".
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { mirrorOf, signIn } from './helpers/test-chat';

const SIZES = [{ w: 1280, h: 800 }, { w: 375, h: 760 }, { w: 320, h: 640 }];
const PUBLIC = ['/', '/events', '/tree/design-buttons'];
let SIGNED_IN = ['/feed', '/home', '/settings', '/letters', '/live'];

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

let user: TestUser;
let pointId: string;

test.beforeAll(async () => {
  user = await createTestUser({ name: `P1568 Sweep ${Date.now().toString(36)}` });
  pointId = (await createTestPoint(user.user.id)).id;
  // A point page, and the mirror chat whose greeting carries an inline blue button (rule 8).
  SIGNED_IN = [...SIGNED_IN, `/point/${pointId}`, `/home/c/${await mirrorOf(await signIn(user))}`];
});

test.afterAll(async () => {
  await deleteTestPoint(pointId).catch(() => {});
  await deleteTestUser(user.user.id).catch(() => {});
});

async function shoot(page: Page, path: string, w: number) {
  await page.goto(path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  const slug = path === '/' ? 'home-public' : path.startsWith('/point/') ? 'point' : path.startsWith('/home/c/') ? 'mirror' : path.replace(/\//g, '_').replace(/^_/, '');
  await page.screenshot({ path: `test-results/p1568/${slug}-${w}.png`, fullPage: true });
}

for (const { w, h } of SIZES) {
  test(`public pages at ${w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    for (const p of PUBLIC) await shoot(page, p, w);
    await ctx.close();
  });

  test(`signed-in pages at ${w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await setTestSession(page, user.email);
    for (const p of SIGNED_IN) await shoot(page, p, w);
    await ctx.close();
  });
}

test('no Button keeps the old black default fill', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  // Control: the reference page shows variant="dark" once, so the probe must find it there.
  await page.goto('/tree/design-buttons');
  await expect(page.locator('button.bg-primary').first()).toBeVisible();
  await setTestSession(page, user.email);
  for (const p of [...PUBLIC.filter((x) => x !== '/tree/design-buttons'), ...SIGNED_IN]) {
    await page.goto(p);
    await page.waitForLoadState('networkidle').catch(() => {});
    const black = await page.locator('button.bg-primary').count();
    expect(black, `${p}: buttons with the old black default fill`).toBe(0);
  }
  await ctx.close();
});
