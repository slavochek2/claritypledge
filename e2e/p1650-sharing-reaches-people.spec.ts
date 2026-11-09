/**
 * @file p1650-sharing-reaches-people.spec.ts
 * @description P1650 client half, in the browser against the TEST DB. Two parties: owner O and a person J who is in O's
 * scope (a witness) but shares NO chat reason with O.
 *
 *   1. smoke: the owner's canvas opens and its Share panel loads
 *   2. focusing the Share field at 320px lists the PEOPLE before the owner's events and groups, and no row overlaps another
 *   3. sharing with J opens the 1:1 and posts a canvas card; J sees the card and it opens for J
 *   4. the paperclip in that 1:1 is labelled "Attach", has a Canvases tab, lists the canvas J is on directly and not one
 *      that was never shared, and attaching it sends a second card
 *
 * Every absence has a control (the shared canvas IS listed; the unshared one is not).
 * Run: npx playwright test e2e/p1650-sharing-reaches-people.spec.ts --workers=1 > /tmp/pw.log 2>&1
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { purgeChatFor } from './helpers/test-chat';

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1650ui${RUN}`;
const SHARED = `p1650s${RUN}`.toLowerCase();
const UNSHARED = `p1650u${RUN}`.toLowerCase();
const LONG_EVENT = `P1650 a very long mastermind title that must wrap onto a second line and never run into the row below it ${RUN}`;

let O: TestUser, J: TestUser;
let E: TestEvent;
const pointIds: string[] = [];
let conversationId: string | null = null;

const url = (name: string) => `/p/${O.slug}/canvas/${name}`;

async function mkPoint(canvas: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} point on ${canvas}`, first_validator_id: O.user.id, visibility: 'private', tags: [TAG],
    system_tags: [`canvas_${canvas}`, 'canvas:problem'],
  }).select('id').single();
  if (error) throw new Error(`[P1650 fixture] point: ${error.message}`);
  pointIds.push(data.id as string);
}
async function waitForCanvas(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}
async function dmId(): Promise<string | null> {
  const [lo, hi] = O.user.id < J.user.id ? [O.user.id, J.user.id] : [J.user.id, O.user.id];
  const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'dm').eq('dm_user_a', lo).eq('dm_user_b', hi);
  return data?.[0]?.id ?? null;
}
async function canvasCards(conv: string): Promise<number> {
  const { data } = await supabaseAdmin.from('chat_messages').select('id').eq('conversation_id', conv).eq('attachment_kind', 'canvas');
  return data?.length ?? 0;
}

test.describe('P1650: sharing reaches people', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    O = await createTestUser({ name: `P1650 Owner ${RUN}` });
    J = await createTestUser({ name: `P1650 Jean ${RUN}` });
    // J is in O's scope through a witness row, which is NOT a reason to chat: no 1:1 exists yet.
    const w = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `${TAG} w`, witness_profile_id: J.user.id });
    if (w.error) throw new Error(`[P1650 fixture] witness: ${w.error.message}`);
    E = await createTestEvent(O.user.id, new Date(Date.now() + 2 * 86_400_000), { title: LONG_EVENT });
    await mkPoint(SHARED);
    await mkPoint(UNSHARED);
    expect(await dmId(), 'no 1:1 before the share').toBeNull();
  });

  test.afterAll(async () => {
    test.setTimeout(300_000);
    const ids = [O, J].filter(Boolean).map(u => u.user.id);
    if (ids.length) await purgeChatFor(ids, conversationId ? [conversationId] : []);
    if (pointIds.length) await supabaseAdmin.from('points').delete().in('id', pointIds);
    await supabaseAdmin.from('witnesses').delete().like('witness_name', `${TAG}%`);
    if (E) await deleteTestEvent(E.id);
    for (const u of [O, J]) if (u) await deleteTestUser(u.user.id);
  });

  test('smoke: the owner opens the canvas and the Share panel loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await setTestSession(page, O.email);
    await page.goto(url(SHARED));
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    await expect(page.getByTestId('canvas-share-panel')).toBeVisible();
    await expect(page.getByTestId('canvas-share-owner')).toBeVisible();
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  test('at 320px, focusing the Share field lists people before events and groups, and no row overlaps another', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => window.innerWidth), 'the resize took effect').toBe(320);
    await setTestSession(page, O.email);
    await page.goto(url(SHARED));
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    await expect(page.getByTestId('canvas-share-owner')).toBeVisible();
    await page.getByTestId('canvas-share-invite').focus();
    const list = page.getByTestId('canvas-share-options');
    await expect(list).toBeVisible();

    // The person is offered before anything is typed, and appears before the event.
    const labels = await page.getByTestId('canvas-share-option-label').allTextContents();
    const person = labels.findIndex(l => l.includes(`P1650 Jean ${RUN}`));
    const event = labels.findIndex(l => l.includes(LONG_EVENT));
    expect(person, `J is listed: ${labels.join(' | ')}`).toBeGreaterThanOrEqual(0);
    expect(event, 'the long event is listed (CONTROL)').toBeGreaterThanOrEqual(0);
    expect(person).toBeLessThan(event);
    const headings = await page.getByTestId('canvas-share-section').allTextContents();
    expect(headings.indexOf('People')).toBeLessThan(headings.indexOf('Events'));

    // No row overlaps the next, and the long title wraps to at most two lines (its row is taller than one line, not clipped).
    const rows = page.getByTestId('canvas-share-option');
    const count = await rows.count();
    let prevBottom = -Infinity;
    for (let i = 0; i < count; i++) {
      const box = (await rows.nth(i).boundingBox())!;
      expect(box.y, `row ${i} starts below the previous one`).toBeGreaterThanOrEqual(prevBottom - 0.5);
      prevBottom = box.y + box.height;
    }
    const longLabel = page.getByTestId('canvas-share-option-label').nth(event);
    const lineHeights = await longLabel.evaluate(el => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }));
    expect(lineHeights.h, 'at most two lines').toBeLessThanOrEqual(lineHeights.lh * 2 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'no sideways scroll').toBeLessThanOrEqual(320);
  });

  test('sharing with J opens the 1:1 with a canvas card, and the card opens for J', async ({ page, browser }) => {
    await setTestSession(page, O.email);
    await page.goto(url(SHARED));
    await waitForCanvas(page);
    await page.getByTestId('canvas-share-control').click();
    await expect(page.getByTestId('canvas-share-owner')).toBeVisible();
    await page.getByTestId('canvas-share-invite').focus();
    await page.getByTestId('canvas-share-option').filter({ hasText: `P1650 Jean ${RUN}` }).click();
    await expect(page.getByTestId('canvas-share-entry').filter({ hasText: `P1650 Jean ${RUN}` })).toBeVisible();
    // Delivered: the panel does not say it was not sent to chat.
    await expect(page.getByTestId('canvas-share-not-sent')).toHaveCount(0);

    await expect.poll(async () => { conversationId = await dmId(); return conversationId ? await canvasCards(conversationId) : 0; }, { timeout: 20_000 }).toBe(1);

    const ctx = await browser.newContext();
    const pageJ = await ctx.newPage();
    await setTestSession(pageJ, J.email);
    await pageJ.goto(`/chats/c/${conversationId}`);
    const card = pageJ.getByTestId('attachment-canvas');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(pageJ).toHaveURL(new RegExp(`/p/${O.slug}/canvas/${SHARED}`));
    await waitForCanvas(pageJ);
    await ctx.close();
  });

  test('the paperclip is "Attach", lists the canvas J is on directly and not the unshared one, and attaching sends a card', async ({ page }) => {
    await setTestSession(page, O.email);
    await page.goto(`/chats/c/${conversationId}`);
    const clip = page.getByRole('button', { name: 'Attach', exact: true });
    await expect(clip).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Attach a point or story' })).toHaveCount(0);
    await clip.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Canvases' }).click();
    const cards = dialog.getByTestId('attach-card-canvas');
    await expect(cards).toHaveCount(1); // the shared canvas; the one never shared is absent
    await cards.first().locator('xpath=ancestor::li[1]').getByRole('button', { name: /^Attach / }).click();
    await expect(page.getByTestId('staged-attachment')).toBeVisible();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => canvasCards(conversationId!), { timeout: 20_000 }).toBe(2);
  });
});
