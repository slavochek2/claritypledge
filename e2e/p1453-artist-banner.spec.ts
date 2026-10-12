/**
 * @file p1453-artist-banner.spec.ts
 * @description P1453: artist-style profile banners signed "after <artist>".
 *
 * Seeded tests (no image generation, no Gemini spend):
 * - smoke: a credited profile renders with no console errors
 * - a visitor sees "after <sig>", the AI disclosure in the alt text, and the disclosure on tap
 * - removing the banner removes the signature (the stale credit is never shown)
 * - an existing banner without a credit is left alone: owner visit does not regenerate, no signature
 *
 * Live test (generates one real banner; P1453_LIVE_GEN=1):
 * - a new user visiting their own profile gets an artist banner with a signature (P504 lazy path)
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const IMAGE = '/clarity-pledge-icon.png'; // any image the dev server serves
const CREDIT = {
  url: IMAGE, artist: 'Katsushika Hokusai', sig: 'Hokusai', movement: 'Ukiyo-e', ink: 'cream', fidelity: 'pass',
};

test.describe('P1453 — artist banner signature (seeded)', () => {
  test.setTimeout(60000);
  let owner: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P1453 Banner Owner' });
  });

  test.afterAll(async () => {
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  async function seed(bannerUrl: string | null, credit: typeof CREDIT | null) {
    const { error } = await supabaseAdmin.from('profiles')
      .update({ banner_url: bannerUrl, banner_credit: credit, banner_generation_attempted: true })
      .eq('id', owner.user.id);
    expect(error).toBeNull();
  }

  test('smoke: page loads and has no console errors', async ({ page }) => {
    await seed(IMAGE, CREDIT);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/p/${owner.slug}`);
    await expect(page.getByTestId('banner-credit')).toBeVisible({ timeout: 15000 });
    expect(errors.filter((e) => /banner|credit|font|Caveat/i.test(e))).toEqual([]);
  });

  test('a visitor sees the signature, the AI disclosure in alt text, and the disclosure on tap', async ({ page }) => {
    await seed(IMAGE, CREDIT);
    await page.goto(`/p/${owner.slug}`);
    const sig = page.getByTestId('banner-credit');
    await expect(sig).toHaveText('after Hokusai', { timeout: 15000 });
    await expect(page.getByAltText('AI-generated banner after Katsushika Hokusai')).toBeVisible();
    await sig.click();
    await expect(page.getByText('AI-generated image after Katsushika Hokusai')).toBeVisible();
    const font = await sig.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toContain('Caveat');
  });

  test('a removed banner shows no signature, even though the old credit is still stored', async ({ page }) => {
    await seed(null, CREDIT);
    await page.goto(`/p/${owner.slug}`);
    await expect(page.getByText(owner.name ?? 'P1453 Banner Owner').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('banner-credit')).toHaveCount(0);
  });

  test('an existing banner without a credit is left alone: no regeneration on the owner visit, no signature', async ({ page }) => {
    await seed(IMAGE, null);
    await setTestSession(page, owner.email);
    let generateCalls = 0;
    await page.route('**/functions/v1/generate-banner', (r) => { generateCalls++; return r.abort(); });
    await page.goto(`/p/${owner.slug}`);
    await expect(page.locator(`img[src="${IMAGE}"]`).first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(generateCalls).toBe(0);
    await expect(page.getByTestId('banner-credit')).toHaveCount(0);
    const { data } = await supabaseAdmin.from('profiles').select('banner_url').eq('id', owner.user.id).single();
    expect(data!.banner_url).toBe(IMAGE);
  });
});

test.describe('P1453 — new user gets an artist banner (live generation)', () => {
  test.skip(process.env.P1453_LIVE_GEN !== '1', 'generates a real banner — set P1453_LIVE_GEN=1');
  test.setTimeout(180000);
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1453 New User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('visiting your own profile for the first time generates a signed artist banner', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto(`/p/${user.slug}`);
    const sig = page.getByTestId('banner-credit');
    await expect(sig).toBeVisible({ timeout: 150000 });
    await expect(sig).toHaveText(/^after \S/);
    const { data } = await supabaseAdmin.from('profiles')
      .select('banner_url, banner_credit').eq('id', user.user.id).single();
    expect((data!.banner_credit as { url: string }).url).toBe(data!.banner_url);
  });
});
