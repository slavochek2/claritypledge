/**
 * @file p1179-stake-surface.spec.ts
 * @description P1179 AC-9 / AC-10 — staking on the locked surface.
 *
 * AC-9 is asserted on the OBSERVED FEED REQUEST COUNT across the click, not on
 * "the list looked the same". A refetch that resolves fast enough to miss a
 * screenshot is still the defect: it is what produces the loading flash on a
 * slow phone in a room, which is the condition the criterion exists for.
 *
 * AC-10 uses an attendee whose room row records opted_in = FALSE. Founder,
 * verbatim: "everybody can stake, exactly like in feed." Opting out of the
 * Clarity Meeting Principle is not opting out of being measured.
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from './helpers/test-event';
import { createTestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { seedRoomMember, readRoomMember, deleteRoomMembers } from './helpers/test-event-room';
import { supabaseAdmin } from './helpers/supabase-admin';

// Per WORKER, not per millisecond: the file's tests run in parallel workers, each loading this
// module and running beforeAll, and two workers loading in the same ms shared a tag — each
// then saw the other's points (4 cards where 2 were seeded, 2026-09-18).
const TAG = `p1179x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Counts requests the page makes for the POINTS feed specifically. */
function countFeedRequests(page: Page) {
  const state = { n: 0 };
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/rest/v1/points') && req.method() === 'GET') state.n++;
  });
  return state;
}

test.describe('P1179 AC-9 / AC-10 — staking on the locked surface', () => {
  let eventId: string;
  let slug: string;
  const pointIds: string[] = [];
  const memberIds: string[] = [];

  test.beforeAll(async () => {
    const { user } = await createTestUser({ name: 'P1179 Stake Host' });
    const event = await createTestEvent(user.id);
    eventId = event.id;
    slug = event.slug;

    // Real public points carrying the tag — the surface reads the same table the
    // feed does, so anything less than a real row certifies nothing.
    //
    // Each point ALSO needs at least one position: getPublicPointsFeed ends with
    // `.filter(point => point.totalPositions > 0)` (P543, exclude zero-position
    // points), so a freshly created point is invisible to the feed and to this
    // surface. Seeding the point alone produced an empty state and a failure that
    // read like a tag-filter bug.
    for (const s of ['P1179 stake point one', 'P1179 stake point two']) {
      const p = await createTestPoint(user.id, { statement: `${s} ${Date.now()}`, tags: [TAG], visibility: 'public' });
      pointIds.push(p.id);
      await createTestPosition(p.id, user.id, 'agree');
    }
  });

  test.afterAll(async () => {
    if (memberIds.length) await deleteRoomMembers(memberIds);
    for (const id of pointIds) await deleteTestPoint(id);
    if (eventId) await deleteTestEvent(eventId);
  });

  test('the surface lists the tagged points oldest-first', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser);
    try {
      const page = await context.newPage();
      await page.goto(`/stake/${TAG}`);
      await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
      const cards = page.locator('[data-testid="stake-list"] > *');
      await expect(cards).toHaveCount(2);
      // oldest-first: the point created first is rendered first
      await expect(cards.first()).toContainText('one');
    } finally { await cleanup(); }
  });

  test('AC-9: staking updates the count with NO refetch of the list', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.goto(`/stake/${TAG}?event=${slug}`);
      await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });

      // Start counting only AFTER the initial load has settled.
      await page.waitForTimeout(1000);
      const feed = countFeedRequests(page);

      const agree = page.getByTestId('agree-group').first();
      await expect(agree).toBeVisible();
      await agree.click();

      // The count badge appears — the optimistic update landed.
      await expect(page.getByTestId('agree-count-badge').first()).toBeVisible({ timeout: 10000 });

      // ...and the list was never refetched.
      expect(feed.n, `the list was refetched ${feed.n}x across the stake — that is the loading flash`).toBe(0);

      // The skeleton never came back, and both cards are still mounted.
      await expect(page.locator('[data-testid="stake-list"] > *')).toHaveCount(2);
    } finally { await cleanup(); }
  });

  test('AC-10: an attendee who opted OUT at /meet can reach the surface and record a position', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      // The room row records the opt-OUT. This is the population the criterion is about.
      const member = await seedRoomMember(eventId, { profileId: user.user.id, optedIn: false });
      memberIds.push(member.id);
      expect((await readRoomMember(member.id))?.opted_in).toBe(false);

      const page = await context.newPage();
      await page.goto(`/stake/${TAG}?event=${slug}`);
      await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });

      const agree = page.getByTestId('agree-group').first();
      await expect(agree).toBeVisible();
      await agree.click();
      await expect(page.getByTestId('agree-count-badge').first()).toBeVisible({ timeout: 10000 });

      // Ground truth: the position is actually PERSISTED for this user, not just
      // painted optimistically. RLS is bypassed here on purpose so the assertion
      // sees the row rather than whatever a policy chose to return.
      // POLLED, not read once: the badge is optimistic, so the row lands after it.
      // A single immediate read cannot tell "not yet written" from "RLS refused the
      // write" — and telling those apart is the entire point of this criterion.
      // If this poll runs out, the write really was refused.
      await expect.poll(async () => {
        const { data } = await supabaseAdmin
          .from('point_positions')
          .select('id, position')
          .eq('user_id', user.user.id)
          .in('point_id', pointIds);
        return data?.length ?? 0;
      }, {
        message: 'the opted-out attendee recorded no position — the write was refused, not merely slow',
        timeout: 15000,
      }).toBeGreaterThan(0);

      // ...and they are still opted OUT. Staking must not flip that.
      expect((await readRoomMember(member.id))?.opted_in).toBe(false);
    } finally { await cleanup(); }
  });
});

/**
 * 2026-09-18 (founder screenshot: "when I remove my position here the point disappears
 * from /stake, why??"). On the standing instruments (STANDARD_STAKE_TAGS — cmp7 is seven
 * points) a point stays listed at zero positions: on clear, AND on a fresh load. Every
 * other tag keeps P543, like /feed.
 *
 * Uses the real `cmp7` tag, because the behaviour is keyed on it. The test DB's cmp7 list
 * holds other points, so cards are found by their unique statement, never counted.
 */
test.describe('/stake keeps zero-position points on the standing instruments', () => {
  const STANDARD = 'cmp7';
  const OTHER = `p1179z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ids: string[] = [];
  let ownerId: string;

  test.beforeAll(async () => {
    const { user } = await createTestUser({ name: 'P1179 Zero Owner' });
    ownerId = user.id;
  });

  test.afterAll(async () => {
    for (const id of ids) await deleteTestPoint(id);
  });

  test('a never-staked cmp7 point is listed; clearing your own last position keeps it, also after reload', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      const never = `P1179 never staked ${Date.now()}`;
      const neverPoint = await createTestPoint(ownerId, { statement: never, tags: [STANDARD], visibility: 'public' });
      ids.push(neverPoint.id);
      const statement = `P1179 only mine ${Date.now()}`;
      const mine = await createTestPoint(ownerId, { statement, tags: [STANDARD], visibility: 'public' });
      ids.push(mine.id);
      await createTestPosition(mine.id, user.user.id, 'agree');

      const page = await context.newPage();
      await page.goto(`/stake/${STANDARD}`);
      await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(never)).toBeVisible();

      const card = page.locator('[data-testid="stake-list"] > *').filter({ hasText: statement });
      await expect(card.getByTestId('agree-count-badge')).toHaveText('1');
      await card.getByTestId('agree-group').click(); // selected group -> its menu
      await page.getByRole('option', { name: /clear position/i }).click();
      // The app's own confirm (useRemovePositionGuard) — the founder's flow went through it too.
      await page.getByRole('button', { name: 'Remove position' }).click();

      // The withdrawal really happened (ground truth, RLS bypassed)...
      await expect.poll(async () => {
        const { data } = await supabaseAdmin.from('point_positions').select('id').eq('point_id', mine.id);
        return data?.length ?? -1;
      }, { timeout: 15000 }).toBe(0);
      // ...and the card is still there, at zero.
      await expect(card).toHaveCount(1);
      await expect(card.getByTestId('agree-count-badge')).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId('stake-list')).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(statement)).toBeVisible();
    } finally { await cleanup(); }
  });

  test('any OTHER tag still hides a zero-position point (P543 unchanged off the instruments)', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser);
    try {
      const staked = await createTestPoint(ownerId, { statement: `P1179 other staked ${Date.now()}`, tags: [OTHER], visibility: 'public' });
      ids.push(staked.id);
      await createTestPosition(staked.id, ownerId, 'agree');
      const bare = `P1179 other never staked ${Date.now()}`;
      const barePoint = await createTestPoint(ownerId, { statement: bare, tags: [OTHER], visibility: 'public' });
      ids.push(barePoint.id);

      const page = await context.newPage();
      await page.goto(`/stake/${OTHER}`);
      await expect(page.locator('[data-testid="stake-list"] > *')).toHaveCount(1, { timeout: 20000 });
      await expect(page.getByText(bare)).toHaveCount(0);
    } finally { await cleanup(); }
  });
});
