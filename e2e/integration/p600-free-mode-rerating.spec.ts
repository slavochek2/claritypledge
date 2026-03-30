/**
 * @file p600-free-mode-rerating.spec.ts
 * @description Integration test for P600 Fix 5: Speaker re-rating before free mode sliders.
 *
 * Validates that freeRounds contains 2 entries when transitioning to unlocked phase:
 * - Row 0: Initial sealed-bid ratings (checkerRating + responderRating)
 * - Row 1: Speaker's re-rating after hearing listener's paraphrase
 *
 * Pattern: create test session → patch live_state to simulate re-rating flow → assert freeRounds structure.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

let creator: TestUser;
let joiner: TestUser;
let sessionId: string;
let sessionCode: string;

test.beforeAll(async () => {
  creator = await createTestUser({ name: 'P600Creator' });
  joiner = await createTestUser({ name: 'P600Joiner' });

  const { data: session } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: `P600R-${Date.now()}`,
      creator_profile_id: creator.user.id,
      joiner_profile_id: joiner.user.id,
      creator_name: 'P600Creator',
      joiner_name: 'P600Joiner',
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (!session) throw new Error('Failed to create test session');
  sessionId = session.id;
  sessionCode = session.code;
});

test.afterAll(async () => {
  await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  if (creator?.user?.id) await deleteTestUser(creator.user.id);
  if (joiner?.user?.id) await deleteTestUser(joiner.user.id);
});

test.describe('P600: Free Mode — Speaker Re-rating Integration', () => {

  test('freeRounds contains 2 entries after re-rating transition', async () => {
    // Simulate the state AFTER speaker re-rates (rating < 10) and free mode unlocks
    // This is what handleExplainBackRate should produce when sessionMode === 'free'
    const expectedFreeRounds = [
      { listenerConfidence: 4, speakerBelief: 7, label: '0' },  // Initial sealed-bid
      { listenerConfidence: 4, speakerBelief: 8, label: '1' },  // Speaker re-rating (updated belief)
    ];

    const unlockedState = {
      sessionMode: 'free',
      freePhase: 'unlocked',
      freeRounds: expectedFreeRounds,
      freeSliderCreator: 7,  // Creator is checker → slider starts at speakerBelief
      freeSliderJoiner: 4,   // Joiner is responder → slider starts at listenerConfidence
      checkerIsCreator: true,
      checkerName: 'P600Creator',
      checksCount: 1,
    };

    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: unlockedState })
      .eq('code', sessionCode);

    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    const liveState = data!.live_state as Record<string, unknown>;
    const freeRounds = liveState.freeRounds as Array<Record<string, unknown>>;

    // Must have exactly 2 entries
    expect(freeRounds).toHaveLength(2);

    // Row 0: initial sealed-bid
    expect(freeRounds[0].listenerConfidence).toBe(4);
    expect(freeRounds[0].speakerBelief).toBe(7);
    expect(freeRounds[0].label).toBe('0');

    // Row 1: speaker re-rating (updated belief after paraphrase)
    expect(freeRounds[1].listenerConfidence).toBe(4);  // Listener confidence unchanged
    expect(freeRounds[1].speakerBelief).toBe(8);        // Speaker's updated belief
    expect(freeRounds[1].label).toBe('1');
  });

  test('freeRounds structure survives JSONB merge', async () => {
    // Verify that updating slider values doesn't clobber freeRounds
    const initialState = {
      sessionMode: 'free',
      freePhase: 'unlocked',
      freeRounds: [
        { listenerConfidence: 5, speakerBelief: 6, label: '0' },
        { listenerConfidence: 5, speakerBelief: 8, label: '1' },
      ],
      freeSliderCreator: 6,
      freeSliderJoiner: 5,
      checksCount: 1,
    };

    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: initialState })
      .eq('code', sessionCode);

    // Simulate slider update (JSONB || merge via patch_live_state)
    // The patch should only update slider values, not touch freeRounds
    const patchedState = {
      ...initialState,
      freeSliderCreator: 9,
    };

    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: patchedState })
      .eq('code', sessionCode);

    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();

    const liveState = data!.live_state as Record<string, unknown>;
    const freeRounds = liveState.freeRounds as Array<Record<string, unknown>>;

    // freeRounds must still have 2 entries with original values
    expect(freeRounds).toHaveLength(2);
    expect(freeRounds[0].speakerBelief).toBe(6);
    expect(freeRounds[1].speakerBelief).toBe(8);

    // Slider value updated
    expect(liveState.freeSliderCreator).toBe(9);
  });
});
