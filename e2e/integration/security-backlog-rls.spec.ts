/**
 * @file security-backlog-rls.spec.ts
 * @description Integration tests for migration 20260404120000_security_backlog_rls.sql
 *
 * Verifies three backlog RLS fixes:
 * 1. witnesses INSERT — restricted to own profile_id (auth.uid() = profile_id)
 * 2. ml_training_sessions — RLS enabled; unauthenticated INSERT blocked
 * 3. story_versions INSERT — regression test: author can still insert (old
 *    `current_user = 'postgres'` check removed; EXISTS on author_id sufficient)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: service role for setup/teardown
 * - anon client: for unauthenticated rejection assertions
 * - user-scoped client: for authenticated RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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

test.describe('Security backlog: witnesses INSERT restricted to own profile_id', () => {
  let ownerId: string;
  let ownerEmail: string;
  let otherUserId: string;
  let otherUserEmail: string;

  test.beforeAll(async () => {
    const owner = await createTestUser({ name: 'Sec-Witness-Owner' });
    ownerId = owner.user.id;
    ownerEmail = owner.email;

    const other = await createTestUser({ name: 'Sec-Witness-Other' });
    otherUserId = other.user.id;
    otherUserEmail = other.email;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', ownerId);
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', otherUserId);
    await Promise.all([deleteTestUser(ownerId), deleteTestUser(otherUserId)]);
  });

  test('authenticated user cannot INSERT witness for another profile (mismatched profile_id)', async () => {
    // Sign in as "other" user, try to insert a witness for "owner" profile
    const tempClient = makeAnonClient();
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: otherUserEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const otherClient = makeUserClient(signIn!.session!.access_token);

    const { error } = await otherClient
      .from('witnesses')
      .insert({
        profile_id: ownerId,           // NOT auth.uid() — must be blocked
        witness_name: 'Impersonated Witness',
        is_verified: true,
      });

    expect(error).not.toBeNull();
    // RLS WITH CHECK (auth.uid() = profile_id) rejects the mismatch
    expect(error!.code).toMatch(/42501|PGRST301/);
  });

  test('authenticated user CAN INSERT witness for their own profile_id', async () => {
    // Sign in as owner, insert witness for own profile
    const tempClient = makeAnonClient();
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: ownerEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const ownerClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await ownerClient
      .from('witnesses')
      .insert({
        profile_id: ownerId,           // matches auth.uid() — should succeed
        witness_name: 'Own Witness',
        is_verified: true,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    // Cleanup
    if (data?.id) {
      await supabaseAdmin.from('witnesses').delete().eq('id', data.id);
    }
  });
});

test.describe('Security backlog: ml_training_sessions has RLS enabled', () => {
  test('unauthenticated INSERT into ml_training_sessions is blocked', async () => {
    const anonClient = makeAnonClient();

    const { error } = await anonClient
      .from('ml_training_sessions')
      .insert({
        session_code: `SEC-ML-${Date.now()}`,
        user_name: 'Anon User',
        audio_path: 'gs://test/fake.webm',
        duration_ms: 30000,
      });

    // RLS is now enabled; anon user is not authenticated → insert blocked
    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|PGRST301/);
  });

  test('authenticated INSERT into ml_training_sessions is allowed', async () => {
    // The INSERT policy allows authenticated role WITH CHECK (true)
    const testUser = await createTestUser({ name: 'Sec-ML-Auth' });
    const sessionCode = `SEC-ML-AUTH-${Date.now()}`;

    try {
      const tempClient = makeAnonClient();
      const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
        email: testUser.email,
        password: TEST_PASSWORD,
      });
      expect(signInErr).toBeNull();

      const userClient = makeUserClient(signIn!.session!.access_token);

      const { error } = await userClient
        .from('ml_training_sessions')
        .insert({
          session_code: sessionCode,
          user_name: testUser.name,
          audio_path: `gs://claritypledge-ml-training/sessions/${sessionCode}/chunk_0.webm`,
          duration_ms: 30000,
        });

      expect(error).toBeNull();
    } finally {
      // Cleanup via service role (SELECT is restricted to service_role)
      await supabaseAdmin.from('ml_training_sessions').delete().eq('session_code', sessionCode);
      await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('Security backlog: story_versions INSERT works for story author (regression)', () => {
  let authorId: string;
  let authorEmail: string;
  let storyId: string;

  test.beforeAll(async () => {
    const author = await createTestUser({ name: 'Sec-StoryVer-Author' });
    authorId = author.user.id;
    authorEmail = author.email;

    // Create a story via service role
    const { data: story, error: storyErr } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: authorId,
        title: 'Security regression test story',
        content: 'Content for story_versions INSERT regression test.',
        current_version: 1,
      })
      .select('id')
      .single();

    expect(storyErr).toBeNull();
    storyId = story!.id;
  });

  test.afterAll(async () => {
    if (storyId) {
      // story_versions cascade-delete with stories
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    await deleteTestUser(authorId);
  });

  test('story author can INSERT a story_version after removing current_user = postgres check', async () => {
    // The old policy included `current_user = 'postgres'` which could never be true
    // in Supabase (roles are anon/authenticated/service_role). The migration removes it,
    // leaving only: EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())

    const tempClient = makeAnonClient();
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: authorEmail,
      password: TEST_PASSWORD,
    });
    expect(signInErr).toBeNull();

    const authorClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await authorClient
      .from('story_versions')
      .insert({
        story_id: storyId,
        version_number: 1,
        title: 'Security regression test story',
        content: 'Version 1 content for regression test.',
      })
      .select('id, version_number')
      .single();

    expect(error, `story_versions INSERT failed: ${error?.message}`).toBeNull();
    expect(data?.version_number).toBe(1);

    // Cleanup handled in afterAll via cascade delete on story
  });

  test('non-author cannot INSERT a story_version for another user story', async () => {
    const nonAuthor = await createTestUser({ name: 'Sec-StoryVer-NonAuthor' });

    try {
      const tempClient = makeAnonClient();
      const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
        email: nonAuthor.email,
        password: TEST_PASSWORD,
      });
      expect(signInErr).toBeNull();

      const nonAuthorClient = makeUserClient(signIn!.session!.access_token);

      const { error } = await nonAuthorClient
        .from('story_versions')
        .insert({
          story_id: storyId,             // story belongs to a different author
          version_number: 99,
          title: 'Unauthorized version',
          content: 'This should be blocked.',
        });

      expect(error).not.toBeNull();
      expect(error!.code).toMatch(/42501|PGRST301/);
    } finally {
      await deleteTestUser(nonAuthor.user.id);
    }
  });
});
