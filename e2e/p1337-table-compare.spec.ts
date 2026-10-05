/**
 * @file p1337-table-compare.spec.ts
 * @description P1337 founder walkthrough 6, items 3 and 6: after "I'm at table N" the table card
 * shows the compare page's rows — each statement with both positions (no topic mark: founder
 * walkthrough 7). A speaker reads their own position ("I agree") against their
 * partner's; the observer reads the pair's. An earlier wording of a statement is never listed.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { seedRoomMember } from './helpers/test-event-room';

const TAG = `p1337cmp${Date.now().toString(36)}`;

test.describe('P1337 — the comparison inside the table card', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let ana: TestUser;
  let ben: TestUser;
  let cy: TestUser;
  let event: TestEvent;
  const pointIds: string[] = [];
  let roundId = '';

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'Cmp Host' });
    ana = await createTestUser({ email: generateTestEmail(), name: 'Ana Pair' });
    ben = await createTestUser({ email: generateTestEmail(), name: 'Ben Pair' });
    cy = await createTestUser({ email: generateTestEmail(), name: 'Cy Watch' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1337 table compare e2e' });
    expect((await supabaseAdmin.from('events').update({ statement_tag: TAG }).eq('id', event.id)).error).toBeNull();
    for (const u of [ana, ben, cy]) await rsvpToEvent(event.id, u.user.id);

    // Two current statements and one earlier wording (superseded) that must never be listed.
    const insert = async (statement: string, supersededBy: string | null = null) => {
      const { data, error } = await supabaseAdmin
        .from('points')
        .insert({ statement, tags: [TAG], visibility: 'public', first_validator_id: host.user.id, superseded_by: supersededBy })
        .select('id')
        .single();
      expect(error).toBeNull();
      pointIds.push(data!.id);
      return data!.id as string;
    };
    const current = await insert('Cmp current wording one');
    await insert('Cmp current wording two');
    await insert('Cmp OLD wording one', current);
    const stake = async (user: TestUser, pointId: string, position: string) =>
      expect((await supabaseAdmin.from('point_positions').upsert({ user_id: user.user.id, point_id: pointId, position })).error).toBeNull();
    for (const id of pointIds) {
      await stake(ana, id, 'agree');
      await stake(ben, id, 'disagree');
    }

    const member = async (u: TestUser, name: string) => (await seedRoomMember(event.id, { displayName: name, profileId: u.user.id })).id;
    const a = await member(ana, 'Ana Pair');
    const b = await member(ben, 'Ben Pair');
    const c = await member(cy, 'Cy Watch');
    const { data: round, error } = await supabaseAdmin
      .from('event_rounds')
      .insert({ event_id: event.id, round_no: 1, group_size: 3 })
      .select('id')
      .single();
    expect(error).toBeNull();
    roundId = round!.id;
    expect(
      (
        await supabaseAdmin.from('event_round_seats').insert([
          { round_id: roundId, room_member_id: a, table_no: 1, role: 'first' },
          { round_id: roundId, room_member_id: b, table_no: 1, role: 'second' },
          { round_id: roundId, room_member_id: c, table_no: 1, role: 'observer' },
        ])
      ).error,
    ).toBeNull();
  });

  test.afterAll(async () => {
    if (pointIds.length) await supabaseAdmin.from('points').delete().in('id', pointIds);
    if (event) await deleteTestEvent(event.id);
    for (const u of [host, ana, ben, cy]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function atTable(page: Page, user: TestUser) {
    await setTestSession(page, user.email);
    await page.goto(`/events/${event.slug}/meet`);
    // Tap "I'm at table 1" unless this person already did in an earlier test.
    const confirm = page.getByTestId('round-card-confirm');
    // Already tapped in an earlier test: the card opens on the comparison (walkthrough 7).
    const comparing = page.locator('[data-testid="round-card"][data-view="compare"]');
    await expect(confirm.or(comparing)).toBeVisible();
    if (await confirm.isVisible()) await confirm.click();
    return page.getByTestId('round-card-rows');
  }

  test("a speaker sees the compare rows: their own position against their partner's, current wordings only", async ({ page }) => {
    const rows = await atTable(page, ana);
    await expect(rows.getByRole('listitem')).toHaveCount(2);
    await expect(rows).toContainText('Cmp current wording one');
    await expect(rows).not.toContainText('OLD wording');
    const first = rows.getByRole('listitem').first();
    await expect(first.getByText('Agree', { exact: true })).toBeVisible(); // mine, first person
    await expect(first.getByText('Disagrees', { exact: true })).toBeVisible(); // Ben's
    await expect(first).toContainText('Ben');
  });

  test('no "We\'re talking about this one" on the table card (founder walkthrough 7)', async ({ page }) => {
    const rows = await atTable(page, ana);
    await expect(rows.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByTestId('compare-topic-mark')).toHaveCount(0);
    await expect(page.getByText(/talking about this one/i)).toHaveCount(0);
  });

  test('the compare step: the dropdown is the header ("You and Ben"), the set by name, anyone else in the room', async ({ page }) => {
    await atTable(page, ana);
    const header = page.getByTestId('round-compare-with');
    await expect(header.locator('option:checked')).toHaveText('You and Ben');
    await expect(page.getByTestId('round-compare-back')).toHaveCount(0); // the step bar is the way back
    await expect(page.getByTestId('round-compare-set')).not.toHaveText(`#${TAG}`); // named after the event
    await expect(page.getByTestId('round-card-compare')).toHaveCount(0); // the step bar replaced the button
    const withWho = page.getByTestId('round-compare-with');
    await expect(withWho.locator('option')).toContainText(['You and Ben', 'You and Cy']);
    await withWho.selectOption((await withWho.locator('option', { hasText: 'Cy' }).getAttribute('value'))!);
    await expect(header.locator('option:checked')).toContainText('You and Cy');
    await expect(page.getByTestId('round-card-no-rows')).toBeVisible(); // Cy answered nothing
    await withWho.selectOption(''); // a wrong pick is one tap back to your table
    await expect(header.locator('option:checked')).toHaveText('You and Ben');
    await page.getByTestId('room-step-table').click();
    await expect(page.getByTestId('round-card')).toHaveAttribute('data-view', 'table');
  });

  test("the observer sees the pair's positions, neither in the first person", async ({ page }) => {
    const rows = await atTable(page, cy);
    const first = rows.getByRole('listitem').first();
    await expect(first).toContainText('Ana');
    await expect(first).toContainText('Ben');
    await expect(first.getByText('Agrees', { exact: true })).toBeVisible(); // Ana's, third person
    await expect(first.getByText('Disagrees', { exact: true })).toBeVisible(); // Ben's
    await expect(first.getByText('Agree', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('round-compare-with').locator('option:checked')).toHaveText('Ana and Ben (your table)');
  });

  test('moved mid-round: the card follows to the new table', async ({ page }) => {
    await atTable(page, ana);
    const { data: me } = await supabaseAdmin.from('event_room_members').select('id').eq('event_id', event.id).eq('profile_id', ana.user.id).single();
    expect((await supabaseAdmin.from('event_round_seats').update({ table_no: 2 }).eq('round_id', roundId).eq('room_member_id', me!.id)).error).toBeNull();
    await expect(page.getByTestId('round-card-table-line').or(page.getByTestId('round-card-table'))).toContainText('Table 2', { timeout: 20_000 });
  });


  test('the host ends the rounds: Close becomes the step, with the end screen; no table to go back to', async ({ page }) => {
    expect((await supabaseAdmin.from('event_rounds').update({ ended_at: new Date().toISOString() }).eq('id', roundId)).error).toBeNull();
    await setTestSession(page, ana.email);
    await page.goto(`/events/${event.slug}/meet`);
    await expect(page.getByTestId('room-steps')).toHaveAttribute('data-current', 'close', { timeout: 20_000 });
    await expect(page.getByTestId('room-close')).toContainText('Thanks for coming');
    await expect(page.getByTestId('room-step-table')).toBeDisabled();
    await expect(page.getByTestId('round-past')).toHaveCount(0);
  });
});
