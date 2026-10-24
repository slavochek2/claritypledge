/**
 * @file p1554-mirror-polish.spec.ts
 *
 * P1554 mirror chat polish in the real UI on the test project. Needs no AI: answers are seeded.
 *
 *  1. smoke: the empty mirror greets first, with one "Give me a name" button that opens Rename.
 *  2. a seeded chat: a quiet share has no answer; an answer to the message directly above shows no quote,
 *     an answer to an older message shows one; no "You decide what fits." footer; the mirror avatar is square;
 *     scrolled up, the round jump-down button shows and takes the reader back to the newest message.
 *  3. the More menu has no Rename; the About window has Rename, buttons centered.
 *
 * Screenshots at 1280, 375 and 320 go to test-results/p1554/.
 */
import { test, expect as baseExpect, type Browser, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';
import { mirrorOf, purgeChatFor, signIn } from './helpers/test-chat';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const expect = baseExpect.configure({ timeout: 30_000 });
const SIZES = [{ w: 1280, h: 800 }, { w: 375, h: 760 }, { w: 320, h: 640 }];

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let empty: TestUser;
let seeded: TestUser;
let mirrorEmpty: string;
let mirrorSeeded: string;
let pointId: string;
const firstQ = `First question ${RUN}`;
const secondQ = `Second question ${RUN}`;
const answerAdjacent = `Answer to the second ${RUN}`;
const answerOlder = `Answer to the first ${RUN}`;

async function open(browser: Browser, user: TestUser, w: number, h: number): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setTestSession(page, user.email);
  return { page, errors, close: () => ctx.close() };
}

/** Screenshots only after open/close animations end (Radix runs ~200ms). */
const settle = (page: Page) => page.waitForTimeout(500);

async function insert(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabaseAdmin.from('chat_messages').insert(row).select('id').single();
  if (error) throw new Error(`insert: ${error.message}`);
  return data!.id as string;
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  empty = await createTestUser({ name: `Polish Empty ${RUN}` });
  seeded = await createTestUser({ name: `Polish Seeded ${RUN}` });
  mirrorEmpty = await mirrorOf(await signIn(empty));
  mirrorSeeded = await mirrorOf(await signIn(seeded));
  pointId = (await createTestPoint(seeded.user.id)).id;

  const base = { conversation_id: mirrorSeeded };
  // Enough history that the chat is several screens long, for the jump-down button.
  for (let i = 0; i < 30; i++) await insert({ ...base, author_id: seeded.user.id, body: `Earlier note ${i} ${RUN}`, kind: 'message' });
  const q1 = await insert({ ...base, author_id: seeded.user.id, body: firstQ, kind: 'message' });
  await insert({ ...base, author_id: seeded.user.id, body: null, kind: 'message', attachment_kind: 'point', attachment_id: pointId });
  const q2 = await insert({ ...base, author_id: seeded.user.id, body: secondQ, kind: 'message' });
  await insert({ ...base, author_id: null, body: answerAdjacent, kind: 'agent', reply_to_id: q2 });
  await insert({ ...base, author_id: null, body: answerOlder, kind: 'agent', reply_to_id: q1 });
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await purgeChatFor([empty.user.id, seeded.user.id]);
  await deleteTestPoint(pointId).catch(() => {});
  await deleteTestUser(empty.user.id).catch(() => {});
  await deleteTestUser(seeded.user.id).catch(() => {});
});

test('smoke: the empty mirror greets first, with one "Give me a name" button that opens Rename', async ({ browser }) => {
  for (const { w, h } of SIZES) {
    const { page, errors, close } = await open(browser, empty, w, h);
    try {
      await page.goto(`/home/c/${mirrorEmpty}`);
      const welcome = page.getByTestId('mirror-welcome');
      await expect(welcome).toBeVisible();
      await expect(welcome).toContainText("Hi, I'm your mirror agent. Want to give me a name?");
      await expect(welcome.getByRole('button')).toHaveCount(1);
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/welcome-${w}.png` });
      await welcome.getByRole('button', { name: 'Give me a name' }).click();
      await expect(page.getByRole('dialog').getByLabel(/^Name/)).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/rename-from-welcome-${w}.png` });
      expect(errors, 'no page errors').toEqual([]);
    } finally {
      await close();
    }
  }
});

test('a share is quiet, the quote shows only for an older message, no footer, square avatar', async ({ browser }) => {
  for (const { w, h } of SIZES) {
    const { page, errors, close } = await open(browser, seeded, w, h);
    try {
      await page.goto(`/home/c/${mirrorSeeded}`);
      const adjacent = page.locator('[data-testid="message"]', { hasText: answerAdjacent });
      const older = page.locator('[data-testid="message"]', { hasText: answerOlder });
      await expect(adjacent).toBeVisible();
      await expect(older).toBeVisible();
      await expect(adjacent.getByTestId('reply-quote')).toHaveCount(0);
      await expect(older.getByTestId('reply-quote')).toHaveCount(1);
      await expect(page.getByText('You decide what fits.')).toHaveCount(0);
      await expect(page.getByTestId('mirror-author')).toHaveCount(2);
      const radius = await adjacent.getByTestId('mirror-disc').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect(parseFloat(radius), `square mirror avatar, got ${radius}`).toBeLessThan(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll').toBe(true);
      await expect(page.getByText(/Loading point/)).toHaveCount(0);
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/chat-${w}.png`, fullPage: true });
      const scroller = page.getByTestId('message-scroller');
      await expect(page.getByTestId('jump-down')).toHaveCount(0);
      await scroller.evaluate((el) => { el.scrollTop = 0; });
      const jump = page.getByRole('button', { name: 'Jump to the newest message' });
      await expect(jump).toBeVisible();
      await expect(page.getByTestId('mirror-welcome')).toBeVisible(); // the greeting is the first message
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/jump-${w}.png` });
      await jump.click();
      await expect(older).toBeInViewport();
      await expect(jump).toHaveCount(0);
      expect(errors, 'no page errors').toEqual([]);
    } finally {
      await close();
    }
  }
});

test('the More menu has no Rename; the About window has Rename and centered buttons', async ({ browser }) => {
  for (const { w, h } of SIZES) {
    const { page, errors, close } = await open(browser, seeded, w, h);
    try {
      await page.goto(`/home/c/${mirrorSeeded}`);
      await expect(page.locator('[data-testid="message"]', { hasText: answerOlder })).toBeVisible();
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: /^About / })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/menu-${w}.png` });
      await page.getByRole('menuitem', { name: /^About / }).click();
      const panel = page.getByTestId('mirror-info');
      const rename = panel.getByRole('button', { name: 'Rename' });
      await expect(rename).toBeVisible();
      // The buttons on Rename's row, centered as a group (Rename may sit beside New portrait).
      const offset = await panel.evaluate((el) => {
        const all = [...el.querySelectorAll('button')].map((x) => x.getBoundingClientRect());
        const r = [...el.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Rename')!.getBoundingClientRect();
        const row = all.filter((x) => Math.abs(x.top - r.top) < 4 && x.width > 0);
        const left = Math.min(...row.map((x) => x.left));
        const right = Math.max(...row.map((x) => x.right));
        const p = el.getBoundingClientRect();
        return Math.abs((left + right) / 2 - (p.left + p.right) / 2);
      });
      expect(offset, `About buttons centered (offset ${offset}px)`).toBeLessThan(8);
      await expect(page.getByRole('menu'), 'the More menu closes when About opens').toHaveCount(0);
      await settle(page);
      await page.screenshot({ path: `test-results/p1554/about-${w}.png` });
      expect(errors, 'no page errors').toEqual([]);
    } finally {
      await close();
    }
  }
});
