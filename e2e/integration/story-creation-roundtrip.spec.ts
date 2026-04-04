/**
 * @file story-creation-roundtrip.spec.ts
 * @description Integration test: full story creation roundtrip
 *
 * Verifies the complete flow that the app performs when a user creates a story:
 *   createStory (INSERT) → getStoriesByAuthor (SELECT as owner) → public profile SELECT (as anon)
 *
 * This test catches the class of bug where stories appear to save in the UI
 * (mock mode) but never reach the database, or where RLS blocks the INSERT
 * or SELECT silently.
 *
 * Run against test DB:  npx playwright test e2e/integration/story-creation-roundtrip.spec.ts
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

test.describe.serial('Story creation roundtrip', () => {
  let authorEmail: string;
  let authorId: string;
  const createdStoryIds: string[] = [];

  test.beforeAll(async () => {
    authorEmail = generateTestEmail();
    const author = await createTestUser({ email: authorEmail, name: 'Roundtrip Author' });
    authorId = author.user.id;
  });

  test.afterAll(async () => {
    if (createdStoryIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', createdStoryIds);
      await supabaseAdmin.from('stories').delete().in('id', createdStoryIds);
    }
    await deleteTestUser(authorId);
  });

  test('verified user can INSERT a public story and SELECT it back as owner', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: authorEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const authorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    // Mirrors realStoriesService.createStory INSERT
    const { data, error } = await authorClient
      .from('stories')
      .insert({ author_id: authorId, content: 'Roundtrip test story', visibility: 'public', tags: ['test'] })
      .select('id, visibility, content')
      .single();

    if (data?.id) createdStoryIds.push(data.id);

    expect(error, `INSERT failed: ${error?.message}`).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.visibility).toBe('public');
  });

  test('author can SELECT their own story via author_id filter (profile page query)', async () => {
    expect(createdStoryIds.length).toBeGreaterThan(0);

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: authorEmail, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const authorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    // Mirrors realStoriesService.getStoriesByAuthor query
    const { data, error } = await authorClient
      .from('stories')
      .select('id, content, visibility')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    expect(error, `SELECT as author failed: ${error?.message}`).toBeNull();
    expect(data?.some(s => s.id === createdStoryIds[0])).toBe(true);
  });

  test('anon visitor can SELECT public story on profile page', async () => {
    expect(createdStoryIds.length).toBeGreaterThan(0);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    // Mirrors what a public profile page visitor sees
    const { data, error } = await anonClient
      .from('stories')
      .select('id, visibility')
      .eq('author_id', authorId)
      .eq('visibility', 'public');

    expect(error, `Anon SELECT failed: ${error?.message}`).toBeNull();
    expect(data?.some(s => s.id === createdStoryIds[0])).toBe(true);
  });

  test('story is NOT visible to anon visitor if visibility is private', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: authorEmail, password: TEST_PASSWORD,
    });
    const authorClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data: privateStory } = await authorClient
      .from('stories')
      .insert({ author_id: authorId, content: 'Private roundtrip story', visibility: 'private' })
      .select('id')
      .single();

    if (privateStory?.id) createdStoryIds.push(privateStory.id);

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data } = await anonClient
      .from('stories')
      .select('id')
      .eq('id', privateStory!.id);

    expect(data?.length ?? 0).toBe(0);
  });
});
