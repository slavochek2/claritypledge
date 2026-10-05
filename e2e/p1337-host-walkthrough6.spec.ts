/**
 * @file p1337-host-walkthrough6.spec.ts
 * @description P1337 founder walkthrough 6, item 9 — the host panel: "−1 min" beside "+1 min", the
 * controls stay on screen on a phone, past rounds fold into one line, "Match on #tag" is stored
 * with the round, "Choose who sits" runs a showcase (everyone else watches), and a round with no
 * swap at half time assigns no starter.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember } from './helpers/test-event-room';

async function lastRound(eventId: string) {
  const { data } = await supabaseAdmin
    .from('event_rounds')
    .select('id, round_no, first_s, match_tag, showcase, split_speakers')
    .eq('event_id', eventId)
    .order('round_no', { ascending: false })
    .limit(1)
    .single();
  return data!;
}

test.describe('P1337 — host panel, walkthrough 6', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let ana: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'W6 Host' });
    ana = await createTestUser({ email: generateTestEmail(), name: 'Ana Watcher' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1337 host walkthrough 6 e2e' });
    await rsvpToEvent(event.id, ana.user.id);
    await seedRoomMember(event.id, { displayName: 'Ana Watcher', profileId: ana.user.id });
    for (const name of ['Bo Brook', 'Cid Cole', 'Dot Dale']) await seedRoomMember(event.id, { displayName: name });
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    for (const u of [host, ana]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function asHost(page: Page) {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/host`);
    await expect(page.getByTestId('host-room-count')).toHaveText('4 in the room');
  }

  async function openSettings(page: Page) {
    const settings = page.getByTestId('host-settings');
    if (!(await settings.evaluate(el => (el as HTMLDetailsElement).open))) await settings.locator('summary').click();
  }

  test('"Choose who sits" runs a showcase: only the chosen are seated, the match tag is stored, the rest watch', async ({ page, browser }) => {
    await asHost(page);
    await openSettings(page);
    await page.getByTestId('host-match-tag').fill('showcasetag');
    await page.getByTestId('host-choose-toggle').check();
    await page.getByTestId('host-choose-person').filter({ hasText: 'Bo' }).click();
    await page.getByTestId('host-choose-person').filter({ hasText: 'Cid' }).click();
    await expect(page.getByTestId('host-choose')).toContainText('2 chosen');
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1');

    const r1 = await lastRound(event.id);
    expect(r1).toMatchObject({ round_no: 1, match_tag: 'showcasetag', showcase: true });
    const { data: seated } = await supabaseAdmin.from('event_round_seats').select('room_member_id').eq('round_id', r1.id);
    expect(seated).toHaveLength(2);

    const anaPage = await (await browser.newContext()).newPage();
    await setTestSession(anaPage, ana.email);
    await anaPage.goto(`/events/${event.slug}/meet`);
    await expect(anaPage.getByTestId('round-card-waiting')).toContainText('You watch');
    await anaPage.context().close();
  });

  test('"−1 min" takes a minute off the part running now', async ({ page }) => {
    const r1 = await lastRound(event.id);
    // 100 s into the first speaker's part.
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (60 + 100) * 1000).toISOString() }).eq('id', r1.id);
    await asHost(page);
    await expect(page.getByTestId('host-shorten')).toBeVisible();
    await page.getByTestId('host-shorten').click();
    await expect.poll(async () => (await lastRound(event.id)).first_s).toBe(r1.first_s - 60);
  });

  test('a round with no swap at half time assigns no starter: the grid reads "Pair"', async ({ page }) => {
    await asHost(page);
    await openSettings(page);
    await page.getByTestId('host-split-speakers').uncheck();
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 2');
    expect((await lastRound(event.id)).split_speakers).toBe(false);
    await expect(page.getByTestId('round-grid-role').first()).toContainText('Pair');
    // A showcase is one round's choice: round 2 seats the whole room again.
    expect((await lastRound(event.id)).showcase).toBe(false);
  });

  test('past rounds fold into one line', async ({ page }) => {
    await asHost(page);
    const past = page.getByTestId('host-past-rounds');
    await expect(past.locator('> summary')).toContainText('Past rounds');
    await expect(past.locator('> summary')).toContainText('1');
    await expect(past).not.toHaveAttribute('open', '');
  });

  test('on a phone the controls stay on screen while the room scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await asHost(page);
    const position = await page.getByTestId('host-controls').evaluate(el => getComputedStyle(el).position);
    expect(position).toBe('sticky');
  });
});
