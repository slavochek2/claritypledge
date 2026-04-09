/**
 * P671: Integration test for guest patch_live_state access.
 *
 * Verifies that the anon GRANT + guest WHERE branch allows guest users
 * (joiner_profile_id IS NULL, joiner_name IS NOT NULL) to write to
 * patch_live_state and trigger auto-reveal.
 *
 * Root cause: Without this migration, guest writes were silently dropped —
 * the RPC was only granted to `authenticated`, and auth.uid() IS NULL makes
 * the WHERE clause match 0 rows for anon callers.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

test.describe('P671: guest patch_live_state access', () => {
  let creatorId: string;
  let creatorEmail: string;
  let creatorToken: string;
  let sessionId: string;

  // Anon client — no auth token, uses anon key only (simulates guest user)
  const anonClient = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
  );

  test.beforeAll(async () => {
    creatorEmail = generateTestEmail();
    const { user: creator } = await createTestUser({ email: creatorEmail });
    creatorId = creator.id;

    const { data: creatorAuth } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail,
      password: 'test-password-12345',
    });
    creatorToken = creatorAuth!.session!.access_token;

    // Guest session: joiner_profile_id IS NULL, joiner_name IS NOT NULL
    const code = `P671G-${Date.now()}`;
    const { data: session, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P671 Creator',
        creator_profile_id: creatorId,
        joiner_name: 'TestBot',
        joiner_profile_id: null,
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
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    if (creatorId) await supabaseAdmin.auth.admin.deleteUser(creatorId);
  });

  test('guest (anon role) can write to patch_live_state', async () => {
    const { error } = await anonClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        responderSubmitted: true,
        responderRating: 8,
      },
    });

    expect(error, `Guest patch failed: ${error?.message}`).toBeNull();

    // Verify the write actually landed (before this fix, it was silently dropped)
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();

    const liveState = data!.live_state as Record<string, unknown>;
    expect(liveState.responderSubmitted).toBe(true);
    expect(liveState.responderRating).toBe(8);
  });

  test('auto-reveal fires when guest submits last', async () => {
    // Reset state
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

    // Creator (checker) submits first
    const { error: patch1 } = await creatorClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        checkerSubmitted: true,
        checkerName: 'P671 Creator',
        checkerRating: 7,
      },
    });
    expect(patch1, `Creator patch failed: ${patch1?.message}`).toBeNull();

    // Guest (responder) submits — should trigger auto-reveal
    const { error: patch2 } = await anonClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: {
        ratingPhase: 'waiting',
        responderSubmitted: true,
        responderRating: 8,
      },
    });
    expect(patch2, `Guest patch failed: ${patch2?.message}`).toBeNull();

    // Verify: auto-reveal fired
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

  test('guest cannot patch a session they are not the joiner of', async () => {
    // Create a session with an authenticated joiner (joiner_profile_id is set)
    const joinerEmail = generateTestEmail();
    const { user: joiner } = await createTestUser({ email: joinerEmail });

    const code = `P671GX-${Date.now()}`;
    const { data: protectedSession } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P671 Creator',
        creator_profile_id: creatorId,
        joiner_name: 'Real Joiner',
        joiner_profile_id: joiner.id, // set — NOT a guest session
        live_state: { ratingPhase: 'waiting', checkerSubmitted: true, responderSubmitted: false },
      })
      .select('id')
      .single();

    try {
      // Anon client tries to patch — WHERE clause should block it
      const { error } = await anonClient.rpc('patch_live_state', {
        p_session_id: protectedSession!.id,
        p_patch: { responderSubmitted: true, responderRating: 9 },
      });
      // Call itself doesn't error (RPC can execute), but UPDATE matches 0 rows
      expect(error).toBeNull();

      // Verify state unchanged
      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', protectedSession!.id)
        .single();

      const liveState = data!.live_state as Record<string, unknown>;
      expect(liveState.responderSubmitted).toBe(false);
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', protectedSession!.id);
      await supabaseAdmin.auth.admin.deleteUser(joiner.id);
    }
  });
});
