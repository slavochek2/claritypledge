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

const TAG = `p1179x${Date.now().toString(36)}`;

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
