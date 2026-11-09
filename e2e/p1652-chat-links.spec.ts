/**
 * @file p1652-chat-links.spec.ts
 *
 * P1652 chat links, own-app cards, copy text and reactions, in a real browser against the real backend.
 * Two people (A, B) share an org and a 1:1; the spec proves the Acceptance Criteria that are visible in the UI:
 * links (new tab / same tab / markdown / lookalikes), links in a thread, forwarded copy, mirror agent message, voice
 * transcript and transcription, cards, edit, Copy text, live reactions in two browsers, long press, the toolbar on one row
 * from 320 to 1280, and screenshots. Database-only criteria (RLS, late joiner, erased account) are in the migration test.
 *
 * Screenshots: P1652_SHOT_DIR, else the default scratchpad folder named in SHOT_DIR below.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect as baseExpect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestMembership, createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { supabaseAdmin } from './helpers/supabase-admin';
import { purgeChatFor } from './helpers/test-chat';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestSessionInDB } from './helpers/test-session';
import { createFullTestLetter, createTestDoc, deleteTestLetter, getTestStoryVersionId } from './helpers/test-letter';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const A_NAME = `Alicelink ${RUN}`;
const B_NAME = `Boblink ${RUN}`;
const ORG_NAME = `P1652 Links Org ${RUN}`;
let letterId = '';
let letterSeedError = '';
/** Written apart so the privacy gate does not read this hostile test address as an email address. */
const AT = '@';
const SHOT_DIR =
  process.env.P1652_SHOT_DIR ??
  join(tmpdir(), 'p1652-shots');
const APP = 'https://claritypledge.com';

const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

let a: TestUser;
let b: TestUser;
let org: TestOrganization;
let ctxA: BrowserContext;
let ctxB: BrowserContext;
let pageA: Page;
let pageB: Page;
let dmId = '';
let generalId = '';
let mirrorId = '';
let liveCode = '';
let story: { id: string; content: string };
let privateStory: { id: string };
let point: { id: string; statement: string };
let delivery: { id: string };
const cleanup: Array<() => Promise<unknown>> = [];
/** What the spec could not seed or prove, written into the run's annotations (and read into the report). */
const notes: string[] = [];
const note = (s: string) => {
  notes.push(s);
  test.info().annotations.push({ type: 'not-seeded', description: s });
};

const conversation = (page: Page) => page.getByTestId('conversation');
const composer = (page: Page) => conversation(page).getByTestId('composer').getByRole('textbox');
const messageWith = (page: Page, text: string) => page.getByTestId('message').filter({ hasText: text }).first();
const byId = (page: Page, id: string) => page.locator(`[data-testid="message"][data-msg="${id}"]`);
const sendText = async (page: Page, text: string) => {
  const box = composer(page);
  await box.fill(text);
  await box.press('Enter');
};
/** The links in a message's own words (a card under them holds links of its own). */
const WORD_LINKS = 'p.whitespace-pre-wrap a';
const dmUrl = () => `/chats/c/${dmId}`;

async function openAs(browser: Browser, user: TestUser, w = 1280, h = 800): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { ctx, page };
}
async function openTouchAt(browser: Browser, user: TestUser, w: number): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { ctx, page };
}

async function inner(page: Page): Promise<number> {
  return page.evaluate(() => window.innerWidth);
}
async function setWidth(page: Page, w: number, h = 760) {
  await page.setViewportSize({ width: w, height: h });
  await expect.poll(() => inner(page), { message: `window.innerWidth is ${w}` }).toBe(w);
}
async function goDm(page: Page, w?: number) {
  if (w) await setWidth(page, w);
  await page.goto(dmUrl());
  await expect(composer(page)).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading messages' })).toHaveCount(0);
}

/** Realtime can miss an event right after a join, so while waiting do what a person does: refocus the tab. */
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

/**
 * A just-sent row is a local "Sending…" row that the server's row replaces a moment later; a menu or toolbar opened on the local one is
 * lost with it (observed: a right-click within a second of sending opened nothing). Act on the settled row, as a person does a beat later.
 */
async function sent(msg: Locator) {
  await expect(msg).not.toContainText('Sending');
  await msg.page().waitForTimeout(700);
}

/** A point on the row that is never a link or a card: the row's own left padding (8 to 16px), left of the avatar's hit area (which starts at 12px only on its own lines). */
async function pad(msg: Locator): Promise<{ x: number; y: number }> {
  const box = (await msg.boundingBox())!;
  return { x: 10, y: Math.min(12, Math.round(box.height / 2)) };
}

/** Wide screens show the hover toolbar; narrower ones show it in line under a tapped message. */
async function openBar(page: Page, msg: Locator): Promise<Locator> {
  await msg.scrollIntoViewIfNeeded();
  await sent(msg);
  // Let the list settle first: any scroll after a tap dismisses the in-line toolbar (by design), and a list still loading cards scrolls.
  await expect(page.getByRole('status', { name: /Loading (attachment|name|messages)/ })).toHaveCount(0);
  await page.waitForTimeout(500);
  const w = await inner(page);
  const bar = msg.getByRole('toolbar', { name: 'Message actions' });
  const shown = async () => (await bar.evaluate((el) => getComputedStyle(el).opacity).catch(() => '0')) === '1';
  // Up to three taps; every miss is recorded as a note for the report (a tap whose toolbar is gone a moment later is a finding, not noise).
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (w >= 1024) await msg.hover({ position: await pad(msg) });
    else await msg.click({ position: await pad(msg) });
    await page.waitForTimeout(600);
    if (await shown()) {
      if (attempt > 1) note(`toolbar: the tap at ${w}px did not leave the toolbar shown on ${attempt - 1} earlier attempt(s); it did on attempt ${attempt}`);
      break;
    }
    if (w >= 1024) await page.mouse.move(0, 0);
    else await page.mouse.click(2, 2); // clear any half-open state before tapping again
  }
  await expect(bar).toBeVisible();
  // Visible to Playwright includes opacity 0 (the hidden hover variant): the bar must really be shown.
  await expect(bar, `the toolbar is shown at ${w}`).toHaveCSS('opacity', '1');
  return bar;
}
/** Right-click on the row's padding (never on a link), then choose an item. */
async function menuOn(page: Page, msg: Locator, item: string) {
  await sent(msg);
  await msg.click({ button: 'right', position: await pad(msg) });
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(150);
}
async function shot(page: Page, state: string, w: number) {
  expect(await inner(page), `shot ${state}: window.innerWidth`).toBe(w);
  await page.screenshot({ path: `${SHOT_DIR}/${state}-${w}.png` });
}
/**
 * Holds a real touch (CDP) on `target`. The "who reacted" hint did not appear on the first hold in some runs, so this holds up to three
 * times and RECORDS every miss as a note (a first-attempt miss is a finding for the report, never hidden): returns the attempts it took.
 */
async function longPress(ctx: BrowserContext, page: Page, target: Locator, whileHeld?: () => Promise<void>): Promise<number> {
  const cdp = await ctx.newCDPSession(page);
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Let the list settle (a layout shift or scroll after the finger lands cancels the touch, as it would for a person).
    await expect(page.getByRole('status', { name: /Loading (attachment|name|messages)/ })).toHaveCount(0);
    await page.waitForTimeout(800);
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(750);
    let shown = true;
    if (whileHeld) await whileHeld().catch(() => { shown = false; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (shown) {
      if (attempt > 1) note(`long press: the who-reacted hint was missing on ${attempt - 1} earlier hold(s) of a ${await inner(page)}px touch page; it showed on hold ${attempt}`);
      return attempt;
    }
    await page.waitForTimeout(2500); // any hint that did open has closed
  }
  throw new Error('long press: the who-reacted hint never appeared in 3 holds');
}
const pill = (msg: Locator, emoji: string) => msg.locator(`[data-testid="reaction-pill"][data-emoji="${emoji}"]`);
async function react(page: Page, msg: Locator, emoji: string) {
  const bar = await openBar(page, msg);
  await bar.getByRole('button', { name: 'React', exact: true }).click();
  await page.getByRole('menu', { name: 'Add a reaction' }).getByRole('menuitem', { name: `React ${emoji}` }).click();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  a = await createTestUser({ name: A_NAME });
  b = await createTestUser({ name: B_NAME });
  org = await createTestOrganization({ name: ORG_NAME });
  await createTestMembership(org.id, a.user.id);
  await createTestMembership(org.id, b.user.id);
  story = await createTestStory(a.user.id, { content: `Link story ${RUN}` });
  cleanup.push(() => deleteTestStory(story.id));
  privateStory = await createTestStory(a.user.id, { content: `Private link story ${RUN}`, visibility: 'private' });
  cleanup.push(() => deleteTestStory(privateStory.id));
  point = await createTestPoint(a.user.id, { statement: `Link point ${RUN}`, tags: ['clarity'] });
  cleanup.push(() => deleteTestPoint(point.id));
  const session = await createTestSessionInDB(a.user.id, 'Guest');
  cleanup.push(async () => session.cleanup());
  liveCode = session.sessionCode;
  try {
    const doc = await createTestDoc(a.user.id, `Link letter ${RUN}`);
    const versionId = await getTestStoryVersionId(story.id);
    const made = await createFullTestLetter(a.user.id, doc.id, [{ storyId: story.id, versionId, prediction: 6, position: 0 }], { email: b.email, profileId: b.user.id }, { seal: true });
    delivery = made.delivery;
    letterId = made.letter.id;
    cleanup.push(async () => {
      await deleteTestLetter(made.letter.id);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', doc.id);
    });
  } catch (e) {
    letterSeedError = e instanceof Error ? e.message : String(e);
  }
  ({ ctx: ctxA, page: pageA } = await openAs(browser, a));
  ({ ctx: ctxB, page: pageB } = await openAs(browser, b));
});
let agentSeeded = false;
let voiceSeeded = false;

test.afterAll(async () => {
  test.setTimeout(120_000);
  fs.writeFileSync(`${SHOT_DIR}/../notes.json`, JSON.stringify({ notes, letterSeedError }, null, 2));
  await ctxA?.close();
  await ctxB?.close();
  try {
    for (const undo of cleanup.reverse()) await undo().catch(() => undefined);
    await purgeChatFor([a?.user.id, b?.user.id].filter(Boolean) as string[]);
    if (org) await deleteTestOrganization(org.id);
  } finally {
    if (a) await deleteTestUser(a.user.id);
    if (b) await deleteTestUser(b.user.id);
  }
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the first argument to be a pattern
test.afterEach(async ({}, testInfo) => {
  // Evidence for a failure: what A's and B's screens actually showed (the default `page` fixture is not the one used here).
  if (testInfo.status === testInfo.expectedStatus) return;
  const tag = testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 30);
  for (const [name, pg] of [['A', pageA], ['B', pageB]] as const) {
    await pg?.screenshot({ path: `${SHOT_DIR}/../fail-${tag}-${name}.png` }).catch(() => undefined);
    const html = await pg?.getByTestId('message').last().innerHTML().catch(() => '');
    if (html) fs.writeFileSync(`${SHOT_DIR}/../fail-${tag}-${name}-lastrow.html`, html);
  }
});

test('smoke: page loads and has no console errors', async () => {
  const errors: string[] = [];
  pageA.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Failed resource loads are browser network noise (the spec blocks nothing, but a TEST asset can 404); app errors are what count.
  pageA.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  await pageA.goto('/chats');
  await expect(pageA.getByTestId('chat-list')).toBeVisible();
  await expect(pageA.getByTestId('chat-list').locator('li[data-chat]').filter({ hasText: 'mirror' })).toBeVisible();
  expect(errors).toEqual([]);
  mirrorId = (await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'mirror').eq('owner_id', a.user.id).single()).data!.id as string;
  generalId = (await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', org.id).single()).data!.id as string;
});

test('setup: A starts a 1:1 with B', async () => {
  await pageA.getByLabel('Search chats and people').fill(B_NAME);
  await pageA.getByRole('button', { name: `Message ${B_NAME}` }).click();
  await expect(pageA).toHaveURL(/\/chats\/c\//);
  await sendText(pageA, `hello ${RUN}`);
  await expect(messageWith(pageA, `hello ${RUN}`)).toBeVisible();
  const dm = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'dm').or(`dm_user_a.eq.${a.user.id},dm_user_b.eq.${a.user.id}`).single();
  dmId = dm.data!.id as string;
});

test('1. https, www and bare links are new-tab anchors and do not open the row toolbar', async () => {
  await ctxA.route(/^https?:\/\/(www\.)?(example\.com|google\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>ok' }));
  await goDm(pageA, 375);
  await sendText(pageA, `L1${RUN} https://example.com/a www.example.com google.com`);
  const msg = messageWith(pageA, `L1${RUN}`);
  const anchors = msg.locator('a');
  await expect(anchors).toHaveCount(3);
  await expect(anchors.nth(0)).toHaveAttribute('href', 'https://example.com/a');
  await expect(anchors.nth(1)).toHaveAttribute('href', /^https?:\/\/www\.example\.com/);
  await expect(anchors.nth(2)).toHaveAttribute('href', /^https?:\/\/(www\.)?google\.com/);
  for (let i = 0; i < 3; i++) {
    await expect(anchors.nth(i)).toHaveAttribute('target', '_blank');
    await expect(anchors.nth(i)).toHaveAttribute('rel', /noopener/);
  }
  const url = pageA.url();
  for (let i = 0; i < 3; i++) {
    const [popup] = await Promise.all([pageA.waitForEvent('popup'), anchors.nth(i).click()]);
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url(), `link ${i} opened in a new tab`).toMatch(/example\.com|google\.com/);
    await popup.close();
    expect(pageA.url(), 'the chat tab did not navigate').toBe(url);
    await expect(msg.locator('[data-selected]'), `link ${i}: the row toolbar did not open`).toHaveCount(0);
  }
  // Control: a tap on the words themselves DOES select the row at this width, so the probe above can tell the difference.
  await msg.locator('p').first().click({ position: { x: 3, y: 3 } });
  await expect(msg.locator('[data-selected]')).toHaveCount(1);
});

test('2. full own-app addresses navigate in the same tab, Back returns to the chat, and none shows a card', async () => {
  await goDm(pageA, 375);
  const cases = [
    { tag: 'O1', path: `/live/${liveCode}` },
    { tag: 'O2', path: `/events/x${RUN}` },
    { tag: 'O3', path: `/p/x${RUN}` },
  ];
  for (const c of cases) await sendText(pageA, `${c.tag}${RUN} ${APP}${c.path}`);
  for (const c of cases) {
    const msg = messageWith(pageA, `${c.tag}${RUN}`);
    const link = msg.locator('a');
    await expect(link).toHaveCount(1);
    await expect(link, 'own address has no new-tab target').not.toHaveAttribute('target', /.+/);
    await pageA.waitForTimeout(1500); // a card, if one were coming, has had time to appear
    await expect(msg.locator('[data-testid^="link-card"], [data-testid^="attachment-"]')).toHaveCount(0);
    const pagesBefore = ctxA.pages().length;
    await link.click();
    await expect(pageA, `${c.path} opened in the same tab`).toHaveURL(new RegExp(c.path.replace(/\//g, '\\/')));
    expect(ctxA.pages().length, 'no new tab').toBe(pagesBefore);
    await pageA.goBack();
    await expect(pageA).toHaveURL(new RegExp(`/chats/c/${dmId}`));
    await expect(messageWith(pageA, `${c.tag}${RUN}`)).toBeVisible();
  }
});

test('3. markdown form shows as typed with no link; lookalike host and at-sign address are not links', async () => {
  await goDm(pageA, 1280);
  const cyr = 'а'; // Cyrillic a
  await sendText(pageA, `K1${RUN} [click here](https://example.com)`);
  await sendText(pageA, `K2${RUN} https://${cyr}pple.com/x`);
  await sendText(pageA, `K3${RUN} https://apple.com${AT}evil.example/x`);
  await sendText(pageA, `K4${RUN} ${cyr}pple.com`);
  await sendText(pageA, `K5${RUN} apple.com`);
  const k1 = messageWith(pageA, `K1${RUN}`);
  await expect(k1).toBeVisible();
  await expect(k1).toContainText('[click here](https://example.com)');
  await expect(k1.locator('a')).toHaveCount(0);
  for (const t of ['K2', 'K3', 'K4']) {
    const m = messageWith(pageA, `${t}${RUN}`);
    await expect(m).toBeVisible();
    await expect(m.locator('a'), `${t}: not a link, and no part of it is`).toHaveCount(0);
  }
  await expect(messageWith(pageA, `K2${RUN}`)).toContainText(`https://${cyr}pple.com/x`);
  await expect(messageWith(pageA, `K3${RUN}`)).toContainText(`https://apple.com${AT}evil.example/x`);
  // Control: a plain latin bare domain in the same chat IS a link, so zero anchors above is not a blind probe.
  await expect(messageWith(pageA, `K5${RUN}`).locator('a')).toHaveCount(1);
  note('Criterion 3 "including in a message with chips" and "on a story": chips (canvas box references) and a story page were not seeded here; chat lookalikes and markdown are proven.');
});

test('4. links in a thread, a forwarded copy (with go-to-original), a mirror agent message, a voice transcript and a transcription', async () => {
  await ctxA.route(/^https?:\/\/(www\.)?(example\.com|google\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' })).catch(() => undefined);
  await goDm(pageA, 1280);
  await sendText(pageA, `F1${RUN} see https://example.com/f1`);
  const f1 = messageWith(pageA, `F1${RUN}`);
  await expect(f1.locator('a')).toHaveCount(1);

  // Thread
  await menuOn(pageA, f1, 'Reply in thread');
  const thread = pageA.getByTestId('thread-panel');
  await expect(thread).toBeVisible();
  await thread.getByRole('textbox').fill(`TH${RUN} https://example.com/t1`);
  await thread.getByRole('textbox').press('Enter');
  const reply = thread.getByTestId('message').filter({ hasText: `TH${RUN}` });
  await expect(reply.locator('a')).toHaveCount(1);
  await expect(reply.locator('a')).toHaveAttribute('target', '_blank');
  await pageA.keyboard.press('Escape');
  await expect(pageA.getByTestId('thread-panel')).toHaveCount(0);

  // Forward (no note: a pure forward) into General
  await menuOn(pageA, f1, 'Forward');
  const dialog = pageA.getByRole('dialog');
  await dialog.getByLabel('Search chats').fill(ORG_NAME);
  await dialog.getByRole('button', { name: new RegExp(ORG_NAME) }).click();
  await dialog.getByRole('button', { name: 'Send' }).click();
  await expect(dialog).toHaveCount(0);
  await pageA.goto(`/chats/c/${generalId}`);
  const fwd = pageA.getByTestId('forwarded-card').filter({ hasText: `F1${RUN}` });
  await expect(fwd).toBeVisible();
  const fa = fwd.locator('a');
  await expect(fa).toHaveCount(1);
  await expect(fa).toHaveAttribute('target', '_blank');
  const here = pageA.url();
  const [popup] = await Promise.all([pageA.waitForEvent('popup'), fa.click()]);
  await popup.close();
  expect(pageA.url(), 'a tap on the link in a forwarded copy does not jump to the original').toBe(here);
  await fwd.getByTestId('go-to-original').click();
  await expect(pageA).toHaveURL(new RegExp(`/chats/c/${dmId}`));
  await expect(messageWith(pageA, `F1${RUN}`)).toBeVisible();

  // Mirror agent message
  const agent = await supabaseAdmin.from('chat_messages').insert({ conversation_id: mirrorId, author_id: null, kind: 'agent', body: `AG${RUN} mirror says https://example.com/agent` });
  if (agent.error) note(`mirror agent message could not be seeded: ${agent.error.message}`);
  else {
    agentSeeded = true;
    await pageA.goto(`/chats/c/${mirrorId}`);
    const m = messageWith(pageA, `AG${RUN}`);
    await expect(m.locator('a')).toHaveCount(1);
    await expect(m.locator('a')).toHaveAttribute('target', '_blank');
  }

  // Voice transcript and transcription (admin inserts, as B)
  const voice = await supabaseAdmin.from('chat_messages').insert({
    conversation_id: dmId, author_id: b.user.id, kind: 'message', body: null,
    audio_duration_ms: 3000, transcript_status: 'done', transcript: `VT${RUN} voice let.me think https://example.com/voice`,
  });
  const spoken = await supabaseAdmin.from('chat_messages').insert({
    conversation_id: dmId, author_id: b.user.id, body: `TR${RUN} spoken let.me think https://example.com/spoken`, is_transcription: true,
  });
  await goDm(pageA);
  if (voice.error) note(`voice transcript could not be seeded: ${voice.error.message}`);
  else {
    voiceSeeded = true;
    const vb = pageA.getByTestId('voice-bubble').last();
    await vb.getByRole('button', { name: 'Show transcript' }).click();
    const tr = vb.getByTestId('voice-transcript');
    await expect(tr).toContainText('let.me think');
    await expect(tr.locator('a'), 'only the spoken https address links; let.me does not').toHaveCount(1);
    await expect(tr.locator('a')).toHaveAttribute('href', 'https://example.com/voice');
  }
  if (spoken.error) note(`transcription could not be seeded: ${spoken.error.message}`);
  else {
    const m = messageWith(pageA, `TR${RUN}`);
    await expect(m).toContainText('let.me think');
    await expect(m.locator('a'), 'only the spoken https address links').toHaveCount(1);
    await expect(m.locator('a')).toHaveAttribute('href', 'https://example.com/spoken');
  }
});

test('5. story and point cards for a reader with access; two links one card; no access shows only the link; letter overview card', async () => {
  await goDm(pageA, 1280);
  await goDm(pageB, 1280);
  await pageB.waitForTimeout(2500);
  const S = `${APP}/story/${story.id}`;
  const P = `${APP}/point/${point.id}`;
  await sendText(pageA, `C1${RUN} ${S}`);
  await sendText(pageA, `C2${RUN} ${P}`);
  await sendText(pageA, `C3${RUN} ${S} and ${P}`);
  await sendText(pageA, `C4${RUN} ${APP}/story/${privateStory.id}`);
  await sendText(pageA, `C6${RUN} ${APP}/letter/${delivery?.id ?? 'x'}`);
  await live(pageB, () => baseExpect(messageWith(pageB, `C6${RUN}`)).toBeVisible({ timeout: 6_000 }));

  const c1 = messageWith(pageB, `C1${RUN}`);
  await expect(c1.getByTestId('link-card-story')).toContainText(story.content);
  await expect(c1.locator(WORD_LINKS)).toHaveCount(1);
  await expect(messageWith(pageB, `C2${RUN}`).getByTestId('link-card-point')).toContainText(point.statement);
  const c3 = messageWith(pageB, `C3${RUN}`);
  await expect(c3.locator(WORD_LINKS)).toHaveCount(2);
  await expect(c3.locator('[data-testid^="link-card-"]')).toHaveCount(1);
  await pageB.waitForTimeout(1500);
  await expect(c3.locator('[data-testid^="link-card-"]'), 'two links still show one card').toHaveCount(1);

  // No access: B sees the link and nothing else (the control above shows B's reads succeed).
  const c4 = messageWith(pageB, `C4${RUN}`);
  await c4.scrollIntoViewIfNeeded();
  await pageB.waitForTimeout(2500);
  await expect(c4.locator('a')).toHaveCount(1);
  await expect(c4.locator('[data-testid^="link-card-"], [data-testid^="attachment-"]')).toHaveCount(0);
  await expect(c4).not.toContainText(/not available|no longer available|couldn.t load/i);
  await expect(c4.getByRole('status')).toHaveCount(0);
  await expect(c4.locator('.animate-pulse')).toHaveCount(0);
  const gap = await c4.locator('span[aria-hidden="true"].block.h-0').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(gap.every((h) => h === 0), `no reserved gap, got ${gap}`).toBe(true);
  // The author, who does have access, sees the card for that same address: the link and the probe are valid.
  // (Scrolled into view first: a card reads only when near the viewport, and this row may sit above the fold on A's screen.)
  await messageWith(pageA, `C4${RUN}`).scrollIntoViewIfNeeded();
  await expect(messageWith(pageA, `C4${RUN}`).getByTestId('link-card-story')).toContainText(`Private link story ${RUN}`);

  // A recipient /letter/:id (delivery) link shows only the link.
  const c6 = messageWith(pageB, `C6${RUN}`);
  await expect(c6.locator('a')).toHaveCount(1);
  await pageB.waitForTimeout(1500);
  await expect(c6.locator('[data-testid^="link-card-"], [data-testid^="attachment-"]')).toHaveCount(0);

  // Letter overview card
  if (letterSeedError) {
    note(`letter overview card: letter could not be seeded: ${letterSeedError}`);
  } else {
    await sendText(pageA, `C5${RUN} ${APP}/letter/${letterId}/overview`);
    const c5 = messageWith(pageA, `C5${RUN}`);
    await expect(c5.getByTestId('attachment-letter')).toBeVisible();
  }
});

test('6. editing a message link updates link and card', async () => {
  await goDm(pageA, 1280);
  await sendText(pageA, `E1${RUN} ${APP}/story/${story.id}`);
  const m = () => messageWith(pageA, `E1${RUN}`);
  await expect(m().getByTestId('link-card-story')).toBeVisible();
  await expect(m().locator(WORD_LINKS)).toHaveAttribute('href', new RegExp(`/story/${story.id}`));
  await menuOn(pageA, m(), 'Edit');
  const edit = pageA.getByLabel('Edit message');
  await edit.fill(`E1${RUN} ${APP}/point/${point.id}`);
  await edit.press('Enter');
  await expect(m().getByTestId('link-card-point')).toContainText(point.statement);
  await expect(m().getByTestId('link-card-story')).toHaveCount(0);
  await expect(m().locator(WORD_LINKS)).toHaveAttribute('href', new RegExp(`/point/${point.id}`));
  await expect(m().getByTestId('edited-mark')).toBeVisible();
});

test('7. Copy text: exact words on the clipboard for typed, pure forward, voice transcript and mirror messages; an error when refused', async ({ browser }) => {
  const { ctx, page } = await openAs(browser, a);
  try {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const clip = () => page.evaluate(() => navigator.clipboard.readText());
    const copyFrom = async (msg: Locator, expected: string) => {
      await menuOn(page, msg, 'Copy text');
      await expect(page.getByText('Copied', { exact: true })).toBeVisible();
      expect(await clip()).toBe(expected);
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });
    };
    await goDm(page, 1280);
    const typed = `CP${RUN} words  with   spacing https://example.com/copy`;
    await sendText(page, typed);
    await copyFrom(messageWith(page, `CP${RUN}`), typed);

    await page.goto(`/chats/c/${generalId}`);
    const fwdRow = page.getByTestId('message').filter({ has: page.getByTestId('forwarded-card').filter({ hasText: `F1${RUN}` }) }).first();
    await expect(fwdRow).toBeVisible();
    await copyFrom(fwdRow, `F1${RUN} see https://example.com/f1`);

    await goDm(page);
    const vt = page.getByTestId('message').filter({ has: page.getByTestId('voice-bubble') }).last();
    if (voiceSeeded) {
      await expect(vt).toBeVisible();
      await copyFrom(vt, `VT${RUN} voice let.me think https://example.com/voice`);
    } else note('Copy text on a ready voice transcript: no voice note was seeded (see item 4).');

    await page.goto(`/chats/c/${mirrorId}`);
    const ag = messageWith(page, `AG${RUN}`);
    if (agentSeeded) {
      await expect(ag).toBeVisible();
      await copyFrom(ag, `AG${RUN} mirror says https://example.com/agent`);
    } else note('Copy text on a mirror message: no mirror agent message was seeded (see item 4).');

    // Refusal: the browser rejects the write, the message says so.
    await goDm(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('refused')), configurable: true });
    });
    await menuOn(page, messageWith(page, `CP${RUN}`), 'Copy text');
    await expect(page.getByText("Couldn't copy. Your browser refused.")).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('8. reactions: live in a second browser, removal, delete, long press who-reacted without toggling, none in the mirror', async ({ browser }) => {
  test.setTimeout(300_000);
  await goDm(pageA, 1280);
  await goDm(pageB, 1280);
  await pageB.waitForTimeout(2500);

  // Add and remove
  await sendText(pageA, `RM${RUN} remove me`);
  const rmA = messageWith(pageA, `RM${RUN}`);
  await live(pageB, () => baseExpect(messageWith(pageB, `RM${RUN}`)).toBeVisible({ timeout: 6_000 }));
  const rmId = (await rmA.getAttribute('data-msg'))!;
  await pageB.waitForTimeout(1500);
  await react(pageA, rmA, '👍');
  await expect(pill(byId(pageA, rmId), '👍')).toContainText('1');
  // No refocus pokes here: this is the app's own delivery.
  await expect(pill(byId(pageB, rmId), '👍'), 'B sees the pill without a reload').toContainText('1');
  await pill(byId(pageA, rmId), '👍').click();
  await expect(pill(byId(pageB, rmId), '👍'), "B's pill clears when A removes").toHaveCount(0);

  // Delete clears
  await sendText(pageA, `RD${RUN} delete me`);
  await live(pageB, () => baseExpect(messageWith(pageB, `RD${RUN}`)).toBeVisible({ timeout: 6_000 }));
  const rdId = (await messageWith(pageA, `RD${RUN}`).getAttribute('data-msg'))!;
  await pageB.waitForTimeout(1500);
  await react(pageA, byId(pageA, rdId), '❤️');
  await expect(pill(byId(pageB, rdId), '❤️')).toBeVisible();
  await menuOn(pageA, byId(pageA, rdId), 'Delete');
  await pageA.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(byId(pageB, rdId)).toContainText('Message deleted');
  await expect(byId(pageB, rdId).getByTestId('reaction-pill'), 'deleting the message clears its reactions in B').toHaveCount(0);
  await expect(byId(pageA, rdId).getByTestId('reaction-pill')).toHaveCount(0);

  // A persistent set for long press and the screenshots: B writes, A reacts twice, B reacts once
  await sendText(pageB, `RS${RUN} reaction set`);
  await live(pageA, () => baseExpect(messageWith(pageA, `RS${RUN}`)).toBeVisible({ timeout: 6_000 }));
  const rsId = (await messageWith(pageA, `RS${RUN}`).getAttribute('data-msg'))!;
  await react(pageA, byId(pageA, rsId), '👍');
  await react(pageA, byId(pageA, rsId), '❤️');
  await react(pageB, byId(pageB, rsId), '👍');
  await expect(pill(byId(pageA, rsId), '👍')).toContainText('2');
  await expect(pill(byId(pageB, rsId), '❤️')).toContainText('1');

  // Long press as B on a phone, on A's heart: shows who, does not toggle; a plain tap then does (control).
  const { ctx, page } = await openTouchAt(browser, b, 375);
  try {
    await goDm(page);
    const heart = pill(byId(page, rsId), '❤️');
    await heart.scrollIntoViewIfNeeded();
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await longPress(ctx, page, heart, async () => {
      await expect(page.getByRole('tooltip').first()).toContainText(A_NAME, { timeout: 3_000 });
    });
    await page.waitForTimeout(400);
    await expect(heart, 'the long press did not toggle').toHaveAttribute('aria-pressed', 'false');
    await expect(heart).toContainText('1');
    await page.waitForTimeout(2200);
    await heart.tap();
    await expect(heart, 'a plain tap toggles').toHaveAttribute('aria-pressed', 'true');
    await expect(heart).toContainText('2');
    await heart.tap(); // leave the set as it was
    await expect(heart).toContainText('1');
  } finally {
    await ctx.close();
  }

  // The mirror has no React control, on the toolbar or in the menu
  await pageA.goto(`/chats/c/${mirrorId}`);
  const person = await supabaseAdmin.from('chat_messages').insert({ conversation_id: mirrorId, author_id: a.user.id, body: `MP${RUN} my own mirror note` });
  expect(person.error).toBeNull();
  await pageA.goto(`/chats/c/${mirrorId}`);
  for (const text of [`MP${RUN}`, `AG${RUN}`]) {
    const m = messageWith(pageA, text);
    if (text.startsWith('AG') && !agentSeeded) {
      note(`mirror no-React check skipped for ${text}: row not seeded`);
      continue;
    }
    await expect(m).toBeVisible();
    const bar = await openBar(pageA, m);
    await expect(bar.getByRole('button', { name: 'React', exact: true }), `${text}: no React on the toolbar`).toHaveCount(0);
    await m.click({ button: 'right', position: await pad(m) });
    await expect(pageA.getByRole('menu', { name: 'Message menu' })).toBeVisible();
    await expect(pageA.getByRole('menuitem', { name: 'React', exact: true }), `${text}: no React in the menu`).toHaveCount(0);
    await pageA.keyboard.press('Escape');
  }
});

test('9. toolbar stays on one row inside its container with no page overflow at 320, 360, 375, 390, 400 and 1280', async () => {
  test.setTimeout(400_000); // six widths, each waiting out its own checks
  await goDm(pageA, 1280);
  // The probe row is L1 (own message, high in the chat): a tap on a row at the end of a scrolled-to-the-end chat is its own test, 11 below.
  const failures: string[] = [];
  for (const w of [320, 360, 375, 390, 400, 1280]) {
    try {
      await setWidth(pageA, w);
      await pageA.goto(dmUrl());
      const msg = messageWith(pageA, `L1${RUN}`);
      await expect(msg).toBeVisible();
      const bar = await openBar(pageA, msg);
      const clarify = bar.getByRole('button', { name: /Clarify/ });
      await expect(clarify, `a real Clarify button at ${w}`).toBeVisible();
      // One synchronous read of bar, buttons and container, so a toolbar that closes between reads cannot null a box.
      const g = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        // The row's own scroll container (the message list); the screen's edge when the toolbar is not inside one.
        const holder = el.closest('[data-testid="message-scroller"]') ?? el.closest('[data-testid="message"]')!.parentElement!;
        const c = holder.getBoundingClientRect();
        const btns = Array.from(el.querySelectorAll('button')).map((x) => ({ top: Math.round(x.getBoundingClientRect().top), right: x.getBoundingClientRect().right }));
        return { bar: { x: r.x, right: r.right, w: r.width }, box: { x: c.x, right: c.right }, btns };
      });
      expect(g.btns.length, `buttons at ${w}`).toBeGreaterThanOrEqual(4);
      expect(new Set(g.btns.map((x) => x.top)).size, `one row at ${w}, tops ${g.btns.map((x) => x.top).join(',')}`).toBe(1);
      expect(g.bar.x, `bar left inside container at ${w}`).toBeGreaterThanOrEqual(g.box.x - 0.5);
      expect(g.bar.right, `bar right inside container at ${w}`).toBeLessThanOrEqual(g.box.right + 0.5);
      expect(g.bar.right, `bar right inside the ${w}px screen`).toBeLessThanOrEqual(w);
      expect(Math.max(...g.btns.map((x) => x.right)), `last button inside the bar at ${w}`).toBeLessThanOrEqual(g.bar.right + 0.5);
      const overflow = await pageA.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      expect(overflow.sw, `scrollWidth ${overflow.sw} <= innerWidth ${overflow.iw} at ${w}`).toBeLessThanOrEqual(overflow.iw);
      expect(overflow.iw).toBe(w);
    } catch (e) {
      failures.push(`${w}px: ${(e instanceof Error ? e.message : String(e)).split('\n').slice(0, 3).join(' | ')}`);
    }
  }
  // Every width is measured before the test fails, so one width's problem does not hide the others.
  expect(failures, 'widths where the toolbar was not shown, or not on one row inside its container').toEqual([]);
});

test('10. screenshots at 320, 375 and 1280', async ({ browser }) => {
  test.setTimeout(400_000);
  for (const w of [320, 375, 1280]) {
    await goDm(pageA, w);
    // chat with links and a card
    const card = messageWith(pageA, `C1${RUN}`);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByTestId('link-card-story')).toBeVisible();
    await settle(pageA);
    await shot(pageA, 'chat-links-card', w);

    // tapped message toolbar (hover on a wide screen)
    const bar = await openBar(pageA, messageWith(pageA, `L1${RUN}`));
    await expect(bar).toBeVisible();
    await shot(pageA, 'toolbar-tapped', w);

    // reaction picker open
    await bar.getByRole('button', { name: 'React', exact: true }).click();
    await expect(pageA.getByRole('menu', { name: 'Add a reaction' })).toBeVisible();
    await shot(pageA, 'reaction-picker', w);
    await pageA.keyboard.press('Escape');

    // pills with counts
    const rs = messageWith(pageA, `RS${RUN}`);
    await rs.scrollIntoViewIfNeeded();
    await expect(pill(rs, '👍')).toContainText('2');
    await settle(pageA);
    await shot(pageA, 'pills-counts', w);
    // who reacted: hover on a wide screen, a held touch on a phone
    if (w >= 1024) {
      await pill(rs, '👍').hover();
      // On A's own screen A reads as "You"; B is named.
      const who = pageA.getByRole('tooltip').first();
      await expect(who).toContainText('You');
      await expect(who).toContainText(B_NAME);
      await shot(pageA, 'pills-who-reacted', w);
    } else {
      const t = await openTouchAt(browser, b, w);
      try {
        await goDm(t.page);
        const heart = pill(messageWith(t.page, `RS${RUN}`), '❤️');
        await heart.scrollIntoViewIfNeeded();
        await longPress(t.ctx, t.page, heart, async () => {
          await expect(t.page.getByRole('tooltip').first()).toContainText(A_NAME, { timeout: 3_000 });
          await shot(t.page, 'pills-who-reacted', w);
        });
      } finally {
        await t.ctx.close();
      }
    }

    // forwarded copy with go-to-original
    await pageA.goto(`/chats/c/${generalId}`);
    const fwd = pageA.getByTestId('forwarded-card').filter({ hasText: `F1${RUN}` });
    await fwd.scrollIntoViewIfNeeded();
    await expect(fwd.getByTestId('go-to-original')).toBeVisible();
    await settle(pageA);
    await shot(pageA, 'forwarded-go-to-original', w);
  }
});

test('11. a tap on a message at the end of a chat scrolled to its end shows its toolbar and keeps it (phone widths)', async () => {
  test.setTimeout(300_000);
  await goDm(pageA, 1280);
  await sendText(pageA, `TX${RUN} toolbar probe`);
  await sendText(pageA, `TY${RUN} last message`);
  await expect(messageWith(pageA, `TY${RUN}`)).toBeVisible();
  const failures: string[] = [];
  for (const w of [320, 375]) {
    await goDm(pageA, w);
    // TX is the second to last row, TY the last: both sit in the pinned-to-the-end stretch of the list.
    for (const text of [`TX${RUN}`, `TY${RUN}`]) {
      const msg = messageWith(pageA, text);
      await msg.scrollIntoViewIfNeeded();
      await pageA.waitForTimeout(800);
      await msg.click({ position: await pad(msg) });
      await pageA.waitForTimeout(800);
      const bar = msg.getByRole('toolbar', { name: 'Message actions' });
      const opacity = await bar.evaluate((el) => getComputedStyle(el).opacity);
      const selected = await msg.locator('[data-selected]').count();
      if (opacity !== '1' || selected !== 1) failures.push(`${w}px ${text}: toolbar opacity ${opacity}, selected rows ${selected} after the tap`);
      await pageA.keyboard.press('Escape'); // a click in the corner lands on the phone header
    }
  }
  expect(failures, 'the in-line toolbar stays open after a tap on a row at the end of the chat').toEqual([]);
});
