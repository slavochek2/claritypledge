/**
 * @file p1512-chat-live.spec.ts
 *
 * P1512 Clarity Chat v1, the real UI on the real backend, two browsers:
 *   A and B share a group. A finds B by search and starts a 1:1; B sees it arrive WITHOUT a reload
 *   (list preview, unread badge on the row and on Home); B replies; A sees it live; A edits and
 *   deletes and B sees both live. In the group's General channel A posts, B answers in a thread and
 *   A sees the reply count live. A forwards into the 1:1. A clarifies: the copy lands in A's mirror
 *   and nowhere else.
 *
 * The last test takes the QA screenshots (list, 1:1, channel with thread, forward dialog, mirror)
 * at 1280, 375 and 320 and checks there is no horizontal scroll.
 */
import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestMembership, createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { supabaseAdmin } from './helpers/supabase-admin';
import { purgeChatFor } from './helpers/test-chat';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestSessionInDB } from './helpers/test-session';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const A_NAME = `Alicetest ${RUN}`;
const B_NAME = `Bobtest ${RUN}`;
const C_NAME = `Caroltest ${RUN}`;
const ORG_NAME = `P1512 Chat Org ${RUN}`;
const SHOT_DIR = process.env.P1512_SHOT_DIR ?? '';

// Two browsers against the shared test project: the default 5 s is tight for a chat list's first read.
const expect = baseExpect.configure({ timeout: 30_000 });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let a: TestUser;
let b: TestUser;
let c: TestUser;
const cleanup: Array<() => Promise<unknown>> = [];
let org: TestOrganization;
let ctxA: BrowserContext;
let ctxB: BrowserContext;
let pageA: Page;
let pageB: Page;

async function openAs(browser: Browser, user: TestUser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { ctx, page };
}


/**
 * Cross-browser waits. Realtime can miss an event right after a join (p1114/p1057), and the list view
 * has no slow timer, so while waiting this also does what a person does: comes back to the tab (a
 * focus event), which makes the app re-read. "Realtime itself delivers" proves the delivery path.
 */
async function live(page: Page, assertion: () => Promise<unknown>): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      await assertion();
      return;
    } catch (e) {
      last = e;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }
  }
  throw last;
}

async function dmConversationId(): Promise<string> {
  const dm = await supabaseAdmin
    .from('chat_conversations')
    .select('id')
    .eq('kind', 'dm')
    .or(`dm_user_a.eq.${a.user.id},dm_user_b.eq.${a.user.id}`)
    .single();
  return dm.data!.id as string;
}

/** A phone: real touch events, a mobile viewport, no hover. */
async function openTouch(browser: Browser, user: TestUser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { ctx, page };
}

const SIZES = [
  { w: 1280, h: 800 },
  { w: 375, h: 760 },
  { w: 320, h: 640 },
];
const listReady = async (page: Page) => {
  await expect(page.getByTestId('chat-list').locator('li[data-chat]').first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading chats' })).toHaveCount(0);
};
const noHScroll = async (page: Page, label: string) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal overflow at ${label}`).toBeLessThanOrEqual(0);
};

const row = (page: Page, text: string) => page.locator('[data-testid="chat-list"] li[data-chat]').filter({ hasText: text });
const conversation = (page: Page) => page.getByTestId('conversation');
const composer = (page: Page) => conversation(page).getByTestId('composer').getByRole('textbox');
const sendText = async (page: Page, text: string) => {
  const box = composer(page);
  await box.fill(text);
  await box.press('Enter');
};
const messageWith = (page: Page, text: string) => page.getByTestId('message').filter({ hasText: text }).first();

/** Right-click opens the full message menu at the pointer. */
async function menuOn(page: Page, text: string, item: string) {
  await messageWith(page, text).click({ button: 'right' });
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000); // the first load of a cold dev server is slow
  a = await createTestUser({ name: A_NAME });
  b = await createTestUser({ name: B_NAME });
  c = await createTestUser({ name: C_NAME });
  org = await createTestOrganization({ name: ORG_NAME });
  await createTestMembership(org.id, a.user.id);
  await createTestMembership(org.id, b.user.id);
  await createTestMembership(org.id, c.user.id);
  ({ ctx: ctxA, page: pageA } = await openAs(browser, a));
  ({ ctx: ctxB, page: pageB } = await openAs(browser, b));
});

test.afterAll(async () => {
  test.setTimeout(120_000); // seeded history and two users to delete over a slow link
  await ctxA?.close();
  await ctxB?.close();
  try {
    for (const undo of cleanup.reverse()) await undo().catch(() => undefined);
    await purgeChatFor([a?.user.id, b?.user.id, c?.user.id].filter(Boolean) as string[]);
    if (org) await deleteTestOrganization(org.id);
  } finally {
    if (a) await deleteTestUser(a.user.id);
    if (b) await deleteTestUser(b.user.id);
    if (c) await deleteTestUser(c.user.id);
  }
});

test('smoke: Home is the chat list with the mirror and the group General channel, no console errors', async () => {
  const errors: string[] = [];
  pageA.on('pageerror', (e) => errors.push(e.message));
  await pageA.goto('/home');
  await expect(pageA.getByTestId('chat-list')).toBeVisible();
  await expect(row(pageA, 'mirror')).toBeVisible();
  await expect(row(pageA, `${ORG_NAME} · General`)).toBeVisible();
  await expect(pageA.getByText('Message someone from your groups or events')).toBeVisible();
  await expect(pageA.getByTestId('no-chat-selected')).toBeVisible();
  const text = (await pageA.locator('body').innerText()).toLowerCase();
  expect(text).not.toMatch(/coming soon|placeholder|prototype/);
  expect(errors).toEqual([]);
});

test('A finds B by search, starts a 1:1 and B sees it live with an unread badge', async () => {
  // B is already on Home, so its subscription is up before A writes.
  await pageB.goto('/home');
  await expect(pageB.getByTestId('chat-list')).toBeVisible();
  await pageB.waitForTimeout(2500);

  await pageA.getByLabel('Search chats and people').fill(B_NAME);
  await pageA.getByRole('button', { name: `Message ${B_NAME}` }).click();
  await expect(pageA).toHaveURL(/\/home\/c\//);
  await expect(conversation(pageA).getByRole('heading', { name: B_NAME })).toBeVisible();

  await sendText(pageA, 'hello from A');
  await expect(messageWith(pageA, 'hello from A')).toBeVisible();

  // B: the chat appears in the list, bold with a count, and Home carries the badge. No reload.
  await live(pageB, () => baseExpect(row(pageB, A_NAME)).toBeVisible({ timeout: 6_000 }));
  await expect(row(pageB, A_NAME)).toContainText('hello from A');
  await expect(row(pageB, A_NAME).getByLabel('1 unread')).toBeVisible();
  await expect(pageB.getByRole('link', { name: /^Home, \d+ unread/ })).toBeVisible();

  await row(pageB, A_NAME).getByRole('button').first().click();
  await expect(messageWith(pageB, 'hello from A')).toBeVisible();
  await expect(row(pageB, A_NAME).getByLabel('1 unread')).toHaveCount(0, { timeout: 15_000 });
});

test('Realtime itself delivers: with every message read blocked for A, B messages still arrive', async () => {
  // Proves the delivery path is the Realtime payload, not a refetch hiding behind it. A write sent
  // right after a join can be missed by the replication slot (p1114/p1057), so it is repeated.
  await pageA.route('**/rest/v1/chat_messages**', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
  try {
    let seen = false;
    for (let i = 1; i <= 3 && !seen; i++) {
      const text = `realtime probe ${i}`;
      await sendText(pageB, text);
      seen = await messageWith(pageA, text)
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(seen, 'a message reached A through Realtime alone').toBe(true);
  } finally {
    await pageA.unroute('**/rest/v1/chat_messages**');
  }
});

test('B replies and A sees it live; A edits and deletes and B sees both', async () => {
  await sendText(pageB, 'reply from B');
  await live(pageA, () => baseExpect(messageWith(pageA, 'reply from B')).toBeVisible({ timeout: 6_000 }));

  await menuOn(pageA, 'hello from A', 'Edit');
  const edit = pageA.getByLabel('Edit message');
  await edit.fill('hello from A (v2)');
  await edit.press('Enter');
  await live(pageB, () => baseExpect(messageWith(pageB, 'hello from A (v2)')).toBeVisible({ timeout: 6_000 }));
  await expect(messageWith(pageB, 'hello from A (v2)').getByTestId('edited-mark')).toBeVisible();

  // B has no Edit / Delete on A's message.
  await messageWith(pageB, 'hello from A (v2)').click({ button: 'right' });
  await expect(pageB.getByRole('menuitem', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(pageB.getByRole('menuitem', { name: 'Reply', exact: true })).toBeVisible();
  await pageB.keyboard.press('Escape');

  await menuOn(pageA, 'hello from A (v2)', 'Delete');
  await pageA.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await live(pageB, () => baseExpect(pageB.getByText('Message deleted').first()).toBeVisible({ timeout: 6_000 }));
  await expect(pageB.getByText('hello from A (v2)')).toHaveCount(0);
});

test('General channel: A posts, B replies in a thread, A sees the reply count live', async () => {
  const general = `${ORG_NAME} · General`;
  await pageA.goto('/home');
  await pageB.goto('/home');
  await expect(row(pageA, general)).toBeVisible({ timeout: 20_000 });
  await expect(row(pageB, general)).toBeVisible({ timeout: 20_000 });
  await pageB.waitForTimeout(2500);

  await row(pageA, general).getByRole('button').first().click();
  await row(pageB, general).getByRole('button').first().click();
  await expect(conversation(pageA).getByRole('heading', { name: ORG_NAME })).toBeVisible();

  await sendText(pageA, 'channel post from A');
  await live(pageB, () => baseExpect(messageWith(pageB, 'channel post from A')).toBeVisible({ timeout: 6_000 }));

  // B opens the thread from the message menu (channels only).
  await menuOn(pageB, 'channel post from A', 'Reply in thread');
  await expect(pageB).toHaveURL(/\/t\//);
  const thread = pageB.getByTestId('thread-panel');
  await expect(thread).toBeVisible();
  await thread.getByRole('textbox').fill('thread reply from B');
  await thread.getByRole('textbox').press('Enter');
  await expect(thread.getByText('thread reply from B')).toBeVisible();

  await live(pageA, () => baseExpect(messageWith(pageA, 'channel post from A').getByTestId('replies-link')).toContainText('1 reply', { timeout: 6_000 }));
  await messageWith(pageA, 'channel post from A').getByTestId('replies-link').click();
  await expect(pageA.getByTestId('thread-panel').getByText('thread reply from B')).toBeVisible();
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByTestId('thread-panel')).toHaveCount(0);
});

test('opening a thread or another chat does not remount the page: the conversation stays and the list keeps its tab', async () => {
  const general = `${ORG_NAME} · General`;
  await pageA.goto('/home');
  await pageA.getByRole('tab', { name: 'Channels' }).click();
  await row(pageA, general).getByRole('button').first().click();
  const node = await messageWith(pageA, 'channel post from A').elementHandle();
  expect(node).not.toBeNull();
  await messageWith(pageA, 'channel post from A').getByTestId('replies-link').click();
  await expect(pageA.getByTestId('thread-panel')).toBeVisible();
  expect(await node!.evaluate((n) => n.isConnected), 'the conversation behind the thread was not remounted').toBe(true);
  await expect(pageA.getByRole('status', { name: 'Loading messages' })).toHaveCount(0);
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByRole('tab', { name: 'Channels' })).toHaveAttribute('aria-selected', 'true');
  await pageA.getByRole('tab', { name: 'All' }).click();
});

test('1:1s have no threads; A forwards the channel post into the 1:1 and B sees it', async () => {
  const general = `${ORG_NAME} · General`;
  await row(pageA, general).getByRole('button').first().click();

  await menuOn(pageA, 'channel post from A', 'Forward');
  const dialog = pageA.getByRole('dialog');
  await dialog.getByLabel('Search chats').fill(B_NAME);
  await dialog.getByRole('button', { name: new RegExp(B_NAME) }).click();
  await dialog.getByLabel(/Add a note/).fill('see this');
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(pageA.getByText('Forwarded', { exact: true })).toBeVisible();

  await row(pageA, B_NAME).getByRole('button').first().click();
  // B still has the thread open, which takes the list's place below 2xl: Escape closes it.
  await pageB.keyboard.press('Escape');
  await row(pageB, A_NAME).getByRole('button').first().click();
  const fwd = pageB.getByTestId('forwarded-card');
  await live(pageB, () => baseExpect(fwd).toBeVisible({ timeout: 6_000 }));
  await expect(fwd).toContainText('Forwarded from');
  await expect(fwd).toContainText('channel post from A');

  // The 1:1 offers no thread action.
  await messageWith(pageB, 'see this').click({ button: 'right' });
  await expect(pageB.getByRole('menuitem', { name: 'Reply in thread', exact: true })).toHaveCount(0);
  await pageB.keyboard.press('Escape');
});

test('Clarify copies the message into A mirror only', async () => {
  await row(pageA, B_NAME).getByRole('button').first().click();
  await menuOn(pageA, 'reply from B', 'Clarify');
  await expect(pageA.getByText('Sent to your mirror')).toBeVisible();
  await pageA.locator('[data-sonner-toast]').filter({ hasText: 'Sent to your mirror' }).getByRole('button', { name: 'Open' }).click();
  await expect(conversation(pageA).getByRole('heading', { name: /Alicetest.*'s mirror|Your mirror/ })).toBeVisible();
  await expect(pageA.getByTestId('clarified-card')).toContainText('reply from B');
  await expect(pageA.getByTestId('clarified-card')).toContainText('Clarified from');

  const { data } = await supabaseAdmin.from('chat_messages').select('conversation_id, author_id, kind').eq('kind', 'clarify');
  const mine = (data ?? []).filter((r) => r.author_id === a.user.id);
  expect(mine).toHaveLength(1);
  const { data: conv } = await supabaseAdmin.from('chat_conversations').select('kind, owner_id').eq('id', mine[0]!.conversation_id).single();
  expect(conv).toEqual({ kind: 'mirror', owner_id: a.user.id });
  // Nothing was written to B's side: no clarify row belongs to B or sits in a chat B is in.
  expect((data ?? []).filter((r) => r.author_id === b.user.id)).toHaveLength(0);
});

test('A attaches a point and a story; B sees both cards; a private attachment shows "Not available to you"', async () => {
  const point = await createTestPoint(a.user.id, { statement: `Attach point ${RUN}`, tags: ['clarity'] });
  cleanup.push(() => deleteTestPoint(point.id));
  await createTestPosition(point.id, a.user.id, 'agree'); // the picker lists the points a person holds
  const story = await createTestStory(a.user.id, { content: `Attach story ${RUN}` });
  cleanup.push(() => deleteTestStory(story.id));
  const secret = await createTestPoint(a.user.id, { statement: `Private point ${RUN}`, visibility: 'private' });
  cleanup.push(() => deleteTestPoint(secret.id));
  await createTestPosition(secret.id, a.user.id, 'agree');

  await pageA.goto('/home');
  await row(pageA, B_NAME).getByRole('button').first().click();
  await pageA.getByRole('button', { name: 'Attach a point or story' }).click();
  const dialog = pageA.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: new RegExp(`Attach Attach point ${RUN}`) })).toBeVisible();
  await expect(dialog.getByText(`Private point ${RUN}`)).toHaveCount(0); // private items are never offered
  await dialog.getByRole('button', { name: new RegExp(`Attach Attach point ${RUN}`) }).click();
  await expect(pageA.getByTestId('staged-attachment')).toContainText(`Attach point ${RUN}`);
  await pageA.getByRole('button', { name: 'Send' }).click();

  await pageA.getByRole('button', { name: 'Attach a point or story' }).click();
  await pageA.getByRole('dialog').getByRole('tab', { name: 'Stories' }).click();
  await pageA.getByRole('dialog').getByRole('button', { name: new RegExp(`Attach Attach story ${RUN}`) }).click();
  await pageA.getByRole('button', { name: 'Send' }).click();

  await row(pageB, A_NAME).getByRole('button').first().click();
  await live(pageB, () => baseExpect(pageB.getByTestId('attachment-point')).toContainText(`Attach point ${RUN}`, { timeout: 6_000 }));
  await live(pageB, () => baseExpect(pageB.getByTestId('attachment-story')).toContainText(`Attach story ${RUN}`, { timeout: 6_000 }));

  // A private point attached by id (as a hand-made row could): B's own access says no.
  const convId = await dmConversationId();
  const ins = await supabaseAdmin.from('chat_messages').insert({ conversation_id: convId, author_id: a.user.id, body: 'a private one', attachment_kind: 'point', attachment_id: secret.id });
  expect(ins.error).toBeNull();
  await live(pageB, () => baseExpect(messageWith(pageB, 'a private one').getByText('Not available to you')).toBeVisible({ timeout: 6_000 }));
  await expect(messageWith(pageB, 'a private one').getByText(`Private point ${RUN}`)).toHaveCount(0);
});

test('QA shots 1: a new person sees their mirror, the group General channel and the one-line hint', async ({ browser }) => {
  test.skip(!SHOT_DIR, 'set P1512_SHOT_DIR to take screenshots');
  const { ctx, page } = await openAs(browser, c);
  try {
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/home');
      await listReady(page);
      await expect(row(page, `${ORG_NAME} · General`)).toBeVisible();
      await expect(row(page, 'mirror')).toBeVisible();
      await expect(page.getByTestId('no-dm-hint')).toHaveText('Message someone from your groups or events');
      await noHScroll(page, `empty list ${w}`);
      await page.screenshot({ path: `${SHOT_DIR}/list-new-user-${w}.png` });
    }
  } finally {
    await ctx.close();
  }
});

test('a forward of a message whose author was erased reads "Forwarded from Deleted user · Message removed"', async () => {
  const general = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', org.id).single();
  const generalId = general.data!.id as string;
  const said = await supabaseAdmin.from('chat_messages').insert({ conversation_id: generalId, author_id: c.user.id, body: `words of C ${RUN}` });
  expect(said.error).toBeNull();

  await pageA.goto(`/home/c/${generalId}`);
  await expect(messageWith(pageA, `words of C ${RUN}`)).toBeVisible();
  await menuOn(pageA, `words of C ${RUN}`, 'Forward');
  const dialog = pageA.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(B_NAME) }).click();
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(pageA.getByText('Forwarded', { exact: true })).toBeVisible();

  // Before the erase the copy shows the words; after it, the author is "Deleted user" and the text is gone.
  const convId = await dmConversationId();
  await pageA.goto(`/home/c/${convId}`);
  await expect(pageA.getByTestId('forwarded-card').filter({ hasText: `words of C ${RUN}` })).toBeVisible();
  const erased = await supabaseAdmin.rpc('erase_chat_data_for', { p_uid: c.user.id });
  expect(erased.error).toBeNull();
  await pageA.reload();
  const card = pageA.getByTestId('forwarded-card').filter({ hasText: 'Deleted user' });
  await expect(card).toContainText('Forwarded from Deleted user · Message removed');
  await expect(pageA.getByText(`words of C ${RUN}`)).toHaveCount(0);
});

test('QA shots 2: list, 1:1, channel + thread, forward, mirror rename, block, attach, erased forward at 1280 / 375 / 320; a tap on a phone', async ({ browser }) => {
  test.skip(!SHOT_DIR, 'set P1512_SHOT_DIR to take screenshots');
  test.setTimeout(360_000); // three widths of dialogs and reloads over a slow link
  const general = `${ORG_NAME} · General`;
  const mirrorId = (await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'mirror').eq('owner_id', a.user.id).single()).data!.id as string;
  const convId = await dmConversationId();
  const shot = (name: string, w: number) => pageA.screenshot({ path: `${SHOT_DIR}/${name}-${w}.png` });

  for (const { w, h } of SIZES) {
    await pageA.setViewportSize({ width: w, height: h });
    await pageA.goto('/home');
    await listReady(pageA);
    await expect(row(pageA, B_NAME)).toBeVisible();
    await noHScroll(pageA, `list ${w}`);
    await shot('list', w);

    // 1:1 (with the attachment cards and the erased forward in it)
    await row(pageA, B_NAME).getByRole('button').first().click();
    await expect(messageWith(pageA, 'reply from B')).toBeVisible();
    await expect(pageA.getByRole('status', { name: 'Loading name' })).toHaveCount(0);
    await expect(pageA.getByRole('status', { name: 'Loading attachment' })).toHaveCount(0);
    await noHScroll(pageA, `dm ${w}`);
    await shot('dm', w);

    // Forward dialog
    await messageWith(pageA, 'reply from B').click({ button: 'right' });
    await pageA.getByRole('menuitem', { name: 'Forward', exact: true }).click();
    await expect(pageA.getByRole('dialog')).toBeVisible();
    await pageA.waitForTimeout(500); // let the dialog finish fading in
    await noHScroll(pageA, `forward ${w}`);
    await shot('forward', w);
    await pageA.keyboard.press('Escape');

    // Channel with the thread panel: both panes loaded before the shot
    await pageA.goto('/home');
    await listReady(pageA);
    await row(pageA, general).getByRole('button').first().click();
    await expect(messageWith(pageA, 'channel post from A')).toBeVisible();
    await messageWith(pageA, 'channel post from A').getByTestId('replies-link').click();
    const panel = pageA.getByTestId('thread-panel');
    await expect(panel.getByText('thread reply from B')).toBeVisible();
    if (w >= 1280) await expect(conversation(pageA).getByText('channel post from A')).toBeVisible();
    await expect(pageA.getByRole('status', { name: /Loading (messages|name)/ })).toHaveCount(0);
    await noHScroll(pageA, `thread ${w}`);
    await shot('channel-thread', w);

    // Mirror, renamed from the header menu
    await pageA.goto(`/home/c/${mirrorId}`);
    await expect(pageA.getByTestId('clarified-card')).toBeVisible();
    await expect(pageA.getByRole('status', { name: 'Loading name' })).toHaveCount(0);
    await noHScroll(pageA, `mirror ${w}`);
    await shot('mirror', w);
    if (w !== 320) {
      await pageA.getByRole('button', { name: 'More', exact: true }).click();
      await pageA.getByRole('menuitem', { name: 'Rename' }).click();
      const rename = pageA.getByRole('dialog');
      await rename.getByLabel(/^Name/).fill(w === 1280 ? 'Scratchpad' : 'Thinking out loud');
      await pageA.waitForTimeout(500);
      await shot('rename-dialog', w);
      await rename.getByRole('button', { name: 'Save' }).click();
      await expect(conversation(pageA).getByRole('heading', { name: new RegExp(`^${w === 1280 ? 'Scratchpad' : 'Thinking out loud'} · Alicetest's mirror$`) })).toBeVisible();
      await noHScroll(pageA, `renamed mirror ${w}`);
      await shot('mirror-renamed', w);

      // Block: confirm dialog, then the blocked composer; unblock puts the field back.
      await pageA.goto(`/home/c/${convId}`);
      await expect(messageWith(pageA, 'reply from B')).toBeVisible();
      await pageA.getByRole('button', { name: 'More', exact: true }).click();
      await pageA.getByRole('menuitem', { name: 'Block' }).click();
      await expect(pageA.getByRole('dialog')).toContainText(`Block ${B_NAME}?`);
      await pageA.waitForTimeout(500);
      await shot('block-confirm', w);
      await pageA.getByRole('dialog').getByRole('button', { name: 'Block' }).click();
      await expect(pageA.getByTestId('composer-blocked')).toContainText(`You blocked ${B_NAME}. Unblock to send messages.`);
      await expect(composer(pageA)).toHaveCount(0);
      await noHScroll(pageA, `blocked ${w}`);
      await shot('blocked', w);
      await pageA.getByTestId('composer-blocked').getByRole('button', { name: 'Unblock' }).click();
      await expect(composer(pageA)).toBeVisible();

      // Attach picker
      await pageA.getByRole('button', { name: 'Attach a point or story' }).click();
      await expect(pageA.getByRole('dialog').getByRole('button', { name: new RegExp(`Attach Attach point ${RUN}`) })).toBeVisible();
      await pageA.waitForTimeout(500);
      await noHScroll(pageA, `attach ${w}`);
      await shot('attach-picker', w);
      await pageA.keyboard.press('Escape');

      // The erased author's forward, scrolled into view
      await messageWith(pageA, 'Message removed').scrollIntoViewIfNeeded();
      await shot('erased-forward', w);
    }
  }

  // A phone for real: tap a message and the actions open in line, covering nothing; scrolling dismisses them.
  const { ctx, page } = await openTouch(browser, a);
  try {
    await page.goto(`/home/c/${convId}`);
    await expect(messageWith(page, 'reply from B')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading name' })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Loading attachment' })).toHaveCount(0);
    await messageWith(page, 'reply from B').getByText('reply from B').tap();
    const bar = messageWith(page, 'reply from B').getByRole('toolbar', { name: 'Message actions' });
    await expect(bar).toBeVisible();
    // In line: the toolbar sits below the message text, never over it, and inside the screen.
    const box = (await bar.boundingBox())!;
    const text = (await messageWith(page, 'reply from B').getByText('reply from B').first().boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: `${SHOT_DIR}/dm-tap-375.png` });
    // Dismissed by a scroll (when the conversation is long enough to scroll) and by a tap elsewhere.
    const scrolled = await page.getByTestId('message-scroller').evaluate((el) => {
      const before = el.scrollTop;
      el.scrollTop = before > 40 ? before - 40 : before + 40;
      return el.scrollTop !== before;
    });
    // (Back to the invisible hover variant: opacity 0 and no longer in line.)
    const dismissed = async () => {
      await expect(bar).toHaveCSS('opacity', '0');
      await expect(bar).not.toHaveClass(/inline-flex/);
    };
    if (scrolled) await dismissed();
    else {
      await messageWith(page, 'see this').getByText('see this', { exact: true }).tap();
      await dismissed();
    }
  } finally {
    await ctx.close();
  }
});

test('the offline strip and the active-session banner shrink the chat: the composer and the page stay inside the screen', async ({ browser }) => {
  test.setTimeout(240_000);
  const session = await createTestSessionInDB(a.user.id, 'Guest');
  cleanup.push(async () => session.cleanup());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await setTestSession(page, a.email);
    await ctx.addInitScript(
      ({ code }) => {
        localStorage.setItem('cp_active_session', JSON.stringify({ code, partnerName: 'Guest', role: 'creator', timestamp: new Date().toISOString() }));
      },
      { code: session.sessionCode },
    );
    const convId = await dmConversationId();
    for (const { w, h } of SIZES.slice(0, 2)) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/home/c/${convId}`);
      await expect(page.getByRole('status', { name: 'Active session notification' })).toBeVisible();
      await expect(composer(page)).toBeVisible();
      await expect(page.getByTestId('message').first()).toBeVisible(); // messages loaded before the connection drops
      await ctx.setOffline(true);
      await expect(page.getByTestId('offline-strip')).toBeVisible();
      const composerBox = (await conversation(page).getByTestId('composer').boundingBox())!;
      const inside = await page.evaluate(() => ({ h: window.innerHeight, scroll: document.documentElement.scrollHeight, bodyScroll: document.body.scrollHeight }));
      expect(composerBox.y + composerBox.height, `composer bottom inside the ${h}px screen at ${w}`).toBeLessThanOrEqual(inside.h + 0.5);
      expect(inside.scroll, `the page does not scroll at ${w}`).toBeLessThanOrEqual(inside.h + 1);
      await noHScroll(page, `bars ${w}`);
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/offline-and-session-banner-${w}.png` });
      // the same on the list pane (phone: list is the page): load it online, then drop the connection
      await ctx.setOffline(false);
      await page.goto('/home');
      await expect(page.getByTestId('chat-list')).toBeVisible();
      await ctx.setOffline(true);
      await expect(page.getByTestId('offline-strip')).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(over, `list page does not scroll at ${w}`).toBeLessThanOrEqual(1);
      await ctx.setOffline(false);
    }
  } finally {
    await ctx.close();
  }
});

test('a long history opens at the bottom, pages back in place, and offers "New messages" when scrolled up', async () => {
  const convId = await dmConversationId();
  const old = Date.now() - 3 * 24 * 3600 * 1000;
  const rows = Array.from({ length: 70 }, (_, i) => ({
    conversation_id: convId,
    author_id: i % 2 ? a.user.id : b.user.id,
    body: `history ${String(i).padStart(2, '0')}`,
    created_at: new Date(old + i * 60_000).toISOString(),
  }));
  const ins = await supabaseAdmin.from('chat_messages').insert(rows);
  expect(ins.error).toBeNull();

  await pageA.setViewportSize({ width: 1280, height: 800 });
  await pageA.goto(`/home/c/${convId}`);
  await expect(messageWith(pageA, 'realtime probe')).toBeVisible();
  const scroller = pageA.getByTestId('message-scroller');
  const gap = () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  expect(await gap()).toBeLessThan(5); // opened at the bottom
  await expect(pageA.getByText('history 00')).toHaveCount(0); // only the latest page is loaded
  await expect(pageA.getByRole('button', { name: 'Load earlier messages' })).toBeVisible();

  // Paging back keeps the reader's place: the message that was at the top stays where it was.
  await scroller.evaluate((el) => { el.scrollTop = 120; });
  const anchor = pageA.getByTestId('message').first();
  const anchorText = (await anchor.innerText()).split('\n').pop() ?? '';
  const before = (await anchor.boundingBox())!.y;
  // A DOM click: Playwright's own click would first scroll the button into view and move the reader.
  await pageA.getByRole('button', { name: 'Load earlier messages' }).evaluate((n) => (n as HTMLElement).click());
  await expect(pageA.getByText('history 00')).toBeVisible({ timeout: 20_000 });
  const after = (await pageA.getByTestId('message').filter({ hasText: anchorText }).first().boundingBox())!.y;
  expect(Math.abs(after - before), 'the message under the reader stayed put').toBeLessThan(4);

  // Scrolled up: a new message does not yank the view, it offers the pill.
  await scroller.evaluate((el) => { el.scrollTop = 300; });
  await pageB.goto(`/home/c/${convId}`);
  await expect(composer(pageB)).toBeVisible();
  await sendText(pageB, 'pill probe');
  const pill = pageA.getByRole('button', { name: 'New messages' });
  await live(pageA, () => baseExpect(pill).toBeVisible({ timeout: 6_000 }));
  expect(await gap()).toBeGreaterThan(50);
  await pill.click();
  await expect(messageWith(pageA, 'pill probe')).toBeVisible();
  expect(await gap()).toBeLessThan(5);
  await expect(pill).toHaveCount(0);
});
