/**
 * @file p1337-rounds.spec.ts
 * @description P1337 — the host runs an evening from /events/:slug/host, and each attendee's room
 * page says where to sit. Live against the test DB.
 *
 * Covers: the host-only gate and the "Run this event" entry; Start round groups the room into
 * tables of speaker / listener / observer; a two-tap swap and its Undo; "Seat now" for a late arrival; a late arrival sees "You
 * join the next round"; tapping a name and "Out" (on the tile) takes someone out of the next round; the attendee's
 * card, the "I'm at table N" tap and that skipping it blocks nothing; no black layer while the pair
 * talk, the observer's clock on their card; "Did your position move?"; earlier rounds on the room page;
 * "+1 min" and the next round's minutes; the projector view; group size 2 has no observer.
 *
 * The round clock is driven by moving event_rounds.started_at with the service role rather than
 * waiting real minutes.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember } from './helpers/test-event-room';

const MIN = 60_000;

async function backdateCurrentRound(eventId: string, msAgo: number) {
  const { data } = await supabaseAdmin
    .from('event_rounds')
    .select('id')
    .eq('event_id', eventId)
    .is('ended_at', null)
    .single();
  const { error } = await supabaseAdmin
    .from('event_rounds')
    .update({ started_at: new Date(Date.now() - msAgo).toISOString() })
    .eq('id', data!.id);
  expect(error).toBeNull();
}

async function seats(eventId: string) {
  const { data: rounds } = await supabaseAdmin
    .from('event_rounds')
    .select('id, round_no')
    .eq('event_id', eventId)
    .order('round_no', { ascending: false })
    .limit(1);
  const { data } = await supabaseAdmin
    .from('event_round_seats')
    .select('room_member_id, table_no, role, confirmed_at')
    .eq('round_id', rounds![0].id);
  return data!;
}

test.describe('P1337 rounds — host panel and the attendee card', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let ana: TestUser; // attendee who signs in
  let late: TestUser; // joins the room after round 1 started
  let event: TestEvent;
  let anaMember: string;
  const fillers: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1337 Host' });
    ana = await createTestUser({ email: generateTestEmail(), name: 'Ana Attendee' });
    late = await createTestUser({ email: generateTestEmail(), name: 'Lee Late' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1337 rounds e2e' });
    await rsvpToEvent(event.id, ana.user.id);
    await rsvpToEvent(event.id, late.user.id);
    anaMember = (await seedRoomMember(event.id, { displayName: 'Ana Attendee', profileId: ana.user.id })).id;
    for (const name of ['Ben Brown', 'Cy Clark', 'Dee Dunn', 'Eli Ernst', 'Fay Fox']) {
      fillers.push((await seedRoomMember(event.id, { displayName: name })).id);
    }
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    for (const u of [host, ana, late]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function asHost(page: Page) {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/host`);
    await expect(page.getByTestId('host-panel')).toBeVisible();
  }

  test('smoke: the host panel loads for the host with no console errors; others are refused', async ({ page, browser }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await asHost(page);
    await expect(page.getByTestId('host-room-count')).toHaveText('6 in the room');
    await expect(page.getByTestId('host-member')).toHaveCount(6);
    expect(errors.filter(e => !/favicon|sentry|mixpanel/i.test(e))).toEqual([]);

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await setTestSession(other, ana.email);
    await other.goto(`/events/${event.slug}/host`);
    await expect(other.getByTestId('host-not-allowed')).toBeVisible();
    await ctx.close();
  });

  test('"Run this event" on the event page is the host’s entry', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}`);
    await page.getByTestId('run-this-event').click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/host$`));
  });

  test('Start round 1 seats everyone at tables of three: first, second, observer', async ({ page }) => {
    await asHost(page);
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1');
    await expect(page.getByTestId('round-grid-name')).toHaveCount(6);
    // Roles are columns with the printed cards' letters, not a label on every tile.
    await expect(page.getByTestId('round-grid-role')).toHaveText(['SSpeaker 1', 'LSpeaker 2', 'OObserver']);
    const rows = await seats(event.id);
    expect(rows).toHaveLength(6);
    for (const table of [1, 2]) {
      const at = rows.filter(r => r.table_no === table).map(r => r.role).sort();
      expect(at).toEqual(['first', 'observer', 'second']);
    }
    // "Next round" once a round runs — and absent for the first seconds (the double-tap lock).
    await expect(page.getByTestId('host-primary')).toHaveCount(0);
    await expect(page.getByTestId('host-primary')).toHaveText('Next round', { timeout: 20_000 });
  });

  test('"+1 min" adds a minute to the part running now', async ({ page }) => {
    const total = async () => {
      const { data } = await supabaseAdmin.from('event_rounds').select('seating_s, first_s, second_s, observer_s').eq('event_id', event.id).is('ended_at', null).single();
      return data!.seating_s + data!.first_s + data!.second_s + data!.observer_s;
    };
    const before = await total();
    await asHost(page);
    await expect(page.getByTestId('host-part')).toBeVisible();
    await page.getByTestId('host-extend').click();
    await expect.poll(total).toBe(before + 60);
  });

  test('a two-tap swap moves both people, and Undo puts them back', async ({ page }) => {
    await asHost(page);
    const before = await seats(event.id);
    const names = page.getByTestId('round-grid-name');
    // First tile of table 1 and first tile of table 2 (grid order is table, then role).
    await names.nth(0).click();
    await names.nth(3).click();
    await expect(page.getByTestId('host-undo')).toBeVisible();
    await expect.poll(async () => {
      const after = await seats(event.id);
      return after.filter(a => before.find(b => b.room_member_id === a.room_member_id)!.table_no !== a.table_no).length;
    }).toBe(2);
    await page.getByTestId('host-undo').click();
    await expect.poll(async () => {
      const after = await seats(event.id);
      return after.every(a => before.find(b => b.room_member_id === a.room_member_id)!.table_no === a.table_no);
    }).toBe(true);
  });

  test('the attendee sees their table, role and the tap; skipping the tap blocks nothing', async ({ page }) => {
    await setTestSession(page, ana.email);
    await page.goto(`/events/${event.slug}/meet`);
    const card = page.getByTestId('round-card');
    await expect(card).toBeVisible();
    const mine = (await seats(event.id)).find(s => s.room_member_id === anaMember)!;
    await expect(page.getByTestId('round-card-table')).toHaveText(`Table ${mine.table_no}`);
    await expect(card).toHaveAttribute('data-role', mine.role);
    await expect(page.getByTestId('room-run-event')).toHaveCount(0); // host-only link
    // The rest of the room page is still there and usable — the card is not a gate.
    await expect(page.getByTestId('room-roster')).toBeVisible();

    await page.getByTestId('round-card-confirm').click();
    await expect(page.getByTestId('round-card-confirmed')).toBeVisible();
    await expect.poll(async () => (await seats(event.id)).find(s => s.room_member_id === anaMember)!.confirmed_at).not.toBeNull();
  });

  test('a late arrival is told they join at the next round', async ({ page }) => {
    await seedRoomMember(event.id, { displayName: 'Lee Late', profileId: late.user.id });
    await setTestSession(page, late.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('round-card-waiting')).toContainText('You join the next round');
  });

  test('"Seat now" puts a late arrival into the running round without moving anyone', async ({ page }) => {
    const before = await seats(event.id);
    await asHost(page);
    await page.getByTestId('host-seat-now').click();
    await expect.poll(async () => (await seats(event.id)).length).toBe(before.length + 1);
    const after = await seats(event.id);
    for (const b of before) {
      const a = after.find(x => x.room_member_id === b.room_member_id)!;
      expect([a.table_no, a.role]).toEqual([b.table_no, b.role]);
    }
    await setTestSession(page, late.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('round-card')).toBeVisible();
  });

  test('while the pair talk the page stays theirs; only the observer\'s card carries the clock', async ({ page }) => {
    await backdateCurrentRound(event.id, 2 * MIN); // a minute into the first speaker's six
    const mine = (await seats(event.id)).find(s => s.room_member_id === anaMember)!;
    await setTestSession(page, ana.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('round-card')).toBeVisible();
    // Founder walkthrough 4: no black layer drawn over the phone.
    await expect(page.getByTestId('round-dark')).toHaveCount(0);
    const live = { first: 'You speak', second: 'You listen', observer: 'You observe' }[mine.role as 'first' | 'second' | 'observer'];
    await expect(page.getByTestId('round-status')).toContainText(live);
    if (mine.role === 'observer') await expect(page.getByTestId('round-observer-clock')).toBeVisible();
    else await expect(page.getByTestId('round-observer-clock')).toHaveCount(0);
  });

  test('after the round a speaker is asked whether their position moved', async ({ page }) => {
    await backdateCurrentRound(event.id, 20 * MIN);
    // Make Ana a speaker so the question applies, whichever role the grouping gave her.
    const rows = await seats(event.id);
    const mine = rows.find(s => s.room_member_id === anaMember)!;
    if (mine.role === 'observer') {
      const speaker = rows.find(s => s.table_no === mine.table_no && s.role === 'first')!;
      const { data: round } = await supabaseAdmin.from('event_rounds').select('id').eq('event_id', event.id).is('ended_at', null).single();
      await supabaseAdmin.from('event_round_seats').update({ role: 'observer' }).eq('round_id', round!.id).eq('room_member_id', speaker.room_member_id);
      await supabaseAdmin.from('event_round_seats').update({ role: 'first' }).eq('round_id', round!.id).eq('room_member_id', anaMember);
    }
    await setTestSession(page, ana.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('round-dark')).toHaveCount(0);
    await expect(page.getByTestId('round-card-moved')).toBeVisible();
    await page.getByRole('button', { name: 'No' }).click();
    await expect(page.getByText('Thanks.')).toBeVisible();
  });

  test('the projector shows the round, the tables with roles, and the clock', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/host?view=screen`);
    await expect(page.getByTestId('host-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Round 1' })).toBeVisible();
    await expect(page.getByText('Table 1')).toBeVisible();
    // Six seated at the start, plus the late arrival seated with "Seat now".
    await expect(page.locator('[data-testid=screen-table] [data-role-badge]')).toHaveCount(7);
    await expect(page.getByTestId('round-clock')).toHaveAttribute('data-phase', 'over');
  });

  test('"Out" takes someone out of the next round; the late arrival is seated in it', async ({ page }) => {
    await asHost(page);
    // Tap the name, then Out — the one presence control (founder: out until brought back).
    const leaver = page.getByTestId('round-grid-name').filter({ hasText: 'Fay' });
    await leaver.click();
    await page.getByTestId('host-mark-left').click();
    await expect(leaver).toHaveAttribute('data-out', 'true');
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 2');
    const rows = await seats(event.id);
    expect(rows.some(r => r.room_member_id === fillers[4])).toBe(false);
    expect(rows).toHaveLength(6); // 6 seated: five of the first six, plus the late arrival
    await expect(page.getByTestId('host-past-rounds')).toContainText('Round 1');
  });

  test('the room page lists the rounds behind you with who you sat with', async ({ page }) => {
    await setTestSession(page, ana.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('round-past')).toContainText('Round 1');
  });

  test('group size 2 runs a round with no observer', async ({ page }) => {
    await asHost(page);
    await page.getByTestId('host-settings').locator('summary').click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    // Minutes for the next round: two minutes to find tables.
    await page.getByRole('button', { name: 'Tables: one minute more' }).click();
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 3');
    const { data: r3 } = await supabaseAdmin.from('event_rounds').select('seating_s, first_s').eq('event_id', event.id).eq('round_no', 3).single();
    expect(r3).toEqual({ seating_s: 120, first_s: 360 });
    const rows = await seats(event.id);
    expect(rows.some(r => r.role === 'observer')).toBe(false);
    // No fixed count of rounds (founder, 2026-10-04): after the third, the button still says Next round.
    await expect(page.getByTestId('host-primary')).toHaveText('Next round', { timeout: 20_000 });
  });
});
