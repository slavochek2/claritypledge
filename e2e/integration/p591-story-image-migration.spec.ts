/**
 * @file p591-story-image-migration.spec.ts
 * @description Integration tests for P591: Story Supporting Images — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `image_url` column exists on `stories` table
 * 2. `image_url` defaults to NULL for new stories
 * 3. Author can UPDATE image_url on their own story (RLS)
 * 4. Non-author cannot UPDATE image_url on someone else's story (RLS)
 * 5. Author can set image_url to NULL (remove image)
 * 6. Existing banner_url is unaffected by image_url operations
 * 7. Service role can update image_url directly
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';

test.describe('P591 Migration — image_url column on stories', () => {
  test.setTimeout(45000);

  let author: TestUser;
  let nonAuthor: TestUser;
  let story: TestStory;
  let tokenAuthor: string;
  let tokenNonAuthor: string;

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P591 Image Author' });
    nonAuthor = await createTestUser({ name: 'P591 Image NonAuthor' });

    story = await createTestStory(author.user.id, {
      title: 'P591 Migration Test Story — supporting images',
      content: 'A story that needs visual context to land.',
      visibility: 'public',
    });

    // Get JWTs for RLS testing
    const clientA = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInA, error: errA } = await clientA.auth.signInWithPassword({
      email: author.email,
      password: 'test-password-12345',
    });
    if (errA || !signInA?.session) throw new Error(`P591: Failed to sign in author: ${errA?.message}`);
    tokenAuthor = signInA.session.access_token;

    const clientB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInB, error: errB } = await clientB.auth.signInWithPassword({
      email: nonAuthor.email,
      password: 'test-password-12345',
    });
    if (errB || !signInB?.session) throw new Error(`P591: Failed to sign in nonAuthor: ${errB?.message}`);
    tokenNonAuthor = signInB.session.access_token;
  });

  test.afterAll(async () => {
    if (story?.id) await deleteTestStory(story.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
    if (nonAuthor?.user?.id) await deleteTestUser(nonAuthor.user.id);
  });

  // ── 1. Schema check: column exists ──────────────────────────────────────

  test('image_url column exists on stories table', async () => {
    const { error } = await supabaseAdmin
      .from('stories')
      .select('image_url')
      .limit(1);

    expect(
      error,
      'Migration not applied: "image_url" missing from "stories". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  // ── 2. Default value ────────────────────────────────────────────────────

  test('image_url defaults to NULL for new stories', async () => {
    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('id, image_url')
      .eq('id', story.id)
      .single();

    expect(error).toBeNull();
    expect(data?.image_url).toBeNull();
  });

  // ── 3. Author can UPDATE image_url on own story ─────────────────────────

  test('author can update image_url on their own story via RLS', async () => {
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const testUrl = 'https://storage.googleapis.com/claritypledge-story-images/test/p591-evidence.jpg';

    const { error, data } = await authorClient
      .from('stories')
      .update({ image_url: testUrl })
      .eq('id', story.id)
      .select('image_url');

    expect(error, `Author should be able to update image_url: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].image_url).toBe(testUrl);

    // Cleanup: reset to null
    await supabaseAdmin.from('stories').update({ image_url: null }).eq('id', story.id);
  });

  // ── 4. Non-author cannot UPDATE image_url ─────────────────────────────

  test('non-author cannot update image_url on someone else\'s story', async () => {
    const nonAuthorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenNonAuthor}` } },
    });

    const { data, error } = await nonAuthorClient
      .from('stories')
      .update({ image_url: 'https://evil.example.com/injected.jpg' })
      .eq('id', story.id)
      .select('image_url');

    // RLS should either return an error or return 0 rows (USING clause blocks)
    if (error) {
      expect(error.code).toBeTruthy();
    } else {
      expect(data?.length ?? 0, 'Non-author update should affect 0 rows').toBe(0);
    }

    // Verify image_url was NOT changed
    const { data: check } = await supabaseAdmin
      .from('stories')
      .select('image_url')
      .eq('id', story.id)
      .single();
    expect(check?.image_url).toBeNull();
  });

  // ── 5. Author can remove image (set to NULL) ─────────────────────────────

  test('author can remove image by setting image_url to NULL', async () => {
    // First set an image
    await supabaseAdmin
      .from('stories')
      .update({ image_url: 'https://storage.googleapis.com/claritypledge-story-images/test/to-remove.jpg' })
      .eq('id', story.id);

    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    const { error, data } = await authorClient
      .from('stories')
      .update({ image_url: null })
      .eq('id', story.id)
      .select('image_url');

    expect(error, `Author should be able to remove image: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].image_url).toBeNull();
  });

  // ── 6. banner_url is independent of image_url ─────────────────────────

  test('updating image_url does not affect banner_url', async () => {
    const testBannerUrl = 'https://existing-banner.example.com/og-image.jpg';
    const testImageUrl = 'https://storage.googleapis.com/claritypledge-story-images/test/p591-independent.jpg';

    // Set both banner_url and image_url
    await supabaseAdmin
      .from('stories')
      .update({ banner_url: testBannerUrl, image_url: testImageUrl })
      .eq('id', story.id);

    // Now update only image_url
    const authorClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${tokenAuthor}` } },
    });

    await authorClient
      .from('stories')
      .update({ image_url: null })
      .eq('id', story.id);

    // Verify banner_url is untouched
    const { data } = await supabaseAdmin
      .from('stories')
      .select('banner_url, image_url')
      .eq('id', story.id)
      .single();

    expect(data?.banner_url).toBe(testBannerUrl);
    expect(data?.image_url).toBeNull();

    // Cleanup
    await supabaseAdmin.from('stories').update({ banner_url: null, image_url: null }).eq('id', story.id);
  });

  // ── 7. Service role can update image_url directly ─────────────────────

  test('service_role can update image_url on stories directly', async () => {
    const testUrl = 'https://storage.googleapis.com/claritypledge-story-images/service-role-test.jpg';

    const { error } = await supabaseAdmin
      .from('stories')
      .update({ image_url: testUrl })
      .eq('id', story.id);

    expect(error, `service_role should be able to update image_url: ${error?.message}`).toBeNull();

    const { data } = await supabaseAdmin
      .from('stories')
      .select('image_url')
      .eq('id', story.id)
      .single();
    expect(data?.image_url).toBe(testUrl);

    // Cleanup
    await supabaseAdmin.from('stories').update({ image_url: null }).eq('id', story.id);
  });

  // ── 8. image_url returned in SELECT alongside other fields ────────────

  test('image_url is included in story SELECT queries', async () => {
    const testUrl = 'https://storage.googleapis.com/claritypledge-story-images/test/select-check.jpg';

    await supabaseAdmin
      .from('stories')
      .update({ image_url: testUrl })
      .eq('id', story.id);

    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('id, title, content, image_url, banner_url, author_id')
      .eq('id', story.id)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(story.id);
    expect(data?.title).toBe(story.title);
    expect(data?.image_url).toBe(testUrl);
    expect(data?.author_id).toBe(author.user.id);

    // Cleanup
    await supabaseAdmin.from('stories').update({ image_url: null }).eq('id', story.id);
  });
});
