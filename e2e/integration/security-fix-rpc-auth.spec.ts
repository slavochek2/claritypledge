/**
 * @file security-fix-rpc-auth.spec.ts
 * @description Integration tests for migration 20260403120100_security_fix_rpc_auth.sql
 *
 * Verifies two RPC authorization fixes:
 * 1. accept_agreement() 4-param overload now rejects creator self-signing
 *    (was missing the guard added to the 3-param overload in P453)
 * 2. patch_live_state() now rejects non-participants — only creator or joiner
 *    of the session can call the function
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: setup/teardown (bypasses RLS — service role)
 * - user-scoped anon client: used indirectly via RPC to test auth.uid() context
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

function makeUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

test.describe('Security fix: accept_agreement 4-param self-sign guard', () => {
  let creatorId: string;
  let partnerId: string;
  let partnerEmail: string;

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'Sec-RPC-Creator' });
    creatorId = creator.user.id;

    const partner = await createTestUser({ name: 'Sec-RPC-Partner' });
    partnerId = partner.user.id;
    partnerEmail = partner.email;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_agreements').delete().eq('creator_profile_id', creatorId);
    await Promise.all([deleteTestUser(creatorId), deleteTestUser(partnerId)]);
  });

  test('4-param accept_agreement blocks creator self-signing (creator_profile_id = p_partner_id)', async () => {
    const token = crypto.randomUUID();
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: creatorId,
        partner_email: partnerEmail,
        invitation_token: token,
        status: 'pending',
        visibility: 'private',
        terms_text: 'Security test terms — creator self-sign guard',
      })
      .select('id')
      .single();

    expect(insertErr).toBeNull();
    const agreementId = row!.id;

    try {
      // Creator passes their own ID as p_partner_id — must be blocked
      const { data, error } = await supabaseAdmin.rpc('accept_agreement', {
        p_agreement_id: agreementId,
        p_token: token,
        p_partner_id: creatorId,           // same as creator_profile_id
        p_partner_display_name: 'Self',    // 4-param overload
      });

      expect(error).toBeNull();
      expect(data).toBe(false); // Guard: creator_profile_id != p_partner_id

      // Agreement must remain pending
      const { data: unchanged } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status')
        .eq('id', agreementId)
        .single();
      expect(unchanged?.status).toBe('pending');
    } finally {
      await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
    }
  });

  test('4-param accept_agreement succeeds for legitimate partner with display name', async () => {
    const token = crypto.randomUUID();
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: creatorId,
        partner_email: partnerEmail,
        invitation_token: token,
        status: 'pending',
        visibility: 'private',
        terms_text: 'Security test terms — valid partner acceptance',
      })
      .select('id')
      .single();

    expect(insertErr).toBeNull();
    const agreementId = row!.id;

    try {
      const { data, error } = await supabaseAdmin.rpc('accept_agreement', {
        p_agreement_id: agreementId,
        p_token: token,
        p_partner_id: partnerId,           // different from creator — should succeed
        p_partner_display_name: 'Partner Display',
      });

      expect(error).toBeNull();
      expect(data).toBe(true);

      const { data: updated } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status, partner_profile_id')
        .eq('id', agreementId)
        .single();
      expect(updated?.status).toBe('active');
      expect(updated?.partner_profile_id).toBe(partnerId);
    } finally {
      await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
    }
  });
});

test.describe('Security fix: patch_live_state restricts to session participants', () => {
  let creatorId: string;
  let joinerId: string;
  let outsiderId: string;
  let creatorEmail: string;
  let joinerEmail: string;
  let outsiderEmail: string;
  let sessionId: string;
  let sessionCode: string;

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'Sec-PLS-Creator' });
    creatorId = creator.user.id;
    creatorEmail = creator.email;

    const joiner = await createTestUser({ name: 'Sec-PLS-Joiner' });
    joinerId = joiner.user.id;
    joinerEmail = joiner.email;

    const outsider = await createTestUser({ name: 'Sec-PLS-Outsider' });
    outsiderId = outsider.user.id;
    outsiderEmail = outsider.email;

    // Create a session with creator and joiner linked
    sessionCode = `SEC${Date.now().toString().slice(-5)}`;
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: sessionCode,
        creator_name: 'Security Creator',
        creator_profile_id: creatorId,
        joiner_profile_id: joinerId,
        live_state: {},
      })
      .select('id')
      .single();

    expect(sessionErr).toBeNull();
    sessionId = session!.id;
  });

  test.afterAll(async () => {
    if (sessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    await Promise.all([
      deleteTestUser(creatorId),
      deleteTestUser(joinerId),
      deleteTestUser(outsiderId),
    ]);
  });

  test('patch_live_state rejects non-participant (neither creator nor joiner)', async () => {
    // Sign in as outsider to get their JWT
    const tempClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: outsiderEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const outsiderClient = makeUserClient(signIn!.session!.access_token);

    // Outsider attempts to patch live state — must be a no-op (no rows match auth.uid())
    const { error } = await outsiderClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: { outsider_key: 'should_not_appear' },
    });

    // The RPC is SECURITY DEFINER void — it returns no error, but the UPDATE must
    // match 0 rows because auth.uid() is neither creator_profile_id nor joiner_profile_id
    expect(error).toBeNull();

    // Verify live_state was NOT modified
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();
    expect(session?.live_state?.outsider_key).toBeUndefined();
  });

  test('patch_live_state succeeds for session creator', async () => {
    const tempClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: creatorEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const creatorClient = makeUserClient(signIn!.session!.access_token);

    const { error } = await creatorClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: { creator_step: 'verified' },
    });
    expect(error).toBeNull();

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();
    expect(session?.live_state?.creator_step).toBe('verified');

    // Reset live_state for isolation
    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: {} })
      .eq('id', sessionId);
  });

  test('patch_live_state succeeds for session joiner', async () => {
    const tempClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: joinerEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const joinerClient = makeUserClient(signIn!.session!.access_token);

    const { error } = await joinerClient.rpc('patch_live_state', {
      p_session_id: sessionId,
      p_patch: { joiner_step: 'verified' },
    });
    expect(error).toBeNull();

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', sessionId)
      .single();
    expect(session?.live_state?.joiner_step).toBe('verified');
  });
});
