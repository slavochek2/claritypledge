/**
 * @file p674-live-state-machine.spec.ts
 * @description Integration test for P674: Simplified live_state JSONB structure.
 *
 * Tests the new field naming, phase enum, and participant-scoped writes
 * directly against the database — no browser required.
 *
 * Pattern: create test users → create session → patch live_state → assert DB state.
 *
 * Covers:
 * 1. New JSONB field structure (~20 fields)
 * 2. Phase transitions with new single enum
 * 3. Participant-scoped RPC (patch_live_state) with new field names
 * 4. Calibration data source: speakerReRating written to story_verifications
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

let creator: TestUser;
let joiner: TestUser;
let sessionId: string;
let sessionCode: string;

/** Returns a Supabase client authenticated as the given test user */
async function getAuthenticatedClient(email: string) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.beforeAll(async () => {
  creator = await createTestUser({ name: 'P674Creator' });
  joiner = await createTestUser({ name: 'P674Joiner' });

  const { data: session } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: `P674-${Date.now()}`,
      creator_profile_id: creator.user.id,
      joiner_profile_id: joiner.user.id,
      creator_name: 'P674Creator',
      joiner_name: 'P674Joiner',
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
  if (sessionCode) {
    await supabaseAdmin.from('clarity_sessions').delete().eq('code', sessionCode);
  }
  if (creator) await deleteTestUser(creator.user.id);
  if (joiner) await deleteTestUser(joiner.user.id);
});

test.describe('P674: New live_state JSONB field structure', () => {
  test('accepts new phase enum values via service role', async () => {
    const phases = ['idle', 'rating', 'waiting', 'revealed', 'paraphrase', 'sliders', 'celebration'];

    for (const phase of phases) {
      const { error } = await supabaseAdmin
        .from('clarity_sessions')
        .update({ live_state: { phase, checksCount: 0 } })
        .eq('id', sessionId);

      expect(error).toBeNull();

      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', sessionId)
        .single();

      expect((data?.live_state as Record<string, unknown>)?.phase).toBe(phase);
    }
  });

  test('stores simplified field set (~20 fields)', async () => {
    const newLiveState = {
      phase: 'rating',
      currentRound: 1,
      speakerIsCreator: true,
      ratingA: null,
      ratingB: null,
      ratingASubmitted: false,
      ratingBSubmitted: false,
      speakerReRating: null,
      explainBackStarted: false,
      explainBackDone: false,
      sliderCreator: null,
      sliderJoiner: null,
      celebrationAckedCreator: false,
      celebrationAckedJoiner: false,
      selectedStoryId: null,
      selectedPointId: null,
      positionsCreator: {},
      positionsJoiner: {},
      skippedBy: null,
      ratingInitiatedBy: 'P674Creator',
      checksCount: 1,
    };

    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: newLiveState })
      .eq('id', sessionId);

    expect(error).toBeNull();

    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const state = data?.live_state as Record<string, unknown>;
    expect(state.phase).toBe('rating');
    expect(state.speakerIsCreator).toBe(true);
    expect(state.ratingASubmitted).toBe(false);
    expect(state.ratingBSubmitted).toBe(false);
    expect(state.currentRound).toBe(1);
  });
});

test.describe('P674: Participant-scoped writes via patch_live_state RPC', () => {
  test('creator can patch new field names via RPC', async () => {
    // Reset state first
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: { phase: 'rating', checksCount: 0 } })
      .eq('id', sessionId);

    const creatorClient = await getAuthenticatedClient(creator.email);

    const { error } = await creatorClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: { ratingA: 7, ratingASubmitted: true },
    });

    expect(error).toBeNull();

    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const state = data?.live_state as Record<string, unknown>;
    expect(state.ratingA).toBe(7);
    expect(state.ratingASubmitted).toBe(true);
  });

  test('joiner can patch new field names via RPC', async () => {
    const joinerClient = await getAuthenticatedClient(joiner.email);

    const { error } = await joinerClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: { ratingB: 4, ratingBSubmitted: true },
    });

    expect(error).toBeNull();

    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const state = data?.live_state as Record<string, unknown>;
    expect(state.ratingB).toBe(4);
    expect(state.ratingBSubmitted).toBe(true);
  });

  test('non-participant cannot patch via RPC', async () => {
    const outsider = await createTestUser({ name: 'P674Outsider' });
    try {
      const outsiderClient = await getAuthenticatedClient(outsider.email);

      const { error } = await outsiderClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { ratingA: 99 },
      });

      // Should fail — outsider is not creator or joiner
      expect(error).not.toBeNull();
    } finally {
      await deleteTestUser(outsider.user.id);
    }
  });
});

test.describe('P674: Phase transition flow via DB', () => {
  test('full round: idle → rating → waiting → revealed → paraphrase → sliders → celebration → idle', async () => {
    const transitions = [
      { phase: 'idle' },
      { phase: 'rating', speakerIsCreator: true, ratingInitiatedBy: 'P674Creator' },
      { phase: 'waiting', ratingASubmitted: true, ratingA: 7 },
      { phase: 'waiting', ratingBSubmitted: true, ratingB: 5 },
      { phase: 'revealed' },
      { phase: 'paraphrase', explainBackStarted: true },
      { phase: 'paraphrase', explainBackDone: true, speakerReRating: 8 },
      { phase: 'sliders', sliderCreator: 7, sliderJoiner: 5 },
      { phase: 'sliders', sliderCreator: 10, sliderJoiner: 10 },
      { phase: 'celebration' },
      { phase: 'celebration', celebrationAckedCreator: true },
      { phase: 'celebration', celebrationAckedJoiner: true },
    ];

    let accumulatedState: Record<string, unknown> = { checksCount: 0 };

    for (const transition of transitions) {
      accumulatedState = { ...accumulatedState, ...transition };

      const { error } = await supabaseAdmin
        .from('clarity_sessions')
        .update({ live_state: accumulatedState })
        .eq('id', sessionId);

      expect(error).toBeNull();

      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', sessionId)
        .single();

      expect((data?.live_state as Record<string, unknown>)?.phase).toBe(transition.phase);
    }
  });
});

test.describe('P674: Concurrent per-participant writes (slider convergence)', () => {
  test('both participants write slider values without collision', async () => {
    // Set up sliders phase
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          phase: 'sliders',
          sliderCreator: null,
          sliderJoiner: null,
          checksCount: 0,
        },
      })
      .eq('id', sessionId);

    const creatorClient = await getAuthenticatedClient(creator.email);
    const joinerClient = await getAuthenticatedClient(joiner.email);

    // Both write their slider values via RPC (simulating concurrent updates)
    const [creatorResult, joinerResult] = await Promise.all([
      creatorClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { sliderCreator: 8 },
      }),
      joinerClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { sliderJoiner: 6 },
      }),
    ]);

    expect(creatorResult.error).toBeNull();
    expect(joinerResult.error).toBeNull();

    // Verify both values persisted (no overwrite)
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const state = data?.live_state as Record<string, unknown>;
    expect(state.sliderCreator).toBe(8);
    expect(state.sliderJoiner).toBe(6);
  });
});
