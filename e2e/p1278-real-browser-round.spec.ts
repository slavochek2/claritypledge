/**
 * @file p1278-real-browser-round.spec.ts
 * @description P1278 — a /live round driven through two real browser clients records a calibration row.
 *
 * Every other P1278 check runs at the database layer (e2e/integration/p1150-*, p1278-guest-round.spec.ts).
 * This one drives the real client end to end: two browsers, the real join flow, the real Speak button and
 * rating drawer, and a service-role read of what actually landed in story_verifications.
 *
 *   A. Signed-in pair — one row, naming both participants.
 *   B. A signed-in creator speaks, a signed-out guest rates — the guest submits LAST.
 *   C. A signed-out guest speaks, the signed-in creator rates — the creator submits LAST.
 *
 * B and C differ in which client submits last, and that matters: the row is written by the client of
 * whoever submits second (clarity-live-page.tsx, the `bothSubmitted` branch of the rating submit), and a
 * guest's client has no signed-in user. The order is therefore forced, never raced: the second rating is
 * submitted only after the room has recorded the first — which is also the only order the app allows.
 *
 * Each test proves the round COMPLETED (checksCount reached 1) before reading story_verifications, so a
 * missing row is distinguishable from a round that never finished.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
  type TestUser,
} from './helpers/test-user';
import { mockMicPermission, waitForDBPresence, waitForLiveStateKey } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted, type JoinOutcome } from './helpers/live-join';
import { dismissTermsDialog } from './helpers/test-session';

const GUEST = 'Gwen';

interface Room {
  code: string;
  id: string;
}

interface RoundRatings {
  checkerRating: unknown;
  responderRating: unknown;
}

interface VerificationRow {
  id: string;
  source: string | null;
  story_id: string | null;
  speaker_id: string | null;
  listener_id: string | null;
  speaker_rating: number | null;
  listener_rating: number | null;
}

/** The creator opens a new room through the real UI and returns its code and id. */
async function openRoom(creatorPage: Page): Promise<Room> {
  await creatorPage.goto('/live');
  await creatorPage.waitForLoadState('networkidle');
  await dismissTermsDialog(creatorPage);
  await creatorPage.getByRole('button', { name: 'New session' }).click();
  await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 15000 });

  const shareLink = await creatorPage.getByTestId('share-link').textContent();
  const code = shareLink!.split('/').pop()!.trim();
  expect(code).toHaveLength(6);

  const { data, error } = await supabaseAdmin.from('clarity_sessions').select('id').eq('code', code).single();
  expect(error, `room lookup failed: ${error?.message}`).toBeNull();
  return { code, id: data!.id as string };
}

/** The second person follows the invite link and takes the joiner seat. */
async function enterRoom(page: Page, code: string, name: string): Promise<JoinOutcome> {
  await page.goto(`/live/${code}`);
  const outcome = await completeLiveJoinIfPrompted(page, { name });
  await dismissTermsDialog(page);
  await waitForDBPresence('clarity_sessions', 'joiner_name', name, 'code', code);
  return outcome;
}

/** A guest took the seat: signed-out join form, no profile on the seat, the seat stamped. */
async function expectGuestSeat(outcome: JoinOutcome, roomId: string): Promise<void> {
  expect(outcome, 'the guest must reach the signed-out join form, or this is not a guest').toBe('guest-form');
  const { data: seat } = await supabaseAdmin
    .from('clarity_sessions')
    .select('joiner_profile_id, joiner_seat_claimed_at')
    .eq('id', roomId)
    .single();
  expect(seat?.joiner_profile_id, 'a guest holds no profile').toBeNull();
  expect(seat?.joiner_seat_claimed_at, 'the guest seat is stamped').not.toBeNull();
}

/**
 * One round, in the order the app enforces: the checker presses Speak and rates (Submit stays disabled
 * until a number is picked); only once the room has recorded that rating does the responder's drawer
 * open (live-mode-view.tsx getViewState, branch 4a), and the responder rates second.
 * Returns the two ratings the room recorded, so the row can be compared with them.
 */
async function playRound(
  checker: Page,
  responder: Page,
  code: string,
  checkerRating: number,
  responderRating: number,
): Promise<RoundRatings> {
  const speak = checker.getByTestId('start-check').filter({ visible: true }).first();
  await expect(speak).toBeEnabled({ timeout: 20000 });
  await speak.click();

  await expect(checker.getByText(/How well do you believe/i)).toBeVisible({ timeout: 15000 });
  // The scale's buttons are labelled "Rate N" (RatingButtons, partners/shared.tsx).
  await checker.getByRole('button', { name: `Rate ${checkerRating}`, exact: true }).click();
  await checker.getByRole('button', { name: 'Submit', exact: true }).click();
  await explained(waitForLiveStateKey(code, 'checkerSubmitted', true));

  // The responder's drawer is the proof its client has seen the first rating, so the order is certain.
  const responderPick = responder.getByRole('button', { name: `Rate ${responderRating}`, exact: true });
  await expect(responderPick).toBeVisible({ timeout: 20000 });
  await responderPick.click();
  await responder.getByRole('button', { name: 'Submit', exact: true }).click();

  // The round completed: both ratings are in and the room counted it.
  await explained(waitForLiveStateKey(code, 'checksCount', 1, 20000));
  const { data } = await supabaseAdmin.from('clarity_sessions').select('live_state').eq('code', code).single();
  const s = (data?.live_state ?? {}) as Record<string, unknown>;
  expect(s.checkerRating, 'the room recorded the checker rating that was picked').toBe(checkerRating);
  expect(s.responderRating, 'the room recorded the responder rating that was picked').toBe(responderRating);
  return { checkerRating: s.checkerRating, responderRating: s.responderRating };
}

async function rowsFor(sessionId: string): Promise<VerificationRow[]> {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .select('id, source, story_id, speaker_id, listener_id, speaker_rating, listener_rating')
    .eq('session_id', sessionId);
  if (error) throw new Error(`read story_verifications failed: ${error.message}`);
  return (data ?? []) as VerificationRow[];
}

/**
 * Polls until the round's row lands (or the deadline passes), then waits a little longer and re-reads,
 * so a second writer for the same round would be counted rather than raced.
 */
async function settledRows(sessionId: string, timeoutMs = 20000): Promise<VerificationRow[]> {
  const deadline = Date.now() + timeoutMs;
  while ((await rowsFor(sessionId)).length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 3000));
  return rowsFor(sessionId);
}

/**
 * Every failed call either browser made to our REST endpoint, so a refused write explains itself in the
 * failure message instead of surfacing only as a timeout on the room state.
 */
const failedRestCalls: string[] = [];

function recordFailedRestCalls(page: Page, label: string): void {
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/rest/v1/') || res.status() < 400) return;
    let body = '';
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      // The body can be gone once the page navigates; the status line is still worth keeping.
    }
    const line = `${label}: ${res.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')} -> ${res.status()} ${body}`;
    failedRestCalls.push(line);
    console.log(`[p1278] ${line}`);
  });
}

async function explained(wait: Promise<void>): Promise<void> {
  try {
    await wait;
  } catch (e) {
    throw new Error(
      `${(e as Error).message}\nFailed REST calls from either browser:\n${failedRestCalls.join('\n') || '(none)'}`,
    );
  }
}

/**
 * Fixtures are registered as they are created and removed in afterEach — which Playwright runs even when
 * a test times out. An earlier version cleaned up in a `finally` inside the test body, and three runs that
 * hit the test timeout left their users and rooms behind on the test project.
 */
interface Fixtures {
  contexts: BrowserContext[];
  users: TestUser[];
}
let fx: Fixtures;

async function openPage(browser: Browser, label: string): Promise<Page> {
  const context = await browser.newContext();
  fx.contexts.push(context);
  const page = await context.newPage();
  await mockMicPermission(page);
  recordFailedRestCalls(page, label);
  return page;
}

async function newUser(name: string): Promise<TestUser> {
  const user = await createTestUser({ name });
  fx.users.push(user);
  return user;
}

test.beforeEach(() => {
  fx = { contexts: [], users: [] };
  failedRestCalls.length = 0;
});

test.afterEach(async () => {
  for (const c of fx.contexts) await c.close().catch(() => {});
  const ids = fx.users.map((u) => u.user.id);
  if (ids.length) {
    // Every room these users created, including one opened in the UI before a timeout hit.
    const { data: rooms } = await supabaseAdmin.from('clarity_sessions').select('id, code').in('creator_profile_id', ids);
    for (const room of rooms ?? []) {
      // Rows first: story_verifications' participant foreign keys block deleting a user who still has one.
      const { error } = await supabaseAdmin.from('story_verifications').delete().eq('session_id', room.id);
      if (error) console.warn(`[p1278] verification cleanup failed: ${error.message}`);
      await deleteClaritySession(room.code as string);
    }
  }
  for (const u of fx.users) await deleteTestUser(u.user.id);
});

test.describe('P1278: a real-browser /live round records a calibration row', () => {
  test.describe.configure({ timeout: 150000 });

  test('A — a signed-in pair: one row, naming both participants', async ({ browser }) => {
    const creatorPage = await openPage(browser, 'creator');
    const joinerPage = await openPage(browser, 'joiner');
    const creator = await newUser('P1278Creator');
    const joiner = await newUser('P1278Joiner');
    await setTestSession(creatorPage, creator.email);
    await setTestSession(joinerPage, joiner.email);

    const room = await openRoom(creatorPage);
    await enterRoom(joinerPage, room.code, joiner.name);

    const round = await playRound(creatorPage, joinerPage, room.code, 7, 8);

    const rows = await settledRows(room.id);
    expect(rows, 'exactly one calibration row for the round').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'live',
      story_id: null,
      speaker_id: creator.user.id,
      listener_id: joiner.user.id,
      speaker_rating: round.checkerRating,
      listener_rating: round.responderRating,
    });
  });

  test('B — the creator speaks, a guest rates last: one row, the guest side empty', async ({ browser }) => {
    const creatorPage = await openPage(browser, 'creator');
    const guestPage = await openPage(browser, 'guest');
    const creator = await newUser('P1278Creator');
    await setTestSession(creatorPage, creator.email);

    const room = await openRoom(creatorPage);
    await expectGuestSeat(await enterRoom(guestPage, room.code, GUEST), room.id);

    const round = await playRound(creatorPage, guestPage, room.code, 7, 8);

    const rows = await settledRows(room.id);
    expect(rows, 'exactly one calibration row for the round').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'live',
      speaker_id: creator.user.id,
      listener_id: null,
      speaker_rating: round.checkerRating,
      listener_rating: round.responderRating,
    });
  });

  test('D — a guest using the creator\'s own name speaks: the row still names the guest as speaker', async ({ browser }) => {
    // Roles must come from the room's record of who asked, not from comparing display names: nothing stops
    // a guest typing the creator's name, and the database admits either orientation of a guest round
    // (migration arm 2), so a name-based decision records the wrong person as the speaker (codex, 2026-09-12).
    const creatorPage = await openPage(browser, 'creator');
    const guestPage = await openPage(browser, 'guest');
    const creator = await newUser('P1278Creator');
    await setTestSession(creatorPage, creator.email);

    const room = await openRoom(creatorPage);
    await expectGuestSeat(await enterRoom(guestPage, room.code, creator.name), room.id);

    const round = await playRound(guestPage, creatorPage, room.code, 6, 9);

    const rows = await settledRows(room.id);
    expect(rows, 'exactly one calibration row for the round').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'live',
      speaker_id: null,
      listener_id: creator.user.id,
      speaker_rating: round.checkerRating,
      listener_rating: round.responderRating,
    });
  });

  test('C — a guest speaks, the creator rates last: one row, the guest side empty', async ({ browser }) => {
    const creatorPage = await openPage(browser, 'creator');
    const guestPage = await openPage(browser, 'guest');
    const creator = await newUser('P1278Creator');
    await setTestSession(creatorPage, creator.email);

    const room = await openRoom(creatorPage);
    await expectGuestSeat(await enterRoom(guestPage, room.code, GUEST), room.id);

    const round = await playRound(guestPage, creatorPage, room.code, 6, 9);

    const rows = await settledRows(room.id);
    expect(rows, 'exactly one calibration row for the round').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'live',
      speaker_id: null,
      listener_id: creator.user.id,
      speaker_rating: round.checkerRating,
      listener_rating: round.responderRating,
    });
  });
});
