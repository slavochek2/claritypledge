/**
 * P671: Integration test for patch_live_state auto-reveal.
 *
 * Verifies the upgraded patch_live_state() function:
 * 1. Normal merge still works (non-reveal cases)
 * 2. Auto-advances ratingPhase to 'revealed' when both participants submitted
 * 3. Auth guard: unauthorized caller is rejected
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';
import { createClient } from '@supabase/supabase-js';

const SESSION_CODE = () => `TEST-AUTOREVEAL-${Date.now()}`;

async function createSession(creatorProfileId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: SESSION_CODE(),
      creator_name: 'AutoReveal Test',
      creator_profile_id: creatorProfileId,
      live_state: { ratingPhase: 'waiting', checkerSubmitted: false, responderSubmitted: false },
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  return data!.id;
}

test.describe('Migration 20260409120000: patch_live_state auto-reveal', () => {
  let creatorEmail: string;
  let creatorUserId: string;
  let creatorProfileId: string;
  let creatorToken: string;

  test.beforeAll(async () => {
    creatorEmail = generateTestEmail();
    const { user, profile } = await createTestUser({ email: creatorEmail });
    creatorUserId = user.id;
    creatorProfileId = profile.id;

    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail,
      password: 'test-password-12345',
    });
    expect(error).toBeNull();
    creatorToken = signIn!.session!.access_token;
  });

  test.afterAll(async () => {
    if (creatorUserId) await supabaseAdmin.auth.admin.deleteUser(creatorUserId);
  });

  // ── 1. Normal patch still works ───────────────────────────────────────────
  test('non-reveal patch merges fields without touching ratingPhase', async () => {
    const sessionId = await createSession(creatorProfileId);
    try {
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${creatorToken}` } } }
      );

      const { error } = await userClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { checkerSubmitted: true },
      });
      expect(error).toBeNull();

      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', sessionId)
        .single();

      // ratingPhase stays 'waiting' — only one participant submitted
      expect((data!.live_state as Record<string, unknown>).ratingPhase).toBe('waiting');
      expect((data!.live_state as Record<string, unknown>).checkerSubmitted).toBe(true);
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });

  // ── 2. Auto-reveal fires when both submitted ───────────────────────────────
  test('ratingPhase advances to revealed when both submitted=true', async () => {
    const sessionId = await createSession(creatorProfileId);
    try {
      const userClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${creatorToken}` } } }
      );

      // Simulate second submitter's write — both flags now true
      const { error } = await userClient.rpc('patch_live_state', {
        p_session_id: sessionId,
        p_patch: { checkerSubmitted: true, responderSubmitted: true },
      });
      expect(error).toBeNull();

      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('id', sessionId)
        .single();

      // Server should have auto-advanced to 'revealed'
      expect((data!.live_state as Record<string, unknown>).ratingPhase).toBe('revealed');
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });

  // ── 3. Auth guard blocks unauthorized caller ───────────────────────────────
  test('unauthorized user cannot patch another session', async () => {
    const sessionId = await createSession(creatorProfileId);
    try {
      // Different user — not creator or joiner of this session
      const otherEmail = generateTestEmail();
      const { user: otherUser } = await createTestUser({ email: otherEmail });
      try {
        const { data: otherSignIn } = await supabaseAdmin.auth.signInWithPassword({
          email: otherEmail,
          password: 'test-password-12345',
        });
        const otherClient = createClient(
          process.env.VITE_SUPABASE_URL!,
          process.env.VITE_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${otherSignIn!.session!.access_token}` } } }
        );

        const { error } = await otherClient.rpc('patch_live_state', {
          p_session_id: sessionId,
          p_patch: { checkerSubmitted: true },
        });
        expect(error).not.toBeNull();
        expect(error!.message).toContain('not authorized');
      } finally {
        await supabaseAdmin.auth.admin.deleteUser(otherUser.id);
      }
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });
});
