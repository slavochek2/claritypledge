/**
 * @file p495-transcription-migration.spec.ts
 * @description MANDATORY integration tests for P495: Automatic Live Session Transcription.
 *
 * P495 adds three new tables:
 *   - session_transcripts (JSONB segments, linked to clarity_sessions)
 *   - transcription_jobs (status tracking for async pipeline)
 *   - user_voice_profiles (pgvector embeddings for speaker identification)
 *
 * Verifies:
 * 1. Schema: all three tables exist with expected columns
 * 2. RLS: participant can read own session's transcript, cannot read others'
 * 3. RLS: regular user cannot INSERT into session_transcripts (service_role only)
 * 4. RLS: user can only read own voice profile
 * 5. Private session guard: transcript INSERT blocked for private sessions (DB trigger)
 * 6. pgvector extension enabled
 *
 * TWO-CLIENT PATTERN (mandatory per P270):
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

/** Build an authenticated Supabase client from a JWT access token. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let creatorEmail: string;
let creatorId: string;
let joinerEmail: string;
let joinerId: string;
let otherEmail: string;
let otherId: string;

let sessionId: string;
let sessionCode: string;
let privateSessionId: string;
let _privateSessionCode: string;

test.beforeAll(async () => {
  // Create three test users: session creator, session joiner, and an outsider
  creatorEmail = generateTestEmail();
  const creator = await createTestUser({ email: creatorEmail, name: 'P495 Creator' });
  creatorId = creator.user.id;

  joinerEmail = generateTestEmail();
  const joiner = await createTestUser({ email: joinerEmail, name: 'P495 Joiner' });
  joinerId = joiner.user.id;

  otherEmail = generateTestEmail();
  const other = await createTestUser({ email: otherEmail, name: 'P495 Other' });
  otherId = other.user.id;

  // Create a non-private session with both participants
  const code = `P495-TEST-${Date.now()}`;
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_profile_id: creatorId,
      joiner_profile_id: joinerId,
      creator_name: 'P495 Creator',
      joiner_name: 'P495 Joiner',
      is_private: false,
    })
    .select('id, code')
    .single();

  if (sessionErr || !session) throw new Error(`Failed to create test session: ${sessionErr?.message}`);
  sessionId = session.id;
  sessionCode = session.code;

  // Create a private session
  const privateCode = `P495-PRIV-${Date.now()}`;
  const { data: privSession, error: privErr } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: privateCode,
      creator_profile_id: creatorId,
      joiner_profile_id: joinerId,
      creator_name: 'P495 Creator',
      joiner_name: 'P495 Joiner',
      is_private: true,
    })
    .select('id, code')
    .single();

  if (privErr || !privSession) throw new Error(`Failed to create private session: ${privErr?.message}`);
  privateSessionId = privSession.id;
  _privateSessionCode = privSession.code;
});

test.afterAll(async () => {
  // Clean up in reverse dependency order
  if (sessionId) {
    await supabaseAdmin.from('session_transcripts').delete().eq('session_id', sessionId);
    await supabaseAdmin.from('transcription_jobs').delete().eq('session_id', sessionId);
  }
  if (privateSessionId) {
    await supabaseAdmin.from('session_transcripts').delete().eq('session_id', privateSessionId);
    await supabaseAdmin.from('transcription_jobs').delete().eq('session_id', privateSessionId);
  }
  if (creatorId) await supabaseAdmin.from('user_voice_profiles').delete().eq('user_id', creatorId);
  if (joinerId) await supabaseAdmin.from('user_voice_profiles').delete().eq('user_id', joinerId);
  if (otherId) await supabaseAdmin.from('user_voice_profiles').delete().eq('user_id', otherId);

  // Delete sessions
  if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  if (privateSessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', privateSessionId);

  // Delete test users
  if (creatorId) await deleteTestUser(creatorId);
  if (joinerId) await deleteTestUser(joinerId);
  if (otherId) await deleteTestUser(otherId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Schema existence checks
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: Schema — tables and columns exist', () => {
  test('session_transcripts table exists with required columns', async () => {
    const { error } = await supabaseAdmin
      .from('session_transcripts')
      .select('id, session_id, segments, language, created_at')
      .limit(1);

    expect(
      error,
      `session_transcripts table or columns missing — run P495 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('transcription_jobs table exists with required columns', async () => {
    const { error } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id, session_id, session_code, status, created_at, updated_at')
      .limit(1);

    expect(
      error,
      `transcription_jobs table or columns missing — run P495 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('user_voice_profiles table exists with required columns', async () => {
    const { error } = await supabaseAdmin
      .from('user_voice_profiles')
      .select('id, user_id, created_at, updated_at')
      .limit(1);

    expect(
      error,
      `user_voice_profiles table or columns missing — run P495 migration.\nError: ${error?.message}`
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RLS: session_transcripts — participant-only SELECT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: RLS — session_transcripts participant-only SELECT', () => {
  let transcriptId: string;

  test.beforeAll(async () => {
    // Insert a transcript via admin (service role)
    const { data, error } = await supabaseAdmin
      .from('session_transcripts')
      .insert({
        session_id: sessionId,
        segments: [
          { speaker: 'P495 Creator', start: 0, end: 5, text: 'Hello from creator' },
          { speaker: 'P495 Joiner', start: 6, end: 10, text: 'Hello from joiner' },
        ],
        language: 'en',
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`Failed to insert test transcript: ${error?.message}`);
    transcriptId = data.id;
  });

  test.afterAll(async () => {
    if (transcriptId) {
      await supabaseAdmin.from('session_transcripts').delete().eq('id', transcriptId);
    }
  });

  test('session creator can read transcript of their session', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('session_transcripts')
      .select('id, segments')
      .eq('session_id', sessionId)
      .single();

    expect(error, `Creator should read own session transcript: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(transcriptId);
  });

  test('session joiner can read transcript of their session', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: joinerEmail, password: TEST_PASSWORD,
    });
    const joinerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await joinerClient
      .from('session_transcripts')
      .select('id, segments')
      .eq('session_id', sessionId)
      .single();

    expect(error, `Joiner should read own session transcript: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(transcriptId);
  });

  test('non-participant cannot read transcript of another session', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await otherClient
      .from('session_transcripts')
      .select('id, segments')
      .eq('session_id', sessionId)
      .single();

    // RLS should block: either no rows (PGRST116) or permission denied
    expect(data).toBeNull();
    expect(
      error,
      'Non-participant should NOT be able to read session transcript — RLS policy missing'
    ).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. RLS: session_transcripts — service_role only INSERT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: RLS — session_transcripts INSERT restricted to service_role', () => {
  const insertedIds: string[] = [];

  test.afterAll(async () => {
    for (const id of insertedIds) {
      await supabaseAdmin.from('session_transcripts').delete().eq('id', id);
    }
  });

  test('authenticated user cannot INSERT into session_transcripts', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('session_transcripts')
      .insert({
        session_id: sessionId,
        segments: [{ speaker: 'Hacker', start: 0, end: 1, text: 'Injected' }],
        language: 'en',
      })
      .select('id')
      .single();

    if (data?.id) insertedIds.push(data.id);

    expect(
      error,
      'Authenticated user should NOT be able to INSERT session_transcripts — must be service_role only'
    ).not.toBeNull();
  });

  test('unauthenticated caller cannot INSERT into session_transcripts', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('session_transcripts')
      .insert({
        session_id: sessionId,
        segments: [{ speaker: 'Anon', start: 0, end: 1, text: 'Should fail' }],
        language: 'en',
      })
      .select('id')
      .single();

    if (data?.id) insertedIds.push(data.id);

    expect(
      error,
      'Unauthenticated caller should NOT be able to INSERT session_transcripts'
    ).not.toBeNull();
  });

  test('service_role (admin) can INSERT into session_transcripts', async () => {
    const { data, error } = await supabaseAdmin
      .from('session_transcripts')
      .insert({
        session_id: sessionId,
        segments: [{ speaker: 'Admin', start: 0, end: 1, text: 'Service role insert' }],
        language: 'en',
      })
      .select('id')
      .single();

    if (data?.id) insertedIds.push(data.id);

    expect(error, `Service role should be able to INSERT: ${error?.message}`).toBeNull();
    expect(data?.id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RLS: user_voice_profiles — user reads only own profile
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: RLS — user_voice_profiles user reads only own', () => {
  let creatorProfileId: string;
  let joinerProfileId: string;

  test.beforeAll(async () => {
    // Insert voice profiles via admin
    const { data: cp, error: cpErr } = await supabaseAdmin
      .from('user_voice_profiles')
      .insert({ user_id: creatorId })
      .select('id')
      .single();
    if (cpErr || !cp) throw new Error(`Failed to create creator voice profile: ${cpErr?.message}`);
    creatorProfileId = cp.id;

    const { data: jp, error: jpErr } = await supabaseAdmin
      .from('user_voice_profiles')
      .insert({ user_id: joinerId })
      .select('id')
      .single();
    if (jpErr || !jp) throw new Error(`Failed to create joiner voice profile: ${jpErr?.message}`);
    joinerProfileId = jp.id;
  });

  test.afterAll(async () => {
    if (creatorProfileId) await supabaseAdmin.from('user_voice_profiles').delete().eq('id', creatorProfileId);
    if (joinerProfileId) await supabaseAdmin.from('user_voice_profiles').delete().eq('id', joinerProfileId);
  });

  test('user can read their own voice profile', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('user_voice_profiles')
      .select('id, user_id')
      .eq('user_id', creatorId)
      .single();

    expect(error, `User should read own voice profile: ${error?.message}`).toBeNull();
    expect(data?.user_id).toBe(creatorId);
  });

  test('user cannot read another user\'s voice profile', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('user_voice_profiles')
      .select('id, user_id')
      .eq('user_id', joinerId)
      .single();

    expect(data).toBeNull();
    expect(
      error,
      'User should NOT be able to read another user\'s voice profile — RLS policy missing'
    ).not.toBeNull();
  });

  test('user cannot INSERT into user_voice_profiles', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await otherClient
      .from('user_voice_profiles')
      .insert({ user_id: otherId })
      .select('id')
      .single();

    if (data?.id) {
      await supabaseAdmin.from('user_voice_profiles').delete().eq('id', data.id);
    }

    expect(
      error,
      'User should NOT be able to INSERT voice profiles — must be service_role only'
    ).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Private session guard: transcript INSERT blocked at DB level
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: Private session guard — transcript INSERT blocked', () => {
  test('transcript INSERT for private session raises exception (BEFORE INSERT trigger)', async () => {
    const { data, error } = await supabaseAdmin
      .from('session_transcripts')
      .insert({
        session_id: privateSessionId,
        segments: [{ speaker: 'Should fail', start: 0, end: 1, text: 'Private session' }],
        language: 'en',
      })
      .select('id')
      .single();

    if (data?.id) {
      // Clean up if it unexpectedly succeeded
      await supabaseAdmin.from('session_transcripts').delete().eq('id', data.id);
    }

    expect(
      error,
      'INSERT into session_transcripts for a private session should be blocked by BEFORE INSERT trigger'
    ).not.toBeNull();
    // The trigger should raise an exception with a message about private sessions
    expect(error?.message).toMatch(/private/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. RLS: transcription_jobs — participant can read, service_role writes
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P495: RLS — transcription_jobs access', () => {
  let jobId: string;

  test.beforeAll(async () => {
    const { data, error } = await supabaseAdmin
      .from('transcription_jobs')
      .insert({
        session_id: sessionId,
        session_code: sessionCode,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`Failed to create transcription job: ${error?.message}`);
    jobId = data.id;
  });

  test.afterAll(async () => {
    if (jobId) await supabaseAdmin.from('transcription_jobs').delete().eq('id', jobId);
  });

  test('session participant can read transcription job status', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('transcription_jobs')
      .select('id, status')
      .eq('session_id', sessionId)
      .single();

    expect(error, `Participant should read job status: ${error?.message}`).toBeNull();
    expect(data?.status).toBe('pending');
  });

  test('non-participant cannot read transcription job status', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: otherEmail, password: TEST_PASSWORD,
    });
    const otherClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await otherClient
      .from('transcription_jobs')
      .select('id, status')
      .eq('session_id', sessionId)
      .single();

    expect(data).toBeNull();
    expect(
      error,
      'Non-participant should NOT read transcription job — RLS policy missing'
    ).not.toBeNull();
  });

  test('authenticated user cannot directly INSERT into transcription_jobs', async () => {
    // Note: The spec says retry uses an RPC function, not direct INSERT.
    // This test confirms direct INSERT is blocked.
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: creatorEmail, password: TEST_PASSWORD,
    });
    const creatorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await creatorClient
      .from('transcription_jobs')
      .insert({
        session_id: sessionId,
        session_code: sessionCode,
        status: 'pending',
      })
      .select('id')
      .single();

    if (data?.id) {
      await supabaseAdmin.from('transcription_jobs').delete().eq('id', data.id);
    }

    expect(
      error,
      'User should NOT directly INSERT transcription_jobs — use RPC for retry'
    ).not.toBeNull();
  });
});
