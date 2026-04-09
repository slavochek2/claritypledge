/**
 * @file p671-patch-live-state-auto-reveal.spec.ts
 *
 * P671: Integration test for patch_live_state auto-reveal.
 *
 * Verifies that patch_live_state atomically advances ratingPhase from
 * 'waiting' to 'revealed' when both checkerSubmitted and responderSubmitted
 * are true. This is the server-side fix for the race condition where both
 * clients write ratingPhase='waiting' and neither advances.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

test.describe('P671: patch_live_state auto-reveal', () => {
  let creatorId: string;
  let joinerId: string;
  let creatorEmail: string;
  let joinerEmail: string;
  let creatorToken: string;
  let joinerToken: string;
  let sessionId: string;

  test.beforeAll(async () => {
    // Create two test users (creator and joiner)
    creatorEmail = generateTestEmail();
    joinerEmail = generateTestEmail();

    const { user: creator } = await createTestUser({ email: creatorEmail });
    const { user: joiner } = await createTestUser({ email: joinerEmail });
    creatorId = creator.id;
    joinerId = joiner.id;

    // Sign in both to get JWTs for user-scoped RPC calls
    const { data: creatorAuth } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail,
      password: 'test-password-12345',
    });
    const { data: joinerAuth } = await supabaseAdmin.auth.signInWithPassword({
      email: joinerEmail,
      password: 'test-password-12345',
    });
    creatorToken = creatorAuth!.session!.access_token;
    joinerToken = joinerAuth!.session!.access_token;

    // Create a session with both participants
    const code = `P671-${Date.now()}`;
    const { data: session, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P671 Creator',
        creator_profile_id: creatorId,
        joiner_name: 'P671 Joiner',
        joiner_profile_id: joinerId,
        live_state: {
          ratingPhase: 'idle',
          checkerSubmitted: false,
          responderSubmitted: false,
        },
      })
      .select('id')
      .single();

    if (error) throw new Error(`Session creation failed: ${error.message}`);
    sessionId = session!.id;
  });

  test.afterAll(async () => {
    // Cleanup
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    if (creatorId) await supabaseAdmin.auth.admin.deleteUser(creatorId);
    if (joinerId) await supabaseAdmin.auth.admin.deleteUser(joinerId);
  });

  test('auto-advances to revealed when both submitted with ratingPhase=waiting', async () => {
    const creatorClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${creatorToken}` } } },
    );

    // Checker submits first — sets checkerSubmitted=true, ratingPhase='waiting'
    const { error: patch1 } = await creatorClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        checkerSubmitted: true,
        checkerName: 'P671 Creator',
        checkerRating: 7,
      },
    });
    expect(patch1, `Checker patch failed: ${patch1?.message}`).toBeNull();

    // Responder submits — sets responderSubmitted=true, ratingPhase='waiting'
    // Both are now true → auto-reveal should fire
    const joinerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${joinerToken}` } } },
    );
    const { error: patch2 } = await joinerClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        responderSubmitted: true,
        responderRating: 8,
      },
    });
    expect(patch2, `Responder patch failed: ${patch2?.message}`).toBeNull();

    // Verify: ratingPhase should now be 'revealed' (auto-advanced by server)
    const { data, error: readError } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();
    expect(readError).toBeNull();

    const liveState = data!.live_state as Record<string, unknown>;
    expect(liveState.ratingPhase).toBe('revealed');
    expect(liveState.checkerSubmitted).toBe(true);
    expect(liveState.responderSubmitted).toBe(true);
  });

  test('does NOT auto-advance when only one has submitted', async () => {
    // Reset state for this test
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          ratingPhase: 'idle',
          checkerSubmitted: false,
          responderSubmitted: false,
        },
      })
      .eq('id', sessionId);

    const creatorClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${creatorToken}` } } },
    );

    // Only checker submits
    const { error: patch } = await creatorClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        checkerSubmitted: true,
        checkerName: 'P671 Creator',
        checkerRating: 7,
      },
    });
    expect(patch, `Checker patch failed: ${patch?.message}`).toBeNull();

    // Verify: ratingPhase should STAY at 'waiting' (no auto-reveal)
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const liveState = data!.live_state as Record<string, unknown>;
    expect(liveState.ratingPhase).toBe('waiting');
    expect(liveState.checkerSubmitted).toBe(true);
    expect(liveState.responderSubmitted).toBe(false);
  });

  test('auth guard: non-participant cannot patch', async () => {
    // Reset to known state (test must not depend on prior test ordering)
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          ratingPhase: 'waiting',
          checkerSubmitted: true,
          responderSubmitted: false,
        },
      })
      .eq('id', sessionId);

    // Create a third user who is NOT a participant
    const outsiderEmail = generateTestEmail();
    const { user: outsider } = await createTestUser({ email: outsiderEmail });

    try {
      const { data: outsiderAuth } = await supabaseAdmin.auth.signInWithPassword({
        email: outsiderEmail,
        password: 'test-password-12345',
      });

      const outsiderClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${outsiderAuth!.session!.access_token}` } } },
      );

      // Outsider tries to patch — should silently fail (UPDATE matched 0 rows)
      const { error } = await outsiderClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { ratingPhase: 'revealed' },
      });

      // The RPC itself succeeds (no SQL error) but the UPDATE affected 0 rows
      expect(error).toBeNull();

      // Verify the state was NOT changed
      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', sessionId)
        .single();

      const liveState = data!.live_state as Record<string, unknown>;
      expect(liveState.ratingPhase).toBe('waiting');
    } finally {
      await supabaseAdmin.auth.admin.deleteUser(outsider.id);
    }
  });

  test('both submit concurrently — auto-reveal fires', async () => {
    // Reset to idle state
    await supabaseAdmin
      .from('clarity_sessions')
      .update({
        live_state: {
          ratingPhase: 'idle',
          checkerSubmitted: false,
          responderSubmitted: false,
        },
      })
      .eq('id', sessionId);

    const creatorClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${creatorToken}` } } },
    );
    const joinerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${joinerToken}` } } },
    );

    // Both submit concurrently — the exact race condition this migration fixes
    const [result1, result2] = await Promise.all([
      creatorClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: {
          ratingPhase: 'waiting',
          checkerSubmitted: true,
          checkerName: 'P671 Creator',
          checkerRating: 7,
        },
      }),
      joinerClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: {
          ratingPhase: 'waiting',
          responderSubmitted: true,
          responderRating: 8,
        },
      }),
    ]);

    expect(result1.error, `Concurrent patch 1 failed: ${result1.error?.message}`).toBeNull();
    expect(result2.error, `Concurrent patch 2 failed: ${result2.error?.message}`).toBeNull();

    // Regardless of write order, the auto-reveal should have fired
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const liveState = data!.live_state as Record<string, unknown>;
    expect(liveState.ratingPhase).toBe('revealed');
    expect(liveState.checkerSubmitted).toBe(true);
    expect(liveState.responderSubmitted).toBe(true);
  });
});
