/**
 * @file p769-terminate-session-migration.spec.ts
 *
 * P769: Session-end terminal authority — DB migration verification.
 *
 * Mandatory per P270: every DB migration gets an integration test.
 *
 * P769 extends the `complete_clarity_session` RPC to:
 *   1. Set `clarity_sessions.status = 'completed'`
 *   2. Merge `{sessionEnded: true, sessionEndedAt: <now>}` into `live_state`
 *   3. Set `clarity_live_invites.closed_at = now()` for all linked open invites
 *
 * All three writes happen in one transaction.
 *
 * TWO-CLIENT PATTERN (mandatory per P270):
 *   - supabaseAdmin: schema-level checks (bypasses RLS)
 *   - user-scoped client: RLS/auth assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let creatorEmail: string;
let creatorId: string;
let listenerEmail: string;
let listenerId: string;
let outsiderEmail: string;
let outsiderId: string;

/** A regular (non-letter-sourced) session */
let plainSessionId: string;

/** A letter-sourced session with a clarity_live_invites row */
let letterSessionId: string;
let letterInviteId: string;

test.beforeAll(async () => {
  creatorEmail = generateTestEmail();
  const creator = await createTestUser({ email: creatorEmail, name: 'P769 Creator' });
  creatorId = creator.user.id;

  listenerEmail = generateTestEmail();
  const listener = await createTestUser({ email: listenerEmail, name: 'P769 Listener' });
  listenerId = listener.user.id;

  outsiderEmail = generateTestEmail();
  const outsider = await createTestUser({ email: outsiderEmail, name: 'P769 Outsider' });
  outsiderId = outsider.user.id;

  // Create a plain session (no invite)
  const plainCode = `P769-PLAIN-${Date.now()}`;
  const { data: plainSession, error: plainErr } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: plainCode,
      creator_name: 'P769 Creator',
      creator_profile_id: creatorId,
      joiner_name: 'P769 Listener',
      joiner_profile_id: listenerId,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (plainErr || !plainSession) throw new Error(`Failed to create plain session: ${plainErr?.message}`);
  plainSessionId = plainSession.id;

  // Create a letter-sourced session with an invite row
  const letterCode = `P769-LETTER-${Date.now() + 1}`;
  const { data: letterSession, error: letterErr } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: letterCode,
      creator_name: 'P769 Creator',
      creator_profile_id: creatorId,
      joiner_name: 'P769 Listener',
      joiner_profile_id: listenerId,
      target_listener_id: listenerId,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();

  if (letterErr || !letterSession) throw new Error(`Failed to create letter session: ${letterErr?.message}`);
  letterSessionId = letterSession.id;

  const { data: invite, error: inviteErr } = await supabaseAdmin
    .from('clarity_live_invites')
    .insert({
      creator_id: creatorId,
      session_id: letterSessionId,
      target_user_id: listenerId,
    })
    .select('id')
    .single();

  if (inviteErr || !invite) {
    console.warn(`[P769 migration test] Could not create invite row: ${inviteErr?.message}`);
  } else {
    letterInviteId = invite.id;
  }
});

test.afterAll(async () => {
  if (letterInviteId) {
    await supabaseAdmin.from('clarity_live_invites').delete().eq('id', letterInviteId);
  }
  if (letterSessionId) {
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', letterSessionId);
  }
  if (plainSessionId) {
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', plainSessionId);
  }
  if (creatorId) await deleteTestUser(creatorId);
  if (listenerId) await deleteTestUser(listenerId);
  if (outsiderId) await deleteTestUser(outsiderId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RPC callable via service role
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: complete_clarity_session RPC — service role callable', () => {
  test('RPC exists (no "function not found" error from service role)', async () => {
    const code = `P769-RPC-EXIST-${Date.now()}`;
    const { data: s, error: sErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P769 RPC Test',
        creator_profile_id: creatorId,
        joiner_profile_id: listenerId,
        joiner_name: 'P769 Listener',
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (sErr || !s) throw new Error(`Setup failed: ${sErr?.message}`);

    try {
      const { error } = await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: s.id,
      });

      expect(
        error?.message ?? null,
        `complete_clarity_session RPC not found — run P769 migration.\nError: ${error?.message}`
      ).not.toMatch(/function.*does not exist|could not find/i);
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', s.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Atomic three-write contract — plain session (no invite)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: complete_clarity_session — atomic writes on plain session', () => {
  let terminatedSessionId: string;

  test.beforeAll(async () => {
    const code = `P769-TERM-${Date.now()}`;
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P769 Term Creator',
        creator_profile_id: creatorId,
        joiner_profile_id: listenerId,
        joiner_name: 'P769 Term Joiner',
        live_state: { checksCount: 5 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`Setup failed: ${error?.message}`);
    terminatedSessionId = data.id;

    const { error: rpcErr } = await supabaseAdmin.rpc('complete_clarity_session', {
      p_session_id: terminatedSessionId,
    });
    if (rpcErr) throw new Error(`RPC call failed in setup: ${rpcErr.message}`);
  });

  test.afterAll(async () => {
    if (terminatedSessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', terminatedSessionId);
    }
  });

  test('Write 1: status becomes "completed"', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('status')
      .eq('id', terminatedSessionId)
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe('completed');
  });

  test('Write 2: live_state.sessionEnded becomes true', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', terminatedSessionId)
      .single();

    expect(error).toBeNull();
    const liveState = data?.live_state as Record<string, unknown> | null;
    expect(liveState?.sessionEnded).toBe(true);
  });

  test('Write 2b: live_state.sessionEndedAt is a valid ISO timestamp', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', terminatedSessionId)
      .single();

    expect(error).toBeNull();
    const liveState = data?.live_state as Record<string, unknown> | null;
    const endedAt = liveState?.sessionEndedAt as string | undefined;
    expect(endedAt).toBeTruthy();
    expect(() => new Date(endedAt!)).not.toThrow();

    const endedDate = new Date(endedAt!);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - endedDate.getTime());
    expect(diffMs).toBeLessThan(30_000);
  });

  test('Write 2c: pre-existing live_state keys are preserved after merge', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('id', terminatedSessionId)
      .single();

    expect(error).toBeNull();
    const liveState = data?.live_state as Record<string, unknown> | null;
    expect(liveState?.checksCount).toBe(5);
  });

  test('Write 3 (no-op for plain session): no invite rows have closed_at set for this session', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_live_invites')
      .select('id, closed_at')
      .eq('session_id', terminatedSessionId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Letter-sourced session: invite gets closed_at set
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: complete_clarity_session — invite closure for letter-sourced session', () => {
  test('clarity_live_invites.closed_at is set after RPC call', async () => {
    if (!letterInviteId) {
      test.skip();
      return;
    }

    await supabaseAdmin
      .from('clarity_live_invites')
      .update({ closed_at: null })
      .eq('id', letterInviteId);

    const { error: rpcErr } = await supabaseAdmin.rpc('complete_clarity_session', {
      p_session_id: letterSessionId,
    });

    expect(rpcErr, `RPC failed: ${rpcErr?.message}`).toBeNull();

    const { data, error } = await supabaseAdmin
      .from('clarity_live_invites')
      .select('closed_at')
      .eq('id', letterInviteId)
      .single();

    expect(error).toBeNull();
    expect(data?.closed_at).not.toBeNull();

    const closedAt = new Date(data!.closed_at!);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - closedAt.getTime());
    expect(diffMs).toBeLessThan(30_000);
  });

  test('already-closed invite is not updated again (closed_at IS NULL guard)', async () => {
    if (!letterInviteId) {
      test.skip();
      return;
    }

    const pastTime = new Date(Date.now() - 60_000).toISOString();
    await supabaseAdmin
      .from('clarity_live_invites')
      .update({ closed_at: pastTime })
      .eq('id', letterInviteId);

    await supabaseAdmin.rpc('complete_clarity_session', {
      p_session_id: letterSessionId,
    });

    const { data } = await supabaseAdmin
      .from('clarity_live_invites')
      .select('closed_at')
      .eq('id', letterInviteId)
      .single();

    expect(data?.closed_at).toBe(pastTime);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Idempotency — calling RPC twice on the same session
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: complete_clarity_session — idempotency', () => {
  test('calling RPC twice on the same session does not error', async () => {
    const code = `P769-IDEM-${Date.now()}`;
    const { data, error: createErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P769 Idem',
        creator_profile_id: creatorId,
        joiner_profile_id: listenerId,
        joiner_name: 'P769 Joiner',
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr || !data) throw new Error(`Setup failed: ${createErr?.message}`);

    try {
      const { error: firstErr } = await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: data.id,
      });
      expect(firstErr, `First call failed: ${firstErr?.message}`).toBeNull();

      const { error: secondErr } = await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: data.id,
      });
      expect(secondErr, `Idempotent second call should not error: ${secondErr?.message}`).toBeNull();
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', data.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Authorization — non-participant gets explicit error
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: complete_clarity_session — unauthorized caller rejected', () => {
  test('non-participant authenticated user gets an error (not silent 0 rows)', async () => {
    const code = `P769-AUTH-${Date.now()}`;
    const { data: session, error: createErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P769 Auth Creator',
        creator_profile_id: creatorId,
        joiner_profile_id: listenerId,
        joiner_name: 'P769 Auth Listener',
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr || !session) throw new Error(`Setup failed: ${createErr?.message}`);

    try {
      const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
        email: outsiderEmail,
        password: TEST_PASSWORD,
      });
      expect(signInErr, `Outsider sign-in failed: ${signInErr?.message}`).toBeNull();

      const outsiderClient = makeUserClient(signIn!.session!.access_token);

      const { error: rpcErr } = await outsiderClient.rpc('complete_clarity_session', {
        p_session_id: session.id,
      });

      expect(
        rpcErr,
        'Non-participant should receive an explicit error from the RPC — ' +
          'if this fails the RPC lacks authorization (security regression)'
      ).not.toBeNull();
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', session.id);
    }
  });

  test('session creator can call the RPC on their own session', async () => {
    const code = `P769-CREATOR-AUTH-${Date.now()}`;
    const { data: session, error: createErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P769 Creator Auth',
        creator_profile_id: creatorId,
        joiner_profile_id: listenerId,
        joiner_name: 'P769 Listener Auth',
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr || !session) throw new Error(`Setup failed: ${createErr?.message}`);

    try {
      const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: signIn } = await tempClient.auth.signInWithPassword({
        email: creatorEmail,
        password: TEST_PASSWORD,
      });

      const creatorClient = makeUserClient(signIn!.session!.access_token);
      const { error: rpcErr } = await creatorClient.rpc('complete_clarity_session', {
        p_session_id: session.id,
      });

      expect(rpcErr, `Creator should be authorized: ${rpcErr?.message}`).toBeNull();
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', session.id);
    }
  });
});
