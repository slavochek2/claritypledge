import { test, expect } from '@playwright/test';

test.describe('P987: CP Front-Door Realignment', () => {
  test('UAT-1/2/5/6/8: hero, CTA, stat, closing, no pledge content', async ({ page }) => {
    await page.goto('/');

    // Hero (split across <br> + timed-reveal span — match the h1 container)
    const heroH1 = page.locator('h1', { hasText: /De-risk misalignment with/i });
    await expect(heroH1).toBeVisible();
    await expect(heroH1).toContainText('your next key hire', { timeout: 5000 });

    // Single primary CTA
    const cta = page.getByRole('link', { name: /get your free alignment audit/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /\/intro/);

    // Live-session disclosure (sub-copy near hero, before booking)
    await expect(page.getByText(/live 1:1 session/i)).toBeVisible();

    // No "Take the Pledge" secondary CTA
    await expect(page.getByRole('link', { name: /take the pledge/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /take the pledge/i })).toHaveCount(0);

    // Stat — worded to source
    await expect(page.getByText(/nearly half of new hires fail within 18 months/i)).toBeVisible();
    await expect(page.getByText(/attitude, not skill/i)).toBeVisible();
    await expect(page.getByText(/5 out of 10/i)).toHaveCount(0);

    // Closing copy
    await expect(page.getByText(/your new hire nods/i)).toBeVisible();
    await expect(page.getByText(/stop before they quit/i)).toBeVisible();
    await expect(page.getByText(/stop before they split/i)).toHaveCount(0);

    // No co-founder / pledge / price wording in hero region
    await expect(page.getByText(/i've lost co-founders/i)).toHaveCount(0);
    await expect(page.getByText(/€950/i)).toHaveCount(0);
  });

  test('UAT-3: old co-founder homepage reachable at /tree/old-landing-2 (dev)', async ({ page }) => {
    await page.goto('/tree/old-landing-2');
    await expect(page.getByText(/co-founders/i).first()).toBeVisible();
  });

  test('UAT-4: /about -> Work with Slava reachable', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('link', { name: /work with slava/i }).first()).toBeVisible();
  });

  test('UAT-9: ?referrer and ?login redirects still fire', async ({ page }) => {
    await page.goto('/?login=1');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    await page.goto('/?referrer=test_verify_x');
    await expect(page).toHaveURL(/\/sign-pledge/, { timeout: 10000 });
  });

  test('UAT-10: /program out of nav, still reachable, noindex, price kept', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /co-founder program/i })).toHaveCount(0);

    await page.goto('/program');
    await expect(page.getByText(/€950/i).first()).toBeVisible();
    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute('content', /noindex/i);
  });
});
