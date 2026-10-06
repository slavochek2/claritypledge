/**
 * @file p1429-follow-up.spec.ts
 * @description P1429 — the five Clarity Night review fixes, each driven through the real page as
 * the person it affects would meet it. Live against the test DB.
 *
 *   A1 a star vote still saving when "Hide my photo" is tapped leaves the photo hidden
 *   A2 the host's event page puts someone who answered only in the room under Opted in, with N/10
 *   A3 a phone on Close past start + 12h leaves Close within a minute of the host's Reopen
 *   A4 is e2e/p1429-pinned-head.spec.ts (it needs the fake microphone for the whole file)
 *   A5 "Not now" whose response is lost moves on instead of "Could not save"
 */
import { test, expect, type Route } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember } from './helpers/test-event-room';

const HOUR = 60 * 60 * 1000;
const SHOTS = 'test-results/p1429';

const users: TestUser[] = [];
const events: TestEvent[] = [];
async function user(name: string) {
  const u = await createTestUser({ email: generateTestEmail(), name });
  users.push(u);
  return u;
}
async function event(hostId: string, start: Date, title: string, opts: { location?: string } = {}) {
  const e = await createTestEvent(hostId, start, { title, ...opts });
  events.push(e);
  return e;
}

test.afterAll(async () => {
  for (const u of users) {
    await supabaseAdmin.from('topic_ratings').delete().eq('user_id', u.user.id);
    await supabaseAdmin.from('personal_ask_answers').delete().eq('user_id', u.user.id);
  }
  for (const e of events) await deleteTestEvent(e.id);
  for (const u of users) await deleteTestUser(u.user.id);
});

test.describe('P1429', () => {
  let pageErrors: string[] = [];
  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
  });
  test.afterEach(async () => {
    expect(pageErrors).toEqual([]);
  });

  test('smoke + A1: a vote still saving when "Hide my photo" is tapped stays hidden', async ({ page }) => {
    const voter = await user('P1429 Voter');
    const title = `P1429 topic ${Date.now()}`;
    const { data: topic, error } = await supabaseAdmin
      .from('topic_candidates')
      .insert({ title, why: 'Test.', is_published: true, sort_order: -5000 })
      .select('id')
      .single();
    expect(error).toBeNull();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await setTestSession(page, voter.email);
      await page.goto('/topics');
      const row = page.getByTestId('topic-row').filter({ hasText: title });
      await expect(row).toBeVisible({ timeout: 20_000 });

      // The vote leaves with "show my photo" and is held in flight until the hide has landed.
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/rest/v1/rpc/rate_topic', async (route: Route) => { await held; await route.continue(); });
      await row.getByRole('radio', { name: '4 stars' }).click();

      const hide = page.getByLabel('Hide my photo on my votes');
      const hidden = page.waitForResponse((r) => r.url().includes('/rpc/set_my_topic_votes_public') && r.ok());
      await hide.check();
      await hidden;
      const voted = page.waitForResponse((r) => r.url().includes('/rpc/rate_topic'));
      release();
      expect((await voted).ok()).toBe(true);

      const { data: rating } = await supabaseAdmin
        .from('topic_ratings').select('rating, is_public').eq('topic_id', topic!.id).eq('user_id', voter.user.id).single();
      expect(rating).toEqual({ rating: 4, is_public: false });

      // What the voter sees after coming back: still hidden.
      await page.unroute('**/rest/v1/rpc/rate_topic');
      await page.reload();
      await expect(page.getByLabel('Hide my photo on my votes')).toBeChecked({ timeout: 20_000 });
      await page.screenshot({ path: `${SHOTS}/a1-topics-hidden-390.png` });
    } finally {
      await supabaseAdmin.from('topic_candidates').delete().eq('id', topic!.id);
    }
  });

  test('A1: the photo box shows the stored choice, even before any vote', async ({ page }) => {
    const shy = await user('P1429 Shy');
    await page.setViewportSize({ width: 390, height: 844 });
    await setTestSession(page, shy.email);
    await page.goto('/topics');
    const box = page.getByLabel('Hide my photo on my votes');
    await expect(box).not.toBeChecked({ timeout: 20_000 });
    const saved = page.waitForResponse((r) => r.url().includes('/rpc/set_my_topic_votes_public') && r.ok());
    await box.check();
    await saved;
    await page.reload();
    await expect(page.getByLabel('Hide my photo on my votes')).toBeChecked({ timeout: 20_000 });
  });

  test('A2: the host sees a room-only answer under Opted in with its number', async ({ page }) => {
    const host = await user('P1429 Host');
    const roomOnly = await user('P1429 Room Only');
    const prepOut = await user('P1429 Prep Out');
    const ev = await event(host.user.id, new Date(Date.now() + 24 * HOUR), 'P1429 host groups');
    await supabaseAdmin.from('events').update({ preparation_enabled: true }).eq('id', ev.id);
    await rsvpToEvent(ev.id, roomOnly.user.id);
    await rsvpToEvent(ev.id, prepOut.user.id);
    await supabaseAdmin.from('event_preparations').insert({ event_id: ev.id, profile_id: prepOut.user.id, opted_in: false, principle_rating: 4 });
    const { error } = await supabaseAdmin.from('event_room_members')
      .insert({ event_id: ev.id, profile_id: roomOnly.user.id, display_name: 'P1429 Room Only', opted_in: true, comprehension_rating: 7 });
    expect(error).toBeNull();

    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, host.email);
    await page.goto(`/events/${ev.slug}`);
    const inGroup = page.getByTestId('host-opt-in-in');
    await expect(inGroup).toContainText('P1429 Room Only', { timeout: 20_000 });
    await expect(inGroup).toContainText('understood 7/10');
    await expect(page.getByTestId('host-opt-in-out')).toContainText('P1429 Prep Out');
    await expect(page.getByTestId('host-opt-in-undecided')).toHaveCount(0);
    await inGroup.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/a2-host-groups-375.png`, fullPage: true });

    // Host-only: the attendee sees the plain list, no groups.
    const p2 = await page.context().browser()!.newPage();
    await setTestSession(p2, roomOnly.email);
    await p2.goto(`/events/${ev.slug}`);
    await expect(p2.getByText('P1429 Prep Out').first()).toBeVisible({ timeout: 20_000 });
    await expect(p2.getByTestId('host-opt-in-groups')).toHaveCount(0);
    await p2.close();
  });

  test('A3: a phone on Close past start + 12h leaves Close within a minute of Reopen', async ({ page }) => {
    const host = await user('P1429 Reopen Host');
    const guest = await user('P1429 Reopen Guest');
    const ev = await event(host.user.id, new Date(Date.now() - 13 * HOUR), 'P1429 reopen');
    await rsvpToEvent(ev.id, guest.user.id);
    await seedRoomMember(ev.id, { displayName: 'P1429 Reopen Guest', profileId: guest.user.id });
    await supabaseAdmin.from('event_room_members').update({ opted_in: true, comprehension_rating: 8 }).eq('event_id', ev.id).eq('profile_id', guest.user.id);
    await supabaseAdmin.from('event_rounds').insert({
      event_id: ev.id, round_no: 1, group_size: 3,
      started_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      ended_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });

    await page.clock.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await setTestSession(page, guest.email);
    await page.goto(`/events/${ev.slug}/meet`);
    await expect(page.getByTestId('room-close')).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/a3-before-reopen-390.png` });

    // The host reopens: a fresh round.
    const { error } = await supabaseAdmin.from('event_rounds').insert({ event_id: ev.id, round_no: 2, group_size: 3 });
    expect(error).toBeNull();
    await page.clock.runFor(61_000);
    await expect(page.getByTestId('room-close')).toHaveCount(0, { timeout: 15_000 });
    await page.screenshot({ path: `${SHOTS}/a3-after-reopen-390.png` });
  });

  test('A5: "Not now" whose response is lost moves on, recorded once', async ({ page }) => {
    const host = await user('P1429 Close Host');
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1429-test-host', is_verified: true, has_pledged: true }).eq('id', host.user.id);
    const guest = await user('P1429 Close Guest');
    const ev = await event(host.user.id, new Date(Date.now() - HOUR), 'Clarity Night #97: P1429 close', { location: 'Test venue, Chiang Mai' });
    await rsvpToEvent(ev.id, guest.user.id);
    // Already a member (no community ask) with feedback given: the close opens on the LinkedIn ask.
    const { data: org } = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').single();
    if (org) await supabaseAdmin.from('membership').upsert({ org_id: org.id, user_id: guest.user.id }, { onConflict: 'org_id,user_id' });
    await supabaseAdmin.from('event_feedback').insert({ event_id: ev.id, user_id: guest.user.id, score: 9, liked: 'Good.' });

    await page.setViewportSize({ width: 390, height: 844 });
    await setTestSession(page, guest.email);
    // The write reaches the server; its response never comes back.
    let calls = 0;
    await page.route('**/rest/v1/rpc/answer_personal_ask', async (route: Route) => {
      if (calls++ === 0) {
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.goto(`/events/${ev.slug}/close`);
    await expect(page.getByTestId('ask-connect')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Could not save')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/a5-moved-on-390.png` });
    const { data: rows } = await supabaseAdmin.from('personal_ask_answers').select('ask, answer').eq('user_id', guest.user.id);
    expect(rows).toEqual([{ ask: 'connect', answer: 'no' }]);
    // The page retried the same write once; the server answered the repeat with success.
    expect(calls).toBe(2);
  });
});

