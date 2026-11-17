/**
 * @file p1699-reset-rounds.spec.ts
 * @description P1699 — the host's "Reset rounds" control, in real browsers against the TEST backend.
 *
 * (a) the host of an event with a running round sees "Reset rounds"; after confirming, the host
 *     page is back to the pre-round state (the start control is there, no round runs);
 * (b) an attendee seated in that round (on Compare) is back before the rounds within one poll,
 *     without reloading;
 * (c) an attendee who tapped back to an earlier step while seated lands there too;
 * (d) the host can start round 1 again.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { pressHostPrimary, seedRoomMember } from './helpers/test-event-room';

// One poll is ROUNDS_POLL_MS = 4000; allow a poll plus the read.
const WITHIN_A_POLL = 10_000;

async function roundCount(eventId: string) {
  const { count } = await supabaseAdmin.from('event_rounds').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
  return count ?? 0;
}

test.describe('P1699 host resets the rounds', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let ana: TestUser; // seated, on Compare
  let bea: TestUser; // seated, tapped back
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1699 Host' });
    ana = await createTestUser({ email: generateTestEmail(), name: 'Ana Attendee' });
    bea = await createTestUser({ email: generateTestEmail(), name: 'Bea Attendee' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1699 reset e2e' });
    await rsvpToEvent(event.id, ana.user.id);
    await rsvpToEvent(event.id, bea.user.id);
    await seedRoomMember(event.id, { displayName: 'Ana Attendee', profileId: ana.user.id });
    await seedRoomMember(event.id, { displayName: 'Bea Attendee', profileId: bea.user.id });
    for (const name of ['Ben Brown', 'Cy Clark', 'Dee Dunn', 'Eli Ernst']) await seedRoomMember(event.id, { displayName: name });
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    for (const u of [host, ana, bea]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('reset sends the host and both seated attendees back, and round 1 starts again', async ({ browser }) => {
    test.setTimeout(150_000);
    const hostCtx = await browser.newContext();
    const anaCtx = await browser.newContext();
    const beaCtx = await browser.newContext();
    try {
      const hostPage = await hostCtx.newPage();
      const anaPage = await anaCtx.newPage();
      const beaPage = await beaCtx.newPage();

      await setTestSession(hostPage, host.email);
      await hostPage.goto(`/events/${event.slug}/host`);
      await expect(hostPage.getByTestId('host-panel')).toBeVisible();
      // No round yet: nothing to reset.
      await expect(hostPage.getByTestId('host-reset-rounds')).toHaveCount(0);
      await pressHostPrimary(hostPage);
      await expect(hostPage.getByTestId('host-round-title')).toHaveText('Round 1');
      expect(await roundCount(event.id)).toBe(1);

      // Ana: seated, taps "I'm at table" -> Compare.
      await setTestSession(anaPage, ana.email);
      await anaPage.goto(`/events/${event.slug}/meet`);
      await expect(anaPage.getByTestId('round-card')).toBeVisible();
      await anaPage.getByTestId('round-card-confirm').click();
      await expect(anaPage.getByTestId('room-steps')).toHaveAttribute('data-current', 'compare');

      // Bea: seated, then taps back to the Principle step.
      await setTestSession(beaPage, bea.email);
      await beaPage.goto(`/events/${event.slug}/meet`);
      await expect(beaPage.getByTestId('round-card')).toBeVisible();
      await beaPage.getByTestId('room-step-principle').click();
      await expect(beaPage.getByTestId('round-card')).toHaveCount(0);

      // (a) the host resets.
      await expect(hostPage.getByTestId('host-reset-rounds')).toBeVisible();
      await hostPage.getByTestId('host-reset-rounds').click();
      await expect(hostPage.getByTestId('host-reset-confirm')).toBeVisible();
      await hostPage.getByTestId('host-reset-yes').click();
      await expect(hostPage.getByTestId('host-round-title')).toHaveCount(0, { timeout: 15_000 });
      await expect(hostPage.getByTestId('host-reset-rounds')).toHaveCount(0, { timeout: 15_000 });
      await expect(hostPage.getByTestId('host-primary')).toBeVisible({ timeout: 15_000 });
      await expect(hostPage.getByTestId('host-primary')).not.toHaveText(/round [2-9]|End/i);
      expect(await roundCount(event.id)).toBe(0);

      // (b) Ana, no reload: off Compare, no round card.
      await expect(anaPage.getByTestId('room-steps')).not.toHaveAttribute('data-current', 'compare', { timeout: WITHIN_A_POLL });
      await expect(anaPage.getByTestId('round-card')).toHaveCount(0, { timeout: WITHIN_A_POLL });
      // (c) Bea, no reload: the Table/Compare step is not what she is on, and she is on the pre-rounds step.
      await expect(beaPage.getByTestId('round-card')).toHaveCount(0, { timeout: WITHIN_A_POLL });
      // Neither opted in, so the pre-rounds step is Principle for both (while seated it was Table/Compare).
      await expect(beaPage.getByTestId('room-steps')).toHaveAttribute('data-current', 'principle', { timeout: WITHIN_A_POLL });
      await expect(anaPage.getByTestId('room-steps')).toHaveAttribute('data-current', 'principle', { timeout: WITHIN_A_POLL });

      // (d) round 1 starts again.
      await pressHostPrimary(hostPage);
      await expect(hostPage.getByTestId('host-round-title')).toHaveText('Round 1');
      expect(await roundCount(event.id)).toBe(1);
    } finally {
      await hostCtx.close();
      await anaCtx.close();
      await beaCtx.close();
    }
  });
});
