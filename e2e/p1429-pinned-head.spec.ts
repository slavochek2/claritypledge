/**
 * @file p1429-pinned-head.spec.ts
 * @description P1429 A4: offline and transcribing, the event room's pinned step bar stays fully
 * visible — below the offline strip and the running capture bar — while Compare scrolls at 375px.
 * The guest is seated in a round at a table with a partner who differs on enough statements to
 * scroll; Chromium's fake microphone runs the real "Transcribe" flow. Live against the test DB.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember, startTranscribingInRoom } from './helpers/test-event-room';

const TAG = `p1429head${Date.now().toString(36)}`;

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

test.describe('P1429 A4: the room head under the offline strip and the capture bar', () => {
  let host: TestUser;
  let guest: TestUser;
  let partner: TestUser;
  let ev: TestEvent;
  const pointIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1429 A4 Host' });
    guest = await createTestUser({ email: generateTestEmail(), name: 'P1429 A4 Guest' });
    partner = await createTestUser({ email: generateTestEmail(), name: 'P1429 A4 Partner' });
    ev = await createTestEvent(host.user.id, new Date(), { title: 'P1429 pinned head' });
    expect((await supabaseAdmin.from('events').update({ statement_tag: TAG }).eq('id', ev.id)).error).toBeNull();
    for (const u of [guest, partner]) await rsvpToEvent(ev.id, u.user.id);
    // Enough statements the two disagree on for Compare to scroll well past one screen.
    for (let i = 1; i <= 14; i++) {
      const { data, error } = await supabaseAdmin
        .from('points')
        .insert({ statement: `P1429 head statement ${i}: a sentence long enough to wrap onto a second line on a phone`, tags: [TAG], visibility: 'public', first_validator_id: host.user.id })
        .select('id')
        .single();
      expect(error).toBeNull();
      pointIds.push(data!.id);
      await supabaseAdmin.from('point_positions').upsert([
        { user_id: guest.user.id, point_id: data!.id, position: 'agree' },
        { user_id: partner.user.id, point_id: data!.id, position: 'disagree' },
      ]);
    }
    const g = (await seedRoomMember(ev.id, { displayName: 'P1429 A4 Guest', profileId: guest.user.id })).id;
    const p = (await seedRoomMember(ev.id, { displayName: 'P1429 A4 Partner', profileId: partner.user.id })).id;
    const { data: round, error } = await supabaseAdmin.from('event_rounds').insert({ event_id: ev.id, round_no: 1, group_size: 2 }).select('id').single();
    expect(error).toBeNull();
    // Seated and at the table (tapped "I'm at table 1"): the phone shows Compare.
    expect((await supabaseAdmin.from('event_round_seats').insert([
      { round_id: round!.id, room_member_id: g, table_no: 1, role: 'first', confirmed_at: new Date().toISOString() },
      { round_id: round!.id, room_member_id: p, table_no: 1, role: 'second', confirmed_at: new Date().toISOString() },
    ])).error).toBeNull();
  });

  test.afterAll(async () => {
    if (ev) await deleteTestEvent(ev.id);
    if (pointIds.length) {
      await supabaseAdmin.from('point_positions').delete().in('point_id', pointIds);
      await supabaseAdmin.from('points').delete().in('id', pointIds);
    }
    for (const u of [host, guest, partner]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('offline and transcribing at 375, 320 and 1280px, the step bar sits below the strip and the bar while Compare scrolls', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, guest.email);
    await startTranscribingInRoom(page, ev.slug);
    await expect(page.getByText('P1429 head statement 14', { exact: false })).toBeAttached({ timeout: 20_000 }); // Compare is on screen
    await context.setOffline(true);
    await expect(page.getByTestId('offline-strip')).toBeVisible({ timeout: 15_000 });

    const box = async (id: string) => (await page.getByTestId(id).first().boundingBox())!;
    // Phone, the narrowest phone, and desktop (where the nav row is taller: 5rem).
    for (const [w, h] of [[375, 667], [320, 640], [1280, 800]] as const) {
      await page.setViewportSize({ width: w, height: h });
      for (const y of [0, 400, 1200]) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(200);
        // The head only pins once the page has scrolled under it: a page too short to scroll proves nothing.
        if (y > 0) expect(await page.evaluate(() => window.scrollY), `${w}px scrolled`).toBeGreaterThan(100);
        const strip = await box('offline-strip');
        const bar = await box('room-capture-slot');
        const head = await box('room-sticky-head');
        const steps = (await page.getByRole('navigation', { name: 'Your evening' }).boundingBox())!;
        expect(bar.y, `${w}px: capture bar below the strip at scroll ${y}`).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
        expect(head.y, `${w}px: step bar below the capture bar at scroll ${y}`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
        expect(steps.y, `${w}px: the step bar itself is below the capture bar at scroll ${y}`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      }
      await page.screenshot({ path: `test-results/p1429/a4-offline-transcribing-${w}.png` });
    }
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
});
