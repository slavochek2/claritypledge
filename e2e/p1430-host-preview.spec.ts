/**
 * @file p1430-host-preview.spec.ts
 * @description P1430 — the host sees the proposed tables before a round starts, and the round that
 * starts is the one previewed; someone who leaves between preview and Start is named and taken
 * out; the host-picked round reads "Demo" and is not counted (the next is Round 1, and a sit-out
 * marked for Round 1 applies to that round, not the Demo); "One demo table" switches the minutes
 * to 30 s / 3 / 1 and back to 1 / 6 / 3; a round started from another host device closes this
 * device's preview. Live against the test DB.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { openHostPreview, pressHostPrimary, seedRoomMember } from './helpers/test-event-room';

async function rounds(eventId: string) {
  const { data } = await supabaseAdmin
    .from('event_rounds')
    .select('id, round_no, showcase, seating_s, first_s, observer_s')
    .eq('event_id', eventId)
    .order('round_no', { ascending: true });
  return data ?? [];
}

/** "Table 2:Ava" for every tile in a tables grid, sorted — who sits at which table. */
function arrangement(grid: Locator) {
  return grid.evaluate(el => {
    const out: string[] = [];
    let table = '';
    el.querySelectorAll('[aria-label^="Table "], [data-testid="round-grid-name"]').forEach(n => {
      const label = n.getAttribute('aria-label');
      if (label?.startsWith('Table ')) table = label;
      else out.push(`${table}:${n.textContent}`);
    });
    return out.sort();
  });
}

async function seatsOf(roundId: string) {
  const { data } = await supabaseAdmin.from('event_round_seats').select('room_member_id, table_no, role').eq('round_id', roundId);
  return (data ?? []).map(s => `${s.room_member_id}:${s.table_no}:${s.role}`).sort();
}

test.describe('P1430 — preview, Demo, presets', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let event: TestEvent;
  const ids = new Map<string, string>();

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1430 Host' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1430 host preview e2e' });
    for (const name of ['Ava Ames', 'Bo Brook', 'Cid Cole', 'Dot Dale', 'Eve Eads', 'Fin Ford', 'Gus Gray']) {
      ids.set(name.split(' ')[0], (await seedRoomMember(event.id, { displayName: name })).id);
    }
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  async function asHost(page: Page) {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/host`);
    await expect(page.getByTestId('host-room-count')).toHaveText(/\d+ in the room/);
  }

  async function openSettings(page: Page) {
    const settings = page.getByTestId('host-settings');
    if (!(await settings.evaluate(el => (el as HTMLDetailsElement).open))) await settings.locator('summary').click();
  }

  test('"One demo table" switches the minutes to 30 s / 3 / 1; "All tables" restores 1 / 6 / 3', async ({ page }) => {
    await asHost(page);
    await openSettings(page);
    const minutes = () => page.getByTestId('host-minutes').locator('[data-testid^="host-minutes-"]').allTextContents();
    await page.getByTestId('host-who-demo').click();
    expect(await minutes()).toEqual(['30 s', '3 min', '1 min']);
    // Tables steps in 30 s.
    await page.getByRole('button', { name: 'Tables: 30 seconds more' }).click();
    await expect(page.getByTestId('host-minutes-seatingS')).toHaveText('1 min');
    await page.getByTestId('host-who-all').click();
    expect(await minutes()).toEqual(['1 min', '6 min', '3 min']);
    await expect(page.getByTestId('host-match-tag')).toBeVisible();
  });

  test('a sit-out marked for Round 1 applies to Round 1, not to the Demo before it', async ({ page }) => {
    // Gus sits out "Round 1" — the counted round the host and the room read.
    expect(
      (await supabaseAdmin.from('event_round_presence').insert({ event_id: event.id, room_member_id: ids.get('Gus')!, sits_out_round: 1 })).error,
    ).toBeNull();
    await asHost(page);
    await openSettings(page);
    await page.getByTestId('host-who-demo').click();
    for (const name of ['Ava', 'Gus']) await page.getByTestId('host-choose-person').filter({ hasText: name }).click();
    await expect(page.getByTestId('host-primary')).toHaveText('Start the Demo');
    await openHostPreview(page);
    await expect(page.getByTestId('host-preview-title')).toHaveText('Demo: these tables?');
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Demo', { timeout: 20_000 });
    const [demo] = await rounds(event.id);
    expect(demo).toMatchObject({ round_no: 1, showcase: true, seating_s: 30, first_s: 180, observer_s: 60 });
    expect((await seatsOf(demo.id)).map(s => s.split(':')[0]).sort()).toEqual([ids.get('Ava'), ids.get('Gus')].sort());

    // The next round is Round 1: the whole room, less Gus, back at the standard minutes.
    await openSettings(page);
    await expect(page.getByTestId('host-who-plays')).toHaveAttribute('data-value', 'all');
    await pressHostPrimary(page);
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 20_000 });
    const r1 = (await rounds(event.id))[1];
    expect(r1).toMatchObject({ round_no: 2, showcase: false, seating_s: 60 });
    const seated = (await seatsOf(r1.id)).map(s => s.split(':')[0]);
    expect(seated).not.toContain(ids.get('Gus'));
    expect(seated).toHaveLength(6);
    // The past rounds list names the Demo.
    await page.getByTestId('host-past-rounds').locator('> summary').click();
    await expect(page.getByTestId('host-past-rounds')).toContainText('Demo');
  });

  test('the host sees the proposed tables first, can swap two, and the round that starts is the preview', async ({ page }) => {
    await asHost(page);
    const before = (await rounds(event.id)).length;
    await openHostPreview(page);
    await expect(page.getByTestId('host-preview-title')).toHaveText('Round 2: these tables?');
    // Nothing is saved yet.
    expect((await rounds(event.id)).length).toBe(before);
    const tiles = page.getByTestId('host-preview').getByTestId('round-grid-name');
    await expect(tiles).toHaveCount(7);
    const a = (await tiles.nth(0).textContent())!;
    const b = (await tiles.nth(1).textContent())!;
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(tiles.nth(0)).toHaveText(b);
    await expect(tiles.nth(1)).toHaveText(a);
    const shown = await arrangement(page.getByTestId('host-preview').getByTestId('round-grid'));

    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 2', { timeout: 20_000 });
    // The running round seats everyone at the table the preview put them at.
    const running = page.getByTestId('host-people').getByTestId('round-grid');
    await expect(running.getByTestId('round-grid-name')).toHaveCount(7);
    expect(await arrangement(running)).toEqual(shown);
  });

  test('someone who leaves between preview and Start is named, and the round starts without them', async ({ page }) => {
    await asHost(page);
    await openHostPreview(page);
    await expect(page.getByTestId('host-preview').getByTestId('round-grid-name')).toHaveCount(7);
    expect(
      (await supabaseAdmin
        .from('event_round_presence')
        .upsert({ event_id: event.id, room_member_id: ids.get('Bo')!, left_at: new Date().toISOString() }, { onConflict: 'event_id,room_member_id' })).error,
    ).toBeNull();
    await expect(page.getByTestId('host-preview-changed')).toContainText('Bo left', { timeout: 15_000 });
    await expect(page.getByTestId('host-preview').getByTestId('round-grid-name')).toHaveCount(6);
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 3', { timeout: 20_000 });
    const latest = (await rounds(event.id)).at(-1)!;
    expect((await seatsOf(latest.id)).map(s => s.split(':')[0])).not.toContain(ids.get('Bo'));
  });

  test('a round started from another host device closes this preview and says so', async ({ page, browser }) => {
    await asHost(page);
    await openHostPreview(page);
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await setTestSession(other, host.email);
    await other.goto(`/events/${event.slug}/host`);
    await pressHostPrimary(other);
    await expect(other.getByTestId('host-round-title')).toHaveText('Round 4', { timeout: 20_000 });
    await ctx.close();
    await expect(page.getByTestId('host-preview')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('host-notice')).toHaveText('Round 4 was started on another device.');
  });
});
