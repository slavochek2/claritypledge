/**
 * @file p1337-host-walkthrough6.spec.ts
 * @description P1337 founder walkthrough 6, item 9 — the host panel: "−1 min" beside "+1 min", the
 * controls stay on screen on a phone, past rounds fold into one line, "Match on #tag" is stored
 * with the round (picked from a dropdown of existing sets — walkthrough 7), "Choose who sits" runs a showcase (everyone else watches), and a round with no
 * swap at half time assigns no starter.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { pressHostPrimary, seedRoomMember } from './helpers/test-event-room';

async function lastRound(eventId: string) {
  const { data } = await supabaseAdmin
    .from('event_rounds')
    .select('id, round_no, seating_s, first_s, match_tag, showcase, split_speakers')
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
    await seedRoomMember(event.id, { displayName: 'Ana Watcher', profileId: ana.user.id, optedIn: true, comprehensionRating: 7 });
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

  test('"One demo table" runs the Demo: only the chosen are seated on the event\'s set, the rest watch', async ({ page, browser }) => {
    await asHost(page);
    await openSettings(page);
    // Walkthrough 7: a dropdown of existing sets, no typing.
    const matchOn = page.getByTestId('host-match-tag');
    await expect(matchOn.locator('option[value="understanding"]')).toHaveCount(1);
    await matchOn.selectOption('understanding');
    // P1430: "Who plays" — one demo table hides the matching; a Demo uses the event's own set.
    await page.getByTestId('host-who-demo').click();
    await expect(page.getByTestId('host-match-tag')).toHaveCount(0);
    await page.getByTestId('host-choose-person').filter({ hasText: 'Bo' }).click();
    await page.getByTestId('host-choose-person').filter({ hasText: 'Cid' }).click();
    await expect(page.getByTestId('host-choose')).toContainText('2 of 3 chosen');
    await pressHostPrimary(page);
    await expect(page.getByTestId('host-round-title')).toHaveText('Demo');

    const r1 = await lastRound(event.id);
    expect(r1).toMatchObject({ round_no: 1, match_tag: null, showcase: true });
    const { data: seated } = await supabaseAdmin.from('event_round_seats').select('room_member_id').eq('round_id', r1.id);
    expect(seated).toHaveLength(2);

    const anaPage = await (await browser.newContext()).newPage();
    await setTestSession(anaPage, ana.email);
    await anaPage.goto(`/events/${event.slug}/meet`);
    await expect(anaPage.getByTestId('round-card-waiting')).toContainText('Demo · You watch');
    await anaPage.context().close();
  });

  test('"−1 min" takes a minute off the part running now', async ({ page }) => {
    const r1 = await lastRound(event.id);
    // 100 s into the first speaker's part (after the round's own table-finding time — 30 s on a Demo).
    await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - (r1.seating_s + 100) * 1000).toISOString() }).eq('id', r1.id);
    await asHost(page);
    await expect(page.getByTestId('host-shorten')).toBeVisible();
    await page.getByTestId('host-shorten').click();
    await expect.poll(async () => (await lastRound(event.id)).first_s).toBe(r1.first_s - 60);
  });

  test('a round with no swap at half time assigns no starter: the grid reads "Pair"', async ({ page }) => {
    await asHost(page);
    await openSettings(page);
    await page.getByTestId('host-split-off').click(); // "One talk" (walkthrough 7)
    await pressHostPrimary(page);
    // P1430: the Demo is not counted — the round after it is Round 1 (stored as round_no 2).
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1');
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

  test('"Match on" opens on the event\'s own set (walkthrough 7)', async ({ page }) => {
    const tag = `w7match${Date.now().toString(36)}`;
    expect((await supabaseAdmin.from('events').update({ statement_tag: tag }).eq('id', event.id)).error).toBeNull();
    await asHost(page);
    await openSettings(page);
    await expect(page.getByTestId('host-match-tag')).toHaveValue(tag);
    await expect(page.getByTestId('host-match-tag').locator('option:checked')).toContainText('(this event)');
  });

  // Walkthrough 9 reversed walkthrough 6: on a phone the page scrolls as one; desktop keeps the
  // controls column pinned.
  test('on a phone the controls scroll with the page; on desktop they stay pinned', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await asHost(page);
    const position = () => page.getByTestId('host-controls').evaluate(el => getComputedStyle(el).position);
    expect(await position()).not.toBe('sticky');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(position).toBe('sticky');
  });

  test('with time left, Next round asks once; End the evening is a small link under it (walkthrough 9)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await asHost(page);
    const before = (await supabaseAdmin.from('event_rounds').select('id').eq('event_id', event.id)).data?.length ?? 0;
    await page.getByTestId('host-primary').click();
    await expect(page.getByTestId('host-next-confirm')).toContainText('left in this round');
    await page.getByTestId('host-next-confirm').getByRole('button', { name: 'Keep going' }).click();
    await expect(page.getByTestId('host-next-confirm')).toHaveCount(0);
    expect((await supabaseAdmin.from('event_rounds').select('id').eq('event_id', event.id)).data?.length).toBe(before);
    // Founder: a small centred link right under Next round, behind its own confirm.
    await expect(page.getByTestId('host-controls').getByTestId('host-end-area').getByTestId('host-end-evening')).toBeVisible();
  });

  test('"End the evening" asks once, every phone moves to Close, and Reopen brings them back (walkthroughs 8-9)', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await asHost(page);
    await page.getByTestId('host-end-evening').click();
    await expect(page.getByTestId('host-end-confirm')).toContainText('End the evening?');
    await page.getByRole('button', { name: 'Keep going' }).click();
    await expect(page.getByTestId('host-end-confirm')).toHaveCount(0);
    // Keep going ends nothing.
    expect((await supabaseAdmin.from('event_rounds').select('id').eq('event_id', event.id).is('ended_at', null)).data?.length).toBe(1);
    await page.getByTestId('host-end-evening').click();
    await page.getByTestId('host-end-yes').click();
    await expect
      .poll(async () => (await supabaseAdmin.from('event_rounds').select('ended_at').eq('event_id', event.id).is('ended_at', null)).data?.length)
      .toBe(0);
    const anaPage = await (await browser.newContext()).newPage();
    await setTestSession(anaPage, ana.email);
    await anaPage.goto(`/events/${event.slug}/meet`);
    await expect(anaPage.getByTestId('room-steps')).toHaveAttribute('data-current', 'close', { timeout: 20_000 });
    // Walkthrough 9: ending is undoable — Reopen starts a fresh round and every phone leaves Close.
    await page.getByTestId('host-reopen').click();
    // P1430: Reopen proposes the tables first, like every start.
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-round-title')).toHaveText(/^Round \d+$/, { timeout: 20_000 });
    await expect(anaPage.getByTestId('room-steps')).not.toHaveAttribute('data-current', 'close', { timeout: 20_000 });
    await anaPage.context().close();
  });
});
