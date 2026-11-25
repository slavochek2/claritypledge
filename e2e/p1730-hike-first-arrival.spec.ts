/**
 * P1730: a first arrival in a hike room must not count themselves as "registered, not here yet". The room's count read
 * waits for the seat read, which joins a first arrival (creates their room row; the count excludes people with one).
 * The join is held here, so the order is checked directly rather than by timing: no count read may start while the join
 * is pending, and the first one starts after it has returned.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUsers, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

test('a first arrival in a hike room is not counted among the registered people not here yet', async ({ page }) => {
  // Everything is created inside the try, so a setup step that fails still cleans up what came before it.
  const users: TestUser[] = [];
  let event: TestEvent | null = null;
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => { release = resolve; });
  let joinRequested = false;
  let joinDoneAt = 0;
  const countReadsAt: number[] = [];
  await page.route('**/rest/v1/rpc/join_event_room*', async (route) => {
    joinRequested = true;
    await released;
    const response = await route.fetch();
    joinDoneAt = Date.now();
    await route.fulfill({ response });
  });
  page.on('request', (r) => { if (r.url().includes('/rest/v1/rpc/get_event_room_counts')) countReadsAt.push(Date.now()); });
  try {
    for (const name of ['P1730 Hike Host', 'P1730 Hike Visitor', 'P1730 Hike Absent']) {
      users.push(await createTestUser({ email: generateTestEmail(), name }));
    }
    const [host, visitor, absent] = users as [TestUser, TestUser, TestUser];
    const ev = await createTestEvent(host.user.id, new Date());
    event = ev;
    const up = await supabaseAdmin.from('events').update({ series_slug: 'social-hike' }).eq('id', ev.id);
    if (up.error) throw up.error;
    // One insert per table for both registrants (metered-services rule 1: never a request per row).
    const registrants = [visitor, absent].map((u) => ({ event_id: ev.id, profile_id: u.user.id }));
    const answers = await supabaseAdmin.from('event_hike_answers').insert(registrants.map((r) => ({ ...r, when_choice: 'now', transport: 'bike_or_foot' })));
    if (answers.error) throw answers.error;
    const rsvps = await supabaseAdmin.from('event_rsvps').insert(registrants);
    if (rsvps.error) throw rsvps.error;
    await setTestSession(page, visitor.email);
    await page.goto(`/events/${ev.slug}/meet`);
    await expect.poll(() => joinRequested, { timeout: 20000 }).toBe(true);
    // Longer than the first read would take to start if it did not wait (it fires on the render that enables it).
    await page.waitForTimeout(3000);
    expect(countReadsAt).toEqual([]);
    release();
    await expect(page.getByTestId('room-not-here-line')).toHaveText(/and 1 registered, not here yet/, { timeout: 20000 });
    expect(countReadsAt.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...countReadsAt)).toBeGreaterThanOrEqual(joinDoneAt);
  } finally {
    release();
    // Let a held join finish before the event is deleted (a failed assertion lands here with the join still held), but
    // never wait more than 5 s for it, then close the page so the room makes no request while the fixtures are deleted.
    await Promise.race([page.unrouteAll({ behavior: 'wait' }), new Promise((r) => setTimeout(r, 5_000))]).catch(() => {});
    await page.close().catch(() => {});
    // Each fixture is deleted on its own path: one failing does not skip the other.
    const errors: unknown[] = [];
    if (event) await deleteTestEvent(event.id).catch((e) => errors.push(e));
    // One purge call for all three users (metered-services rule 1).
    if (users.length) await deleteTestUsers(users.map((u) => u.user.id)).catch((e) => errors.push(e));
    // Reported, not thrown: a throw here would replace the test's own failure. The run ledger purges any user left behind.
    for (const e of errors) console.error('[P1730 cleanup]', e);
  }
});
