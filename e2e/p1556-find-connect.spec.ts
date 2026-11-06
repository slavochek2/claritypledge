/**
 * @file p1556-find-connect.spec.ts
 * @description P1556 in a real browser: the code sheet from all three places, the handle on a profile, exact-handle
 * search, the signed-out connect page, and opening a code signed in landing in the chat. Screenshots go to
 * test-results/p1556/ for visual QA. Server rules: e2e/integration/p1556-contact-code.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';
import { purgeChatFor } from './helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const SHOTS = 'test-results/p1556';
let A: TestUser;
let B: TestUser;
let token = '';

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  [A, B] = await Promise.all([createTestUser({ name: `Codeowner P1556` }), createTestUser({ name: `Codescanner P1556` })]);
});

test.afterAll(async () => {
  const ids = [A.user.id, B.user.id];
  await supabaseAdmin.from('contact_code_redemptions').delete().in('owner_id', ids);
  await purgeChatFor(ids);
  await deleteTestUser(A.user.id);
  await deleteTestUser(B.user.id);
});

test('smoke: the chat list loads with My code beside New message, and the sheet shows the code', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setTestSession(page, A.email);
  await page.goto('/chats');
  const myCode = page.getByRole('button', { name: 'My code' });
  await expect(myCode).toBeVisible();
  await expect(page.getByRole('button', { name: 'New message' })).toBeVisible();
  await myCode.click();
  const sheet = page.getByTestId('contact-code-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('contact-code-qr').locator('svg')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Copy link/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Reset code' })).toBeVisible();
  await shot(page, '1-code-sheet-from-chat-list');
  const { data } = await supabaseAdmin.from('contact_codes').select('token').eq('profile_id', A.user.id).single();
  token = data?.token as string;
  expect(token).toMatch(/^[0-9a-f]{32}$/);
  expect(errors).toEqual([]);
});

test('profile: the handle shows and copies, and My code opens the same sheet', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setTestSession(page, A.email);
  await page.goto(`/p/${A.slug}`);
  await expect(page.getByTestId('profile-handle')).toHaveText(new RegExp(`@${A.slug}`));
  await page.getByTestId('profile-handle').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`@${A.slug}`);
  await page.getByRole('button', { name: 'My code' }).first().click();
  await expect(page.getByTestId('contact-code-qr').locator('svg')).toBeVisible();
  await page.waitForTimeout(400); // let the dialog's open animation finish before the screenshot
  await shot(page, '2-code-sheet-from-profile');
});

test('New message: My code first, the partner invite beneath it, and exact-handle search finds a stranger', async ({ page }) => {
  await setTestSession(page, A.email);
  await page.goto('/chats');
  await page.getByRole('button', { name: 'New message' }).click();
  const dialog = page.getByRole('dialog');
  const myCodeRow = dialog.getByRole('button', { name: 'My code' });
  const invite = dialog.getByRole('link', { name: 'Invite a Clarity Partner' });
  await expect(myCodeRow).toBeVisible();
  await expect(invite).toBeVisible();
  // Order in the document, not on-screen position: the dialog animates open, so a box read mid-animation is unreliable.
  const myCodeFirst = await myCodeRow.evaluate(
    (code, inv) => !!(code.compareDocumentPosition(inv as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    await invite.elementHandle(),
  );
  expect(myCodeFirst).toBe(true);
  await dialog.getByRole('searchbox').fill(`@${B.slug.toUpperCase()}`);
  const hit = dialog.getByTestId('new-message-handle-result');
  await expect(hit).toContainText('Codescanner P1556');
  await expect(hit).toContainText('Ask them for their code to message'); // no connection yet
  await expect(dialog.getByTestId('new-message-empty')).toHaveCount(0); // never "No one matches" beside a match
  await shot(page, '3-new-message-exact-handle');
  await myCodeRow.click();
  await expect(page.getByTestId('contact-code-sheet')).toBeVisible();
});

test('signed out, a code shows who it belongs to and offers sign-in that returns to the code', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/connect/${token}`);
  await expect(page.getByRole('heading', { name: 'Codeowner P1556' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Use email' })).toHaveAttribute('href', `/signup?redirect=%2Fconnect%2F${token}`);
  await shot(page, '4-connect-signed-out');
  await page.goto(`/connect/${'0'.repeat(32)}`);
  await expect(page.getByTestId('connect-refused')).toBeVisible();
  await shot(page, '5-connect-code-not-working');
  await ctx.close();
});

test('signed in, opening the code lands in the chat; the owner sees it; Message then shows on the profile', async ({ browser }) => {
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await setTestSession(pageB, B.email);
  // Before the code: a stranger's profile shows the handle but no Message.
  const allowed = pageB.waitForResponse((r) => r.url().includes('/rpc/can_message_profile'));
  await pageB.goto(`/p/${A.slug}`);
  expect(await (await allowed).json()).toBe(false); // the answer arrived, so absence below is real
  await expect(pageB.getByTestId('profile-handle')).toBeVisible();
  await expect(pageB.getByTestId('profile-message')).toHaveCount(0);
  await pageB.goto(`/connect/${token}`);
  await expect(pageB).toHaveURL(/\/chats\/c\/[0-9a-f-]+/, { timeout: 20_000 });
  await expect(pageB.getByRole('textbox').first()).toBeVisible({ timeout: 20_000 });
  await pageB.waitForLoadState('networkidle');
  await shot(pageB, '6-landed-in-chat');
  await pageB.goto(`/p/${A.slug}`);
  await expect(pageB.getByTestId('profile-message')).toBeVisible();
  await shot(pageB, '7-message-on-profile');
  await ctxB.close();

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await setTestSession(pageA, A.email);
  await pageA.goto('/chats');
  await expect(pageA.getByText('Codescanner P1556').first()).toBeVisible({ timeout: 20_000 });
  await ctxA.close();
});
