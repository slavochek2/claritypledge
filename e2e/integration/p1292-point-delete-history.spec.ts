/**
 * @file p1292-point-delete-history.spec.ts
 * @description P1292 — deleting a point must not fail on its own position-history trigger.
 *
 * P270 coverage — this file is the integration test for:
 *   - 20260911110000_p1292_position_tombstone_skips_deleted_point
 *
 * ONE trigger, TWO arms, and both are asserted, because the fix edits one and the other is
 * load-bearing for account erasure (P520):
 *   A. DELETE FROM points -> cascades to point_positions -> the trigger's DELETE arm. Must SUCCEED.
 *      Before the fix it failed every time with 23503: the tombstone referenced the point being
 *      deleted in the same statement.
 *   C. DELETE FROM profiles for a user who still holds a position -> the same arm, through the OTHER
 *      parent (point_position_history.user_id is also an FK). Must SUCCEED. Found while fixing A.
 *   B. DELETE FROM point_positions while the point survives -> the same arm. Must STILL write the
 *      NULL tombstone. That is how erase_my_account records a withdrawn position, and it is the arm
 *      a careless fix (dropping the tombstone outright) would silently break.
 *   D. auth.admin.deleteUser() for a user who holds a position -> auth.users cascades to profiles,
 *      which cascades to point_positions: C's defect one level deeper, and the way a real account is
 *      removed (the Supabase dashboard, and deleteTestUser). C deletes the profile directly, so on its
 *      own it never proved this nested path (codex, 2026-09-11).
 *
 * Readbacks go through the service-role client and check persisted rows — never `error` alone.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint } from '../helpers/test-point';

async function countRows(table: string, eq: Record<string, string>, nullCol?: string): Promise<number> {
  let q = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
  if (nullCol) q = q.is(nullCol, null);
  const { count, error } = await q;
  if (error) throw new Error(`count ${table} failed: ${error.message}`);
  return count ?? 0;
}

test.describe('P1292: the position-history trigger vs point deletion', () => {
  let user: TestUser;
  const pointIds: string[] = [];

  test.beforeAll(async () => {
    user = await createTestUser({ email: generateTestEmail(), name: 'P1292 Positioner' });
  });

  test.afterAll(async () => {
    for (const id of pointIds) await supabaseAdmin.from('points').delete().eq('id', id);
    // Guarded: when beforeAll fails (DNS, auth, a fixture error) `user` is undefined, and an
    // unguarded dereference here reports a TypeError in teardown that buries the real cause.
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  async function pointWithPosition(label: string): Promise<string> {
    const point = await createTestPoint(user.user.id, { statement: `P1292 ${label} ${Date.now()}` });
    pointIds.push(point.id);
    const { error } = await supabaseAdmin
      .from('point_positions')
      .insert({ point_id: point.id, user_id: user.user.id, position: 'agree' });
    expect(error, `fixture: position insert failed: ${error?.message}`).toBeNull();
    return point.id;
  }

  test('A — a point that holds a position can be deleted, and takes its positions and history with it', async () => {
    const pointId = await pointWithPosition('delete-point');
    expect(
      await countRows('point_position_history', { point_id: pointId }),
      'fixture: the INSERT arm should have logged the new position',
    ).toBeGreaterThan(0);

    const { error } = await supabaseAdmin.from('points').delete().eq('id', pointId);
    expect(error, `P1292 NOT FIXED: deleting a point failed (${error?.code} ${error?.message})`).toBeNull();

    expect(await countRows('points', { id: pointId }), 'the point is still there').toBe(0);
    expect(await countRows('point_positions', { point_id: pointId }), 'positions survived their point').toBe(0);
    expect(await countRows('point_position_history', { point_id: pointId }), 'history survived its point').toBe(0);
  });

  test('C — a profile that still holds a position can be deleted (the same defect, other parent)', async () => {
    const departing = await createTestUser({ email: generateTestEmail(), name: 'P1292 Departing' });
    try {
      // The point belongs to the main user, so the departing user is referenced ONLY by the position
      // and its history — the trigger is the only thing that can block this delete.
      const point = await createTestPoint(user.user.id, { statement: `P1292 profile-delete ${Date.now()}` });
      pointIds.push(point.id);
      const { error: posErr } = await supabaseAdmin
        .from('point_positions')
        .insert({ point_id: point.id, user_id: departing.user.id, position: 'disagree' });
      expect(posErr, `fixture: position insert failed: ${posErr?.message}`).toBeNull();

      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', departing.user.id);
      expect(error, `P1292 (profile parent) NOT FIXED: deleting a user who holds a position failed (${error?.code} ${error?.message})`).toBeNull();

      expect(await countRows('profiles', { id: departing.user.id }), 'the profile is still there').toBe(0);
      expect(await countRows('point_positions', { user_id: departing.user.id }), 'positions survived their user').toBe(0);
      expect(await countRows('point_position_history', { user_id: departing.user.id }), 'history survived its user').toBe(0);
      expect(await countRows('points', { id: point.id }), 'the point must survive its positioner leaving').toBe(1);
    } finally {
      await deleteTestUser(departing.user.id);
    }
  });

  test('D — a user who holds a position can be deleted through the auth API (auth.users -> profiles -> positions)', async () => {
    const leaving = await createTestUser({ email: generateTestEmail(), name: 'P1292 Auth-deleted' });
    let deleted = false;
    try {
      const point = await createTestPoint(user.user.id, { statement: `P1292 auth-delete ${Date.now()}` });
      pointIds.push(point.id);
      const { error: posErr } = await supabaseAdmin
        .from('point_positions')
        .insert({ point_id: point.id, user_id: leaving.user.id, position: 'agree' });
      expect(posErr, `fixture: position insert failed: ${posErr?.message}`).toBeNull();

      const { error } = await supabaseAdmin.auth.admin.deleteUser(leaving.user.id);
      expect(error, `P1292 (auth path) NOT FIXED: deleting a user who holds a position through the auth API failed (${error?.message})`).toBeNull();
      deleted = !error;

      expect(await countRows('profiles', { id: leaving.user.id }), 'the profile survived its auth user').toBe(0);
      expect(await countRows('point_positions', { user_id: leaving.user.id }), 'positions survived their user').toBe(0);
      expect(await countRows('points', { id: point.id }), 'the point must survive its positioner leaving').toBe(1);
    } finally {
      if (!deleted) await deleteTestUser(leaving.user.id);
    }
  });

  test('B — CONTROL: deleting only the position still writes the NULL tombstone (the P520 erasure path)', async () => {
    const pointId = await pointWithPosition('delete-position');
    const tombstonesBefore = await countRows('point_position_history', { point_id: pointId, user_id: user.user.id }, 'position');
    expect(tombstonesBefore, 'fixture: a fresh point should have no tombstone yet').toBe(0);

    const { error } = await supabaseAdmin
      .from('point_positions')
      .delete()
      .eq('point_id', pointId)
      .eq('user_id', user.user.id);
    expect(error, `position-only delete failed: ${error?.message}`).toBeNull();

    expect(await countRows('points', { id: pointId }), 'the point must survive a position-only delete').toBe(1);
    expect(
      await countRows('point_position_history', { point_id: pointId, user_id: user.user.id }, 'position'),
      'no tombstone — account erasure would lose its record that the position was withdrawn',
    ).toBe(1);
  });
});
