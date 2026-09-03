/**
 * INTEGRATION TEST: P800 — points.superseded_by column + invariant trigger
 *
 * Verifies:
 * 1. points.superseded_by column exists and defaults to NULL
 * 2. Valid supersede within same variant succeeds
 * 3. Trigger rejects cross-variant supersede (main → anti)
 * 4. Trigger rejects target that is not a head
 * 5. Trigger rejects cycle
 *
 * PATTERN: supabaseAdmin bypasses RLS but DOES NOT bypass BEFORE triggers.
 * Trigger invariant rejections surface as .error on the update response.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_STATEMENT_PREFIX = 'P800-trigger-test';

test.describe('P800: superseded_by column + invariant trigger', () => {
  let validatorId: string;
  const createdPointIds: string[] = [];

  test.beforeAll(async () => {
    const user = await createTestUser({ name: 'P800 Trigger Validator' });
    validatorId = user.user.id;
  });

  test.afterAll(async () => {
    // Clean up in FK-safe order: clear superseded_by references first
    if (createdPointIds.length > 0) {
      await supabaseAdmin
        .from('points')
        .update({ superseded_by: null })
        .in('id', createdPointIds);

      await supabaseAdmin
        .from('story_points')
        .delete()
        .in('point_id', createdPointIds);

      await supabaseAdmin
        .from('points')
        .delete()
        .in('id', createdPointIds);
    }

    await deleteTestUser(validatorId);
  });

  async function insertPoint(suffix: string, systemTags: string[] = []): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('points')
      .insert({
        statement: `${TEST_STATEMENT_PREFIX} ${suffix} ${Date.now()}`,
        first_validator_id: validatorId,
        tags: ['test'],
        system_tags: systemTags,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create test point: ${error.message}`);
    createdPointIds.push(data!.id);
    return data!.id;
  }

  // ── 1. Schema: superseded_by column exists ────────────────────────────────
  test('points.superseded_by column exists', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('superseded_by')
      .limit(1);

    expect(
      error,
      'Migration not applied: "superseded_by" missing from "points". Run: supabase db push',
    ).toBeNull();
  });

  // ── 2. New points default to superseded_by IS NULL ────────────────────────
  test('new points default to superseded_by IS NULL', async () => {
    const pointId = await insertPoint('default-null');

    const { data, error } = await supabaseAdmin
      .from('points')
      .select('superseded_by')
      .eq('id', pointId)
      .single();

    expect(error).toBeNull();
    expect(data?.superseded_by).toBeNull();
  });

  // ── 3. Valid supersede: same variant (both non-misunderstanding) ──────────
  test('valid supersede: same variant (both non-misunderstanding) succeeds', async () => {
    const p1 = await insertPoint('valid-src');
    const p2 = await insertPoint('valid-tgt');

    // p1 superseded by p2 — same variant (neither has misunderstanding tag)
    const { error } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: p2 })
      .eq('id', p1);

    expect(error, `Expected valid supersede to succeed, got: ${error?.message}`).toBeNull();

    // Verify the link was written
    const { data } = await supabaseAdmin
      .from('points')
      .select('superseded_by')
      .eq('id', p1)
      .single();
    expect(data?.superseded_by).toBe(p2);
  });

  // ── 4. Trigger rejects: cross-variant supersede (main → anti) ────────────
  test('trigger rejects: cross-variant supersede (main point → anti point)', async () => {
    const mainPoint = await insertPoint('cross-main', []);
    const antiPoint = await insertPoint('cross-anti', ['misunderstanding']);

    // Try to set mainPoint.superseded_by = antiPoint — different variants
    const { error } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: antiPoint })
      .eq('id', mainPoint);

    expect(
      error,
      'Trigger should have rejected cross-variant supersede (main → anti) but did not',
    ).not.toBeNull();
  });

  // ── 5. Trigger rejects: anti superseding main ────────────────────────────
  test('trigger rejects: cross-variant supersede (anti point → main point)', async () => {
    const mainPoint = await insertPoint('cross2-main', []);
    const antiPoint = await insertPoint('cross2-anti', ['misunderstanding']);

    // Try to set antiPoint.superseded_by = mainPoint — different variants
    const { error } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: mainPoint })
      .eq('id', antiPoint);

    expect(
      error,
      'Trigger should have rejected cross-variant supersede (anti → main) but did not',
    ).not.toBeNull();
  });

  // ── 6. Trigger rejects: target is not a head ─────────────────────────────
  test('trigger rejects: target already has superseded_by (target is not a head)', async () => {
    const p1 = await insertPoint('chain-a');
    const p2 = await insertPoint('chain-b');
    const p3 = await insertPoint('chain-c');

    // Wire p2 → p3 (p2 is now superseded by p3; p3 is the head)
    const { error: wire } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: p3 })
      .eq('id', p2);
    expect(wire, 'Setup: failed to wire p2 → p3').toBeNull();

    // Now try to set p1 → p2 — p2 is NOT a head (p2.superseded_by = p3, not null)
    const { error } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: p2 })
      .eq('id', p1);

    expect(
      error,
      'Trigger should have rejected target-not-head supersede but did not',
    ).not.toBeNull();
  });

  // ── 7. Trigger rejects: cycle ─────────────────────────────────────────────
  test('trigger rejects: cycle (A → B then B → A)', async () => {
    const pA = await insertPoint('cycle-a');
    const pB = await insertPoint('cycle-b');

    // Wire pA → pB (valid — pB is a head)
    const { error: wire } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: pB })
      .eq('id', pA);
    expect(wire, 'Setup: failed to wire pA → pB').toBeNull();

    // Now try pB → pA — pA.superseded_by = pB, so pA is not a head.
    // Also: walking pB → pA → pB would form a cycle.
    const { error } = await supabaseAdmin
      .from('points')
      .update({ superseded_by: pA })
      .eq('id', pB);

    expect(
      error,
      'Trigger should have rejected cycle (pA → pB, pB → pA) but did not',
    ).not.toBeNull();
  });
});
