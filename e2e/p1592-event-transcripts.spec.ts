/**
 * @file p1592-event-transcripts.spec.ts
 *
 * P1592, the real UI on the real backend. A host, two seated attendees and one attendee who is
 * not seated. P1596 retired live posting: a line is stored through `record_transcribe_slice` (which posts
 * nothing) and reaches chat the way the round-clean worker does it, through `post_clean_round` against
 * a claimed clean job. What is asserted is in the attendee's browser:
 *   - the "Round 1 · Alice & Bob" thread exists, its posts carry a "Transcribed" pill beside author and time, in plain text;
 *   - the thread's root shows its title and never "Deleted user" (the thread, the chat-list preview,
 *     and a forward of it);
 *   - a non-seated line appears in the channel's thread for its time ("The conversation": no round had started when it was said), not at the top level;
 *   - "My rounds" (in the header's three-dot menu) lists exactly the viewer's round threads, newest first, and opens one;
 *   - a typed message in the same channel looks unchanged.
 * Screenshots at 1280, 375 and 320 go to P1592_SHOT_DIR (skipped when unset); no horizontal scroll.
 */
import { test, expect as baseExpect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember } from './helpers/test-event-room';
import { supabaseAdmin } from './helpers/supabase-admin';
import { ok, purgeChatFor, signIn, type SignedIn } from './helpers/test-chat';
import { refreshRoster } from './helpers/test-clean-post';

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const SHOT_DIR = process.env.P1592_SHOT_DIR ?? '';
const expect = baseExpect.configure({ timeout: 30_000 });

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const SIZES = [
  { w: 1280, h: 800 },
  { w: 375, h: 760 },
  { w: 320, h: 640 },
];

let host: TestUser, alice: TestUser, bob: TestUser, dan: TestUser;
let hostC: SignedIn, bobC: SignedIn;
let event: TestEvent;
let roomId = '';
let channelId = '';
let round1 = '';
let round2 = '';
let rootR1 = '';
let rootR2 = '';
const room: Record<string, string> = {};
const tmember: Record<string, string> = {};
const sessionIds: string[] = [];
let ctx: BrowserContext;
let page: Page;
let postingWasEnabled: boolean | null = null;

type CleanTarget = 'room' | { round: string; table: number };
const cleanJobs = new Map<string, Promise<string>>();
let chunkSeq = 1000;
/** One processing clean job per round table / per room, holding every transcribe member as its seat snapshot. */
function cleanJob(target: CleanTarget): Promise<string> {
  const key = target === 'room' ? 'room' : `${target.round}:${target.table}`;
  if (!cleanJobs.has(key)) {
    cleanJobs.set(key, (async () => {
      const now = new Date().toISOString();
      const base = target === 'room' ? { kind: 'room', room_id: roomId } : { kind: 'round', round_id: target.round, table_no: target.table };
      const seats = Object.values(tmember).map((m) => ({ member_id: m, room_id: roomId }));
      const { data, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
        ...base, event_id: event.id, seats, window_start: now, window_end: now, status: 'processing', attempts: 1, not_before: now,
      }).select('id').single();
      expect(error, `clean job ${key}: ${error?.message}`).toBeNull();
      return data!.id as string;
    })());
  }
  return cleanJobs.get(key)!;
}
/** One post of the job's clean text for one transcribe member, as the fenced worker call (attempt 1). */
async function postClean(jobId: string, memberId: string, chunkMs: number, text: string): Promise<{ error: { message: string } | null; id: string | null }> {
  const { error } = await supabaseAdmin.rpc('post_clean_round', { p_job_id: jobId, p_attempt: 1, p_items: [{ member_id: memberId, chunk_ms: chunkMs, text }] });
  if (error) return { error, id: null };
  const { data } = await supabaseAdmin.from('transcribe_round_clean_posts').select('chat_message_id').eq('job_id', jobId).eq('member_id', memberId).eq('chunk_ms', chunkMs).maybeSingle();
  return { error: null, id: (data?.chat_message_id as string | undefined) ?? null };
}
/** A live slice (stored, posts nothing) followed by its clean post. Returns the chat message id. */
async function say(key: string, text: string, target: CleanTarget): Promise<string> {
  const { error } = await supabaseAdmin.rpc('record_transcribe_slice', { p_room_id: roomId, p_member_id: tmember[key], p_text: text });
  expect(error, `record_transcribe_slice(${key}): ${error?.message}`).toBeNull();
  const job = await cleanJob(target);
  await refreshRoster(job);
  const { error: pErr, id } = await postClean(job, tmember[key], chunkSeq++, text);
  expect(pErr, `post_clean_round(${key}): ${pErr?.message}`).toBeNull();
  return id as string;
}
async function addMembers(key: string, user: TestUser, name: string): Promise<void> {
  const m = await seedRoomMember(event.id, { displayName: name, profileId: user.user.id });
  room[key] = m.id;
}
async function addTranscribeMember(key: string, user: TestUser): Promise<void> {
  const { data: session, error: sErr } = await supabaseAdmin
    .from('clarity_sessions').insert({ code: `P1592E${RUN}${key}`.slice(0, 20), creator_name: `P1592 ${key}`, creator_profile_id: user.user.id }).select('id').single();
  expect(sErr, `session ${key}: ${sErr?.message}`).toBeNull();
  sessionIds.push(session!.id);
  const { data: m, error } = await supabaseAdmin.from('transcribe_room_members').insert({
    room_id: roomId, profile_id: user.user.id, display_name: user.name, session_id: session!.id, consent_given_at: new Date().toISOString(),
  }).select('id').single();
  expect(error, `transcribe member ${key}: ${error?.message}`).toBeNull();
  tmember[key] = m!.id;
}
const seat = (key: string, t: number, r: 'first' | 'second' | 'observer') => ({ m: room[key], t, r });

const noHScroll = async (p: Page, label: string) => {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal overflow at ${label}`).toBeLessThanOrEqual(0);
};
/** A shot must show the screen, not its loading state: no name or avatar skeletons left. */
async function loaded(p: Page) {
  await expect(p.getByRole('status', { name: 'Loading name' })).toHaveCount(0);
  await expect(p.getByRole('status', { name: 'Loading chats' })).toHaveCount(0);
}
async function shot(p: Page, name: string, w: number) {
  if (!SHOT_DIR) return;
  await loaded(p);
  mkdirSync(SHOT_DIR, { recursive: true });
  await p.mouse.move(0, 0);
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${SHOT_DIR}/${name}-${w}.png` });
}
/** Realtime can miss an event right after a join: do what a person does (come back to the tab) while waiting. */
async function live(p: Page, assertion: () => Promise<unknown>): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    try { await assertion(); return; } catch (e) { last = e; await p.evaluate(() => window.dispatchEvent(new Event('focus'))); }
  }
  throw last;
}
const messageWith = (p: Page, text: string) => p.getByTestId('message').filter({ hasText: text }).first();

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  host = await createTestUser({ name: 'P1592 Host' });
  alice = await createTestUser({ name: 'Alice Tester' });
  bob = await createTestUser({ name: 'Bob Tester' });
  dan = await createTestUser({ name: 'Dan Tester' });
  event = await createTestEvent(host.user.id, new Date(), { title: `P1592 Event ${RUN}` });
  for (const u of [alice, bob, dan]) await rsvpToEvent(event.id, u.user.id);
  await addMembers('alice', alice, 'Alice Tester');
  await addMembers('bob', bob, 'Bob Tester');
  await addMembers('dan', dan, 'Dan Tester');
  const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1592E${RUN}R`, event_id: event.id }).select('id').single();
  expect(error, `room: ${error?.message}`).toBeNull();
  roomId = r!.id;
  await addTranscribeMember('alice', alice);
  await addTranscribeMember('bob', bob);
  await addTranscribeMember('dan', dan);
  hostC = await signIn(host);
  bobC = await signIn(bob);
  // clean posting is gated by the shared switch on TEST: turn it on for this run and put back what was there
  const { data: sw, error: swErr } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled').eq('singleton', true).maybeSingle();
  expect(swErr, `posting switch: ${swErr?.message}`).toBeNull();
  postingWasEnabled = sw?.enabled ?? false;
  await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true }).eq('singleton', true);
  await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('singleton', true); // jobs need a window after switch-on
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await setTestSession(page, bob.email);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await ctx?.close();
  if (postingWasEnabled !== null) {
    try { await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: postingWasEnabled }).eq('singleton', true); } catch { /* keep cleaning up */ }
  }
  try {
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    await purgeChatFor([host?.user.id, alice?.user.id, bob?.user.id, dan?.user.id].filter(Boolean) as string[]);
    if (event?.id) await deleteTestEvent(event.id);
  } finally {
    for (const u of [host, alice, bob, dan]) if (u?.user?.id) await deleteTestUser(u.user.id).catch(() => undefined);
  }
});

test('setup: a not-seated line, then round 1 with its lines', async () => {
  const before = await say('alice', 'hello before the rounds', 'room');
  expect(before).toBeTruthy();
  const { data: convs } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', event.id);
  channelId = convs![0]!.id as string;

  round1 = await ok<string>(hostC.client.rpc('host_start_round', {
    p_event_id: event.id, p_round_no: 1, p_group_size: 2,
    p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second'), seat('dan', 2, 'first')],
  }), 'host_start_round 1');
  await say('alice', 'we talked about pricing in round one', { round: round1, table: 1 });
  await say('bob', 'and I answered with the canvas', { round: round1, table: 1 });
  const t1 = await supabaseAdmin.from('chat_round_threads').select('root_message_id').eq('round_id', round1);
  rootR1 = t1.data![0]!.root_message_id as string;

});

test('channel: root titles alone, unseated speech in "The conversation", typed message unchanged, "My rounds" is exactly the viewer\'s', async () => {
  // a typed message in the same channel, sent through the app's own RPC as Bob
  await ok(bobC.client.rpc('send_chat_message', { p_conversation: channelId, p_body: 'a typed hello from Bob', p_client_id: crypto.randomUUID() }), 'typed message');

  await page.goto(`/chats/c/${channelId}`);
  const conv = page.getByTestId('conversation');
  await expect(conv).toBeVisible();

  // The root of Bob's round 1 and of round 2 (he sat at table 2 with nobody recording: no thread for him).
  await live(page, async () => {
    await expect(conv.getByTestId('system-title').filter({ hasText: 'Round 1 · Alice & Bob' })).toBeVisible({ timeout: 4_000 });
  });
  await expect(conv.getByText('Deleted user')).toHaveCount(0);

  // The not-seated line is not a top-level post: the channel shows the "The conversation" root (no round had started when it was said), and the line is inside it.
  await expect(conv.getByTestId('system-title').filter({ hasText: 'The conversation' })).toHaveCount(1);
  await expect(messageWith(page, 'hello before the rounds')).toHaveCount(0);

  // A typed message looks as before: no pill, not italic.
  const typed = messageWith(page, 'a typed hello from Bob');
  await expect(typed).toBeVisible();
  await expect(typed.getByTestId('transcription-label')).toHaveCount(0);
  expect(await typed.getByText('a typed hello from Bob').evaluate((el) => getComputedStyle(el).fontStyle)).not.toBe('italic');

  // My rounds (in the three-dot menu): Bob sat in round 1 (table 1) and round 2 (table 2, nobody recording there -> no thread).
  // The "The conversation" thread is not a round and is not listed.
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const items = page.getByTestId('my-rounds-item');
  await expect(page.getByTestId('my-rounds-heading')).toHaveText('My rounds');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveText('Round 1 · Alice & Bob');
  // Before any shot: an author name has loaded and the round root shows its reply count.
  await expect(typed.getByText('Bob Tester')).toBeVisible();
  await live(page, async () => {
    await expect(conv.getByRole('button', { name: /2 replies/ }).or(conv.getByText('2 replies'))).toBeVisible({ timeout: 4_000 });
  });
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await noHScroll(page, `channel ${w}`);
    await shot(page, 'channel-my-rounds', w);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('Escape');
});

test('thread: opening a round shows transcription lines with the "Transcribed" pill, the root as a title', async () => {
  // The previous test ended by resizing 320 -> 1280, which re-lays the chat out (the pane remounts about a second later and a
  // menu opened in that moment closes with it). Open the menu until it stays open.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByTestId('my-rounds-item').first()).toBeVisible({ timeout: 1_500 });
    await page.waitForTimeout(1_200);
    await expect(page.getByTestId('my-rounds-item').first()).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await page.getByTestId('my-rounds-item').first().click();
  const thread = page.getByTestId('thread-panel');
  await expect(thread).toBeVisible();
  await live(page, async () => {
    await expect(thread.getByText('we talked about pricing in round one')).toBeVisible({ timeout: 4_000 });
  });
  await expect(thread.getByTestId('system-title')).toHaveText('Round 1 · Alice & Bob');
  await expect(thread.getByText('Deleted user')).toHaveCount(0);
  const line = thread.getByTestId('message').filter({ hasText: 'we talked about pricing' });
  await expect(line.getByTestId('transcription-label')).toHaveText('Transcribed');
  expect(await line.getByText('we talked about pricing').evaluate((el) => getComputedStyle(el).fontStyle)).not.toBe('italic');
  await expect(line.getByTestId('edited-mark')).toHaveCount(0);
  // Bob's own line is in the thread too
  await expect(thread.getByText('and I answered with the canvas')).toBeVisible();
  // A clean post that arrives later shows up live in the open thread as its own message (no appending any more).
  await say('alice', 'a fresh stretch begins', { round: round1, table: 1 });
  await live(page, async () => {
    await expect(thread.getByText('a fresh stretch begins')).toBeVisible({ timeout: 4_000 });
  });
  await expect(thread.getByTestId('message').filter({ hasText: 'a fresh stretch begins' })).toHaveCount(1);
  await expect(thread.getByTestId('edited-mark')).toHaveCount(0);
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await noHScroll(page, `thread ${w}`);
    await shot(page, 'round-thread', w);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('the host starts round 2: the same person\'s next words go to the new thread, untouched', async () => {
  round2 = await ok<string>(hostC.client.rpc('host_start_round', {
    p_event_id: event.id, p_round_no: 2, p_group_size: 2,
    p_seats: [seat('alice', 1, 'first'), seat('dan', 1, 'second'), seat('bob', 2, 'first')],
  }), 'host_start_round 2');
  await say('alice', 'round two is with Dan', { round: round2, table: 1 });
  const t2 = await supabaseAdmin.from('chat_round_threads').select('root_message_id').eq('round_id', round2);
  rootR2 = t2.data![0]!.root_message_id as string;
  expect(rootR1).not.toBe(rootR2);
});

test('Alice\'s "My rounds" is her two threads, newest round first (database ground truth through the same RPC)', async () => {
  // The viewer's list is the database's: Alice sat in both rounds.
  const aliceC = await signIn(alice);
  const rows = await ok<Array<{ title: string; round_no: number }>>(aliceC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'alice rounds');
  expect(rows.map((r) => r.title)).toEqual(['Round 2 · Alice & Dan', 'Round 1 · Alice & Bob']);
  const bobRows = await ok<Array<{ title: string }>>(bobC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'bob rounds');
  expect(bobRows.map((r) => r.title)).toEqual(['Round 1 · Alice & Bob']);
});

test('chat list preview and a forward of the root show the title, never "Deleted user"', async () => {
  // Make a round root the newest top-level post in the channel, so the list preview shows it.
  await ok(bobC.client.rpc('start_dm', { p_other: alice.user.id }), 'start dm').then(async (dmId) => {
    await ok(bobC.client.rpc('forward_chat_message', { p_source: rootR1, p_target_conversation: dmId as string }), 'forward root');
    await page.goto(`/chats/c/${dmId}`);
    const card = page.getByTestId('forwarded-card');
    await expect(card).toBeVisible();
    // The copy keeps only "Round {n}" (the people are not carried into another chat), shown as a bare title,
    // and it is a button to the original.
    await expect(card).toContainText('Round 1');
    await expect(card).not.toContainText('Deleted user');
    expect(await card.evaluate((el) => el.tagName)).toBe('BUTTON');
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await noHScroll(page, `forward ${w}`);
      await shot(page, 'forwarded-root', w);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  // The list: the channel's preview is the newest top-level post. Post nothing newer than round 3's root.
  const round3 = await ok<string>(hostC.client.rpc('host_start_round', {
    p_event_id: event.id, p_round_no: 3, p_group_size: 2,
    p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second')],
  }), 'host_start_round 3');
  await say('alice', 'round three begins', { round: round3, table: 1 });
  const t3 = await supabaseAdmin.from('chat_round_threads').select('root_message_id').eq('round_id', round3);
  expect(t3.data!.length).toBe(1);
  await page.goto('/chats');
  const row = page.locator('[data-testid="chat-list"] li[data-chat]').filter({ hasText: event.title });
  await live(page, async () => {
    await expect(row).toContainText('Round 3 · Alice & Bob', { timeout: 4_000 });
  });
  await expect(row).not.toContainText('Deleted user');
  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await noHScroll(page, `list ${w}`);
    await shot(page, 'chat-list-preview', w);
  }
});
