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
import { test, expect as baseExpect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
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

/** A shot must show the screen, not its leftovers: no toast still fading out and no hover left under the pointer. */
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(150);
}
/**
 * A dialog on a phone floats with a side margin and rounded corners all round. `margin` is 15 on a real
 * touch screen; a desktop Chromium window at a phone width centres the dialog inside a reserved scrollbar
 * gutter (index.css, an app-wide choice), so there it only has to keep clear of the edges.
 */
async function dialogShape(page: Page, w: number, margin = 8) {
  const dialog = page.getByRole('dialog');
  const box = (await dialog.boundingBox())!;
  const radius = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radius, `dialog corner radius at ${w}`).toBeGreaterThanOrEqual(8);
  if (w < 640) {
    expect(box.x, `dialog left margin at ${w}`).toBeGreaterThanOrEqual(margin);
    expect(w - (box.x + box.width), `dialog right margin at ${w}`).toBeGreaterThanOrEqual(margin);
  }
}
/** In the open forward dialog the renamed mirror's name has the first line (cut when long) and its role is the whole second line. */
async function mirrorRowKeepsRole(page: Page, w: number) {
  const parts = await page
    .getByRole('dialog')
    .getByRole('button', { name: /Alicetest's mirror/ })
    .evaluate((btn) => {
      const wrapper = btn.querySelector('span.block.min-w-0') as HTMLElement;
      const [name, role] = Array.from(wrapper.querySelectorAll(':scope > span')) as HTMLElement[];
      return { nameCut: name!.scrollWidth > name!.clientWidth, nameText: name!.textContent, roleCut: role!.scrollWidth > role!.clientWidth, roleText: role!.textContent };
    });
  expect(parts.nameCut, `the mirror's own name is cut only by the full line in the forward list at ${w}`).toBe(true);
  expect(parts.nameText).not.toContain("Alicetest's mirror");
  expect(parts.roleCut, `the mirror role is not cut in the forward list at ${w}`).toBe(false);
  expect(parts.roleText).toBe("Alicetest's mirror");
}
/** Every button in the row sits on one line. */
async function oneRow(bar: Locator, label: string) {
  const tops = await bar.getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops.length, `${label}: buttons`).toBeGreaterThanOrEqual(4);
  expect(new Set(tops).size, `${label}: one row, got tops ${tops.join(',')}`).toBe(1);
}

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
  // One send is one message: not two rows on the sender's screen and not two rows in the table.
  await pageA.waitForTimeout(2000);
  await expect(conversation(pageA).getByText('channel post from A')).toHaveCount(1);
  const posted = await supabaseAdmin.from('chat_messages').select('id').eq('body', 'channel post from A').eq('author_id', a.user.id);
  expect(posted.data ?? [], 'the table holds exactly one row for the post').toHaveLength(1);

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
  // Clarify opens the mirror itself (no toast), with the cursor in the composer for a note.
  await expect(pageA.getByRole('textbox', { name: 'Write to your mirror' })).toBeFocused();
  await expect(conversation(pageA).getByRole('heading', { name: /Alicetest.*'s mirror|Your mirror/ })).toBeVisible();
  await expect(pageA.getByTestId('clarified-card')).toContainText('reply from B');
  await expect(pageA.getByTestId('clarified-card')).toContainText(/Sent to .+ to clarify/);
  await expect(pageA.getByTestId('clarified-card')).toContainText(`to clarify · from your chat with ${B_NAME}`);
  await expect(pageA.getByTestId('clarified-author')).toHaveText(B_NAME);

  const { data } = await supabaseAdmin.from('chat_messages').select('conversation_id, author_id, kind').eq('kind', 'clarify');
  const mine = (data ?? []).filter((r) => r.author_id === a.user.id);
  expect(mine).toHaveLength(1);
  const { data: conv } = await supabaseAdmin.from('chat_conversations').select('kind, owner_id').eq('id', mine[0]!.conversation_id).single();
  expect(conv).toEqual({ kind: 'mirror', owner_id: a.user.id });
  // Nothing was written to B's side: no clarify row belongs to B or sits in a chat B is in.
  expect((data ?? []).filter((r) => r.author_id === b.user.id)).toHaveLength(0);
});

test('a send whose reply is lost stores exactly one message: the retry replays the same clientId', async () => {
  test.setTimeout(120_000);
  const convId = await dmConversationId();
  await pageA.setViewportSize({ width: 1280, height: 800 });
  await pageA.goto(`/home/c/${convId}`);
  await expect(composer(pageA)).toBeVisible();
  const keys: Array<string | null> = [];
  let lost = true;
  await pageA.route('**/rest/v1/rpc/send_chat_message', async (route) => {
    keys.push((route.request().postDataJSON() as { p_client_id?: string }).p_client_id ?? null);
    if (lost) {
      lost = false;
      await route.fetch(); // the server stores the message...
      await route.abort('failed'); // ...and the reply never reaches the page
    } else await route.continue();
  });
  try {
    await sendText(pageA, 'lost reply probe');
    // Either the Realtime copy settles it by itself, or Retry is offered: both end with one message.
    const retry = pageA.getByTestId('send-failed').getByRole('button', { name: 'Retry' });
    await Promise.race([retry.waitFor({ timeout: 8_000 }).catch(() => undefined), pageA.waitForTimeout(8_000)]);
    if (await retry.isVisible()) await retry.click();
    await expect(pageA.getByTestId('send-failed')).toHaveCount(0, { timeout: 15_000 });
    await pageA.waitForTimeout(1500);
    await expect(conversation(pageA).getByText('lost reply probe')).toHaveCount(1);
    const rows = await supabaseAdmin.from('chat_messages').select('id, client_id').eq('conversation_id', convId).eq('body', 'lost reply probe');
    expect(rows.data ?? [], 'the table holds one row').toHaveLength(1);
    expect(keys[0], 'the first attempt carried a uuid').toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(keys).size, 'every attempt of the send used the same clientId').toBe(1);
    expect(rows.data![0]!.client_id).toBe(keys[0]);
  } finally {
    await pageA.unroute('**/rest/v1/rpc/send_chat_message');
  }
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
  test.setTimeout(600_000); // three widths of dialogs, a long-name pass, a phone and reloads over a slow link
  const general = `${ORG_NAME} · General`;
  const mirrorId = (await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'mirror').eq('owner_id', a.user.id).single()).data!.id as string;
  const convId = await dmConversationId();
  let channelComposerH = 0;
  const shot = async (name: string, w: number) => {
    await settle(pageA);
    await pageA.screenshot({ path: `${SHOT_DIR}/${name}-${w}.png` });
  };

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
    if (w >= 1280) {
      // The open chat in the list: a light tint with a blue edge, not a blue fill.
      const selected = row(pageA, B_NAME).getByRole('button').first();
      await expect(selected).toHaveCSS('background-color', 'rgb(239, 246, 255)');
      await shot('list-selected', w);
    }
    await noHScroll(pageA, `dm ${w}`);
    await shot('dm', w);

    // Forward dialog
    await messageWith(pageA, 'reply from B').click({ button: 'right' });
    await pageA.getByRole('menuitem', { name: 'Forward', exact: true }).click();
    await expect(pageA.getByRole('dialog')).toBeVisible();
    await pageA.waitForTimeout(500); // let the dialog finish fading in
    await dialogShape(pageA, w);
    await noHScroll(pageA, `forward ${w}`);
    await shot('forward', w);
    await pageA.keyboard.press('Escape');

    // Channel with the thread panel: both panes loaded before the shot
    await pageA.goto('/home');
    await listReady(pageA);
    await row(pageA, general).getByRole('button').first().click();
    await expect(messageWith(pageA, 'channel post from A')).toBeVisible();
    // The hint is one line at every width: the composer is as tall at 320 as at 1280.
    const composerH = (await conversation(pageA).getByTestId('composer').boundingBox())!.height;
    if (w >= 1280) channelComposerH = composerH;
    else expect(composerH, `the channel composer does not grow at ${w}`).toBeLessThanOrEqual(channelComposerH + 2);
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
      // P1554: Rename lives only in the About window, not in the More menu.
      await pageA.getByRole('button', { name: 'More', exact: true }).click();
      await pageA.getByRole('menuitem', { name: /^About / }).click();
      await pageA.getByTestId('mirror-info').getByRole('button', { name: 'Rename' }).click();
      const rename = pageA.getByRole('dialog');
      await rename.getByLabel(/^Name/).fill(w === 1280 ? 'Scratchpad' : 'Thinking out loud');
      await pageA.waitForTimeout(500);
      await dialogShape(pageA, w);
      await shot('rename-dialog', w);
      await rename.getByRole('button', { name: 'Save' }).click();
      await expect(conversation(pageA).getByRole('heading', { name: new RegExp(`^${w === 1280 ? 'Scratchpad' : 'Thinking out loud'} · Alicetest's mirror$`) })).toBeVisible();
      await noHScroll(pageA, `renamed mirror ${w}`);
      if (w >= 1280) {
        // At desktop width the renamed mirror's own name fits whole on its line; its role leads the second line.
        const listed = row(pageA, "Alicetest's mirror");
        const fit = await listed.evaluate((li) => {
          const title = li.querySelector('[data-testid="row-title"]') as HTMLElement;
          return { text: title.textContent, cut: title.scrollWidth > title.clientWidth };
        });
        expect(fit.text).toBe('Scratchpad');
        expect(fit.cut, 'the renamed name is not squeezed in the 1280 list').toBe(false);
      }
      await shot('mirror-renamed', w);

      // Block: confirm dialog, then the blocked composer; unblock puts the field back.
      await pageA.goto(`/home/c/${convId}`);
      await expect(messageWith(pageA, 'reply from B')).toBeVisible();
      await pageA.getByRole('button', { name: 'More', exact: true }).click();
      await pageA.getByRole('menuitem', { name: 'Block' }).click();
      await expect(pageA.getByRole('dialog')).toContainText(`Block ${B_NAME}?`);
      await pageA.waitForTimeout(500);
      await dialogShape(pageA, w);
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
      await dialogShape(pageA, w);
      await noHScroll(pageA, `attach ${w}`);
      await shot('attach-picker', w);
      await pageA.keyboard.press('Escape');

      // The erased author's forward, scrolled into view
      await messageWith(pageA, 'Message removed').scrollIntoViewIfNeeded();
      await shot('erased-forward', w);
    }
  }

  // The mirror keeps its role when the name is long: the title is what gets cut, in the list and the header.
  const LONG = 'Thinking out loud about everything that matters to me today';
  for (const { w, h } of SIZES.slice(1)) {
    await pageA.setViewportSize({ width: w, height: h });
    await pageA.goto(`/home/c/${mirrorId}`);
    await expect(pageA.getByRole('status', { name: 'Loading name' })).toHaveCount(0);
    await pageA.getByRole('button', { name: 'More', exact: true }).click();
    await pageA.getByRole('menuitem', { name: /^About / }).click();
    await pageA.getByTestId('mirror-info').getByRole('button', { name: 'Rename' }).click();
    await pageA.getByRole('dialog').getByLabel(/^Name/).fill(LONG);
    await pageA.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    const h1 = conversation(pageA).getByRole('heading', { name: `${LONG} · Alicetest's mirror` });
    await expect(h1).toBeVisible();
    const parts = await h1.evaluate((el) => {
      const [name, role] = Array.from(el.querySelectorAll(':scope > span > span')) as HTMLElement[];
      const r = role!.getBoundingClientRect();
      return { nameCut: name!.scrollWidth > name!.clientWidth, roleCut: role!.scrollWidth > role!.clientWidth, roleRight: r.right, roleLeft: r.left };
    });
    expect(parts.nameCut, `the title is the part that is cut in the header at ${w}`).toBe(true);
    expect(parts.roleCut, `the role is not cut in the header at ${w}`).toBe(false);
    expect(parts.roleRight, `the role is inside the screen at ${w}`).toBeLessThanOrEqual(w);
    await shot('mirror-long-name-header', w);
    await pageA.goto('/home');
    await listReady(pageA);
    const mirrorRow = row(pageA, "Alicetest's mirror");
    const inList = await mirrorRow.evaluate((li) => {
      const title = li.querySelector('[data-testid="row-title"]') as HTMLElement;
      const role = li.querySelector('[data-testid="row-role"]') as HTMLElement;
      return { nameCut: title.scrollWidth > title.clientWidth, nameText: title.textContent, roleCut: role.scrollWidth > role.clientWidth, roleText: role.textContent, roleRight: role.getBoundingClientRect().right };
    });
    expect(inList.nameCut, `the custom name is cut on its own full line in the list at ${w}`).toBe(true);
    expect(inList.nameText).toBe(LONG);
    expect(inList.roleCut, `the role is not cut in the list at ${w}`).toBe(false);
    expect(inList.roleText).toBe("Alicetest's mirror · ");
    expect(inList.roleRight).toBeLessThanOrEqual(w);
    await shot('list-mirror-long-name', w);
  }

  await pageA.setViewportSize({ width: 1280, height: 800 });
  await pageA.goto('/home');
  await listReady(pageA);
  await shot('list-renamed', 1280);

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
    await oneRow(bar, 'DM action bar at 375');
    await settle(page);
    await page.screenshot({ path: `${SHOT_DIR}/dm-tap-375.png` });
    // The phone dialog from the same bar: rounded, with 16px a side.
    await bar.getByRole('button', { name: 'Forward' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);
    await dialogShape(page, 375, 15);
    await mirrorRowKeepsRole(page, 375);
    await settle(page);
    await page.screenshot({ path: `${SHOT_DIR}/forward-phone-375.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await messageWith(page, 'reply from B').getByText('reply from B').tap();
    await expect(bar).toBeVisible();
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

    // The worst case at the narrowest width: my own channel post has Reply, Forward, Thread, Clarify and More (Edit, Delete).
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/home');
    await expect(page.getByTestId('chat-list')).toBeVisible();
    await page.getByTestId('chat-list').locator('li[data-chat]').filter({ hasText: general }).getByRole('button').first().click();
    await expect(messageWith(page, 'channel post from A')).toBeVisible();
    await messageWith(page, 'channel post from A').getByText('channel post from A').tap();
    const channelBar = messageWith(page, 'channel post from A').getByRole('toolbar', { name: 'Message actions' });
    // The header is one line for the title and one for the subtitle at 320.
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) }).first();
    const titleBox = (await header.getByRole('heading', { level: 1 }).boundingBox())!;
    const subBox = (await header.getByText('General', { exact: true }).boundingBox())!;
    expect(titleBox.height, 'the channel title is one line at 320').toBeLessThanOrEqual(24);
    expect(subBox.height, 'the channel subtitle is one line at 320').toBeLessThanOrEqual(18);
    await settle(page);
    await header.screenshot({ path: `${SHOT_DIR}/channel-header-320.png` });
    await expect(channelBar.getByRole('button')).toHaveCount(5);
    await oneRow(channelBar, 'channel action bar at 320');
    const cb = (await channelBar.boundingBox())!;
    expect(cb.x + cb.width, 'the action bar stays inside a 320 screen').toBeLessThanOrEqual(320);
    await settle(page);
    await page.screenshot({ path: `${SHOT_DIR}/channel-tap-320.png` });
    await channelBar.getByRole('button', { name: 'Forward', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);
    await dialogShape(page, 320, 15);
    await mirrorRowKeepsRole(page, 320);
    await settle(page);
    await page.screenshot({ path: `${SHOT_DIR}/forward-phone-320.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Attachment cards that cannot load: a compact error row with Retry, never an empty grey box.
    await page.setViewportSize({ width: 375, height: 760 });
    await page.route(/\/rest\/v1\/(points|stories)\?/, (route) => route.abort('failed'));
    await page.goto(`/home/c/${convId}`);
    await expect(messageWith(page, 'reply from B')).toBeVisible();
    const errors = page.getByTestId('attachment-error');
    await expect(errors.first()).toBeVisible({ timeout: 30_000 });
    await expect(errors.first()).toContainText(/Couldn't load this (point|story)/);
    await expect(errors.first().getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading attachment' })).toHaveCount(0);
    await errors.first().scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: `${SHOT_DIR}/attachment-error-375.png` });
    // Retry with the route open again loads the card.
    await page.unroute(/\/rest\/v1\/(points|stories)\?/);
    await errors.first().getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('attachment-point').or(page.getByTestId('attachment-story')).first()).toBeVisible({ timeout: 30_000 });

    // Names that cannot be read: after a short wait no grey skeleton bar or disc is left, only text and initials.
    const blockAuthors = (route: import('@playwright/test').Route) =>
      route.request().url().includes('id=in.') ? route.abort('failed') : route.continue();
    await page.route(/\/rest\/v1\/profiles\?/, blockAuthors);
    await page.goto(`/home/c/${convId}`);
    await expect(messageWith(page, 'reply from B')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading name' })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('[data-testid="message"] .animate-pulse')).toHaveCount(0);
    await page.unroute(/\/rest\/v1\/profiles\?/, blockAuthors);
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
      // A card that was still loading when the connection dropped says so; it is never an empty grey box.
      await expect(page.getByRole('status', { name: 'Loading attachment' })).toHaveCount(0);
      await settle(page);
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

test('a long history opens at the bottom, pages back in place, and offers the jump-down button with a count when scrolled up', async () => {
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
  // Found again by its id, not by its last line of text: the toolbar's labelled Clarify button is part of the row's text now.
  const anchorId = (await anchor.getAttribute('data-msg'))!;
  const before = (await anchor.boundingBox())!.y;
  // A DOM click: Playwright's own click would first scroll the button into view and move the reader.
  await pageA.getByRole('button', { name: 'Load earlier messages' }).evaluate((n) => (n as HTMLElement).click());
  await expect(pageA.getByText('history 00')).toBeVisible({ timeout: 20_000 });
  const after = (await pageA.locator(`[data-testid="message"][data-msg="${anchorId}"]`).boundingBox())!.y;
  expect(Math.abs(after - before), 'the message under the reader stayed put').toBeLessThan(4);

  // Scrolled up: a new message does not yank the view; the jump-down button counts it (P1554).
  await scroller.evaluate((el) => { el.scrollTop = 300; });
  await pageB.goto(`/home/c/${convId}`);
  await expect(composer(pageB)).toBeVisible();
  await sendText(pageB, 'pill probe');
  const pill = pageA.getByRole('button', { name: 'Jump to the newest message, 1 new' });
  await live(pageA, () => baseExpect(pill).toBeVisible({ timeout: 6_000 }));
  expect(await gap()).toBeGreaterThan(50);
  await pill.click();
  await expect(messageWith(pageA, 'pill probe')).toBeVisible();
  expect(await gap()).toBeLessThan(5);
  await expect(pageA.getByTestId('jump-down')).toHaveCount(0);
});
