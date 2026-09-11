/**
 * P1300: the terms re-acceptance popup, as a returning user meets it on an ordinary page.
 *
 * The popup is the global TermsAcceptanceGate, so it renders over whatever authed route the user
 * opens first — here /groups, where the defect was reported. It may describe the documents only:
 * before the fix it said "This session is recorded for AI Insights" and its "View Terms" link
 * opened a route that has never existed.
 *
 * Runs against the test DB with a throwaway user whose accepted terms version is behind.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

// Any version outside ACCEPTED_TERMS_VERSIONS makes needsTermsAcceptance() return true.
const STALE_TERMS_VERSION = 'v1.3';

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: '375', width: 375, height: 740 },
  { label: '320', width: 320, height: 640 },
];

let staleUser: TestUser;

test.beforeAll(async () => {
  staleUser = await createTestUser({ name: 'P1300 Stale Terms' });
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ accepted_terms_version: STALE_TERMS_VERSION })
    .eq('id', staleUser.user.id);
  if (error) throw error;
});

test.afterAll(async () => {
  if (staleUser) await deleteTestUser(staleUser.user.id);
});

test('smoke: popup on a non-session page describes the documents only, with no console errors', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await setTestSession(page, staleUser.email);
  await page.goto('/groups');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Updated Terms');
  await expect(dialog).toContainText(
    'By continuing, you agree to the updated Terms of Service and Privacy Policy.'
  );
  await expect(dialog).not.toContainText(/session/i);
  await expect(dialog).not.toContainText(/record/i);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    expect(await page.evaluate(() => window.innerWidth)).toBe(vp.width);
    await expect(dialog).toBeVisible();
    const file = testInfo.outputPath(`p1300-popup-${vp.label}.png`);
    await page.screenshot({ path: file });
    console.log(`[P1300] screenshot ${vp.label}: ${file}`);
  }

  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});

test('"View Terms" and "View Privacy Policy" open the documents they name', async ({ page, context }) => {
  await setTestSession(page, staleUser.email);
  await page.goto('/groups');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const termsHref = await dialog.getByRole('link', { name: /view terms/i }).getAttribute('href');
  const privacyHref = await dialog
    .getByRole('link', { name: /view privacy policy/i })
    .getAttribute('href');
  expect(termsHref).toBe('/terms-of-service');
  expect(privacyHref).toBe('/privacy-policy');

  const docs = await context.newPage();
  await docs.goto(termsHref!);
  await expect(docs.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await expect(docs.getByText('Page not found')).toHaveCount(0);

  await docs.goto(privacyHref!);
  await expect(docs.getByText('Page not found')).toHaveCount(0);
  await docs.close();
});

test('Continue still records acceptance and closes the popup', async ({ page }) => {
  await setTestSession(page, staleUser.email);
  await page.goto('/groups');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: /^continue$/i }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('accepted_terms_version')
        .eq('id', staleUser.user.id)
        .single();
      return data?.accepted_terms_version;
    })
    .not.toBe(STALE_TERMS_VERSION);
});
