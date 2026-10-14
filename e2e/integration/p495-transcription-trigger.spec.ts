/**
 * @file p495-transcription-trigger.spec.ts
 * @description Integration test for P495: Transcription job creation via RPC.
 *
 * Tests the create_transcription_job RPC function that the client calls when
 * a session ends. This was the source of a bug where the RPC was inside a
 * function that early-returned, so it never executed.
 *
 * Pattern: create test user → create session → call RPC as authenticated user → assert DB state.
 * No browser needed — uses the `integration` Playwright project.
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
  creator = await createTestUser({ name: 'P495TriggerCreator' });
  joiner = await createTestUser({ name: 'P495TriggerJoiner' });

  const { data: session } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: `P495TR-${Date.now()}`,
      creator_profile_id: creator.user.id,
      joiner_profile_id: joiner.user.id,
      creator_name: 'P495TriggerCreator',
      joiner_name: 'P495TriggerJoiner',
      is_private: false,
    })
    .select('id, code')
    .single();

  if (!session) throw new Error('Failed to create test session');
  sessionId = session.id;
  sessionCode = session.code;
});

test.afterAll(async () => {
  // Clean up in dependency order
  await supabaseAdmin.from('transcription_jobs').delete().eq('session_id', sessionId);
  await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
  if (creator?.user?.id) await deleteTestUser(creator.user.id);
  if (joiner?.user?.id) await deleteTestUser(joiner.user.id);
});

test.describe('P495: Transcription Job RPC', () => {
  test('creator can create transcription job via RPC', async () => {
    const client = await getAuthenticatedClient(creator.email);

    const { error } = await client.rpc('create_transcription_job', {
      p_session_id: sessionId,
    });

    expect(error).toBeNull();

    // Verify job exists in DB
    const { data: job } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id, session_id, session_code, status')
      .eq('session_id', sessionId)
      .single();

    expect(job).toBeTruthy();
    expect(job!.session_code).toBe(sessionCode);
    expect(job!.status).toBe('pending');
  });

  test('RPC is idempotent — second call does not create duplicate', async () => {
    const client = await getAuthenticatedClient(creator.email);

    // Call again (job already exists from previous test)
    const { error } = await client.rpc('create_transcription_job', {
      p_session_id: sessionId,
    });

    expect(error).toBeNull();

    // Should still be exactly one job
    const { data: jobs } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id')
      .eq('session_id', sessionId);

    expect(jobs).toHaveLength(1);
  });

  test('joiner can also create transcription job via RPC', async () => {
    // Clean up the job from previous tests first
    await supabaseAdmin.from('transcription_jobs').delete().eq('session_id', sessionId);

    const client = await getAuthenticatedClient(joiner.email);

    const { error } = await client.rpc('create_transcription_job', {
      p_session_id: sessionId,
    });

    expect(error).toBeNull();

    const { data: job } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id, status')
      .eq('session_id', sessionId)
      .single();

    expect(job).toBeTruthy();
    expect(job!.status).toBe('pending');
  });

  test('non-participant cannot create transcription job', async () => {
    const outsider = await createTestUser({ name: 'P495Outsider' });
    try {
      const client = await getAuthenticatedClient(outsider.email);

      const { error } = await client.rpc('create_transcription_job', {
        p_session_id: sessionId,
      });

      expect(error).toBeTruthy();
      expect(error!.message).toContain('Not a participant');
    } finally {
      await deleteTestUser(outsider.user.id);
    }
  });

  test('private session blocks transcription job creation', async () => {
    // Create a private session
    const { data: privateSession } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `P495PV-${Date.now()}`,
        creator_profile_id: creator.user.id,
        creator_name: 'P495TriggerCreator',
        is_private: true,
      })
      .select('id')
      .single();

    if (!privateSession) throw new Error('Failed to create private session');

    try {
      const client = await getAuthenticatedClient(creator.email);

      const { error } = await client.rpc('create_transcription_job', {
        p_session_id: privateSession.id,
      });

      expect(error).toBeTruthy();
      expect(error!.message).toContain('private session');
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', privateSession.id);
    }
  });

  test('anonymous user cannot create transcription job', async () => {
    // Use anon client (no auth)
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anonClient.rpc('create_transcription_job', {
      p_session_id: sessionId,
    });

    // P1321: anon EXECUTE is revoked, so the refusal now happens at the grant, before the
    // body's participant check ('Not a participant') can run.
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/permission denied for function create_transcription_job/i);
  });
});

/**
 * retry_transcription — the client's "retry" path (src/app/data/api.ts retryTranscription).
 * Added 2026-10-14 when closing P1059: the search_path pin (P1223) covered this function, and
 * nothing exercised it after the pin. Its own session, serial, so the job-count assertions in
 * the describe above are never affected.
 */
test.describe('P495/P1223: retry_transcription RPC', () => {
  test.describe.configure({ mode: 'serial' });

  let retrySessionId: string;

  test.beforeAll(async () => {
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `P495RT-${Date.now()}`,
        creator_profile_id: creator.user.id,
        joiner_profile_id: joiner.user.id,
        creator_name: 'P495TriggerCreator',
        joiner_name: 'P495TriggerJoiner',
        is_private: false,
      })
      .select('id')
      .single();
    if (!session) throw new Error('Failed to create retry test session');
    retrySessionId = session.id;
  });

  test.afterAll(async () => {
    if (!retrySessionId) return;
    await supabaseAdmin.from('transcription_jobs').delete().eq('session_id', retrySessionId);
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', retrySessionId);
  });

  test('a participant can retry: a new pending job is recorded', async () => {
    const client = await getAuthenticatedClient(joiner.email);

    const { error } = await client.rpc('retry_transcription', { p_session_id: retrySessionId });
    expect(error).toBeNull();

    const { data: jobs } = await supabaseAdmin
      .from('transcription_jobs')
      .select('status')
      .eq('session_id', retrySessionId);
    expect(jobs).toHaveLength(1);
    expect(jobs![0].status).toBe('pending');
  });

  test('a second retry inside the rate-limit window is refused and records nothing', async () => {
    const client = await getAuthenticatedClient(creator.email);

    const { error } = await client.rpc('retry_transcription', { p_session_id: retrySessionId });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('Please wait 5 minutes');

    const { data: jobs } = await supabaseAdmin
      .from('transcription_jobs')
      .select('id')
      .eq('session_id', retrySessionId);
    expect(jobs).toHaveLength(1);
  });

  test('a non-participant cannot retry', async () => {
    const outsider = await createTestUser({ name: 'P495RetryOutsider' });
    try {
      const client = await getAuthenticatedClient(outsider.email);
      const { error } = await client.rpc('retry_transcription', { p_session_id: retrySessionId });
      expect(error).toBeTruthy();
      expect(error!.message).toContain('Not a participant');
    } finally {
      await deleteTestUser(outsider.user.id);
    }
  });

  test('an anonymous caller cannot retry', async () => {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await anonClient.rpc('retry_transcription', { p_session_id: retrySessionId });
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/permission denied for function retry_transcription/i);
  });
});
