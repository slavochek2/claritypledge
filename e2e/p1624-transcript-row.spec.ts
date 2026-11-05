/**
 * @file p1624-transcript-row.spec.ts
 * @description P1624 in a real browser on the real backend, two people: a session root reads as a transcript and opens its thread,
 * transcript text adds no count, and a person's reply appears live with its face. P1624_SHOT_DIR also takes the review screenshots.
 */
import { test, expect as baseExpect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestMembership, createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { supabaseAdmin } from './helpers/supabase-admin';
import { purgeChatFor, signIn, ok, type SignedIn } from './helpers/test-chat';

const SHOT_DIR = process.env.P1624_SHOT_DIR ?? '';
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let a: TestUser;
let b: TestUser;
let org: TestOrganization;
let sA: SignedIn;
let dm: string;
let rootId: string;
let part2Id: string;

const insert = async (row: Record<string, unknown>): Promise<string> => {
  const { data, error } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: dm, ...row }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
};
const shoot = async (page: Page, name: string) => {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

test.beforeAll(async () => {
  a = await createTestUser({ name: 'P1624 Asha' });
  b = await createTestUser({ name: 'P1624 Ben' });
  org = await createTestOrganization({ name: `P1624 org ${Date.now()}` });
  await createTestMembership(org.id, a.user.id);
  await createTestMembership(org.id, b.user.id);
  sA = await signIn(a);
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: b.user.id }), 'start dm');
  rootId = await insert({ author_id: null, body: 'session|2026-11-05T12:37:00Z|1', system_kind: 'outside_rounds' });
  await insert({ author_id: a.user.id, body: 'Words someone said in the session.', thread_root_id: rootId, is_transcription: true });
  part2Id = await insert({ author_id: null, body: 'session|2026-11-05T13:37:00Z|2|i', system_kind: 'outside_rounds' });
});

test.afterAll(async () => {
  await purgeChatFor([a.user.id, b.user.id], [dm]);
  await deleteTestUser(a.user.id).catch(() => {});
  await deleteTestUser(b.user.id).catch(() => {});
  await deleteTestOrganization(org.id);
});

test('the row reads as a transcript, opens its thread, and counts people live', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await setTestSession(page, a.email);
  await page.goto(`/chats/c/${dm}`);
  const row = page.locator(`[data-msg="${rootId}"]`);
  const open = row.getByTestId('transcript-open');
  await expect(open).toContainText('Open transcript');
  await expect(row.getByTestId('replies-link')).toHaveCount(0);
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(`[data-msg="${part2Id}"]`).getByTestId('transcript-meta')).toContainText('Part 2');
  await shoot(page, 'desktop');
  await open.hover();
  await shoot(page, 'desktop-hover');
  await open.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await shoot(page, 'desktop-focus');

  // The other person replies in the thread: the row shows it without a reload.
  const sB = await signIn(b);
  await ok(sB.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'A reply from a person', p_thread_root: rootId }), 'reply');
  await expect(row.getByTestId('replies-link')).toContainText('1 reply');
  // More transcript text adds nothing.
  await insert({ author_id: a.user.id, body: 'More words.', thread_root_id: rootId, is_transcription: true });
  await page.waitForTimeout(2_000);
  await expect(row.getByTestId('replies-link')).toContainText('1 reply');
  await page.reload();
  await expect(row.getByTestId('replies-link')).toContainText('1 reply');

  // Keyboard: Enter on the row opens the thread, with the same title as before.
  await row.getByTestId('transcript-open').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/t/${rootId}`));
  await expect(page.getByText('Words someone said in the session.')).toBeVisible();
  await expect(page.getByText(/^Transcript Nov 5/).locator('visible=true').first()).toBeVisible();
  await shoot(page, 'desktop-thread');
  await ctx.close();
});

for (const [name, width] of [['375', 375], ['320', 320]] as const) {
  test(`no overflow at ${name}px, light and dark`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 700 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await setTestSession(page, a.email);
    await page.goto(`/chats/c/${dm}`);
    const part2 = page.locator(`[data-msg="${part2Id}"]`).getByTestId('transcript-open');
    await expect(part2).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = (await part2.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // Settled, so both themes show one state: the count and its face have both arrived.
    const replies = page.locator(`[data-msg="${rootId}"]`).getByTestId('replies-link');
    await expect(replies).toContainText('1 reply');
    await expect(replies.getByTestId('gravatar-avatar')).toBeVisible();
    await shoot(page, `m${name}`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await shoot(page, `m${name}-dark`);
    await ctx.close();
  });
}
