/**
 * @file p551-clarity-docs-migration.spec.ts
 * @description Integration tests for P551: Clarity Docs — Curated Story Collections
 *
 * Verifies:
 * 1. Schema: clarity_docs table exists with all required columns
 * 2. Schema: doc_stories junction table exists with all required columns
 * 3. Schema: indexes and unique constraints exist
 * 4. RLS: private doc invisible to non-owner
 * 5. RLS: public doc visible to all authenticated users
 * 6. RLS: doc_stories scoped through doc ownership
 * 7. RLS: only own stories can be added to doc
 * 8. Constraint: private story cannot be added to public doc
 * 9. Constraint: same story cannot appear twice in same doc (UNIQUE)
 * 10. Cascade: deleting doc deletes doc_stories but not stories
 * 11. Defaults: new doc defaults to private visibility
 * 12. Position ordering works for doc_stories
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level ops (bypasses RLS)
 * - ownerClient (JWT): authenticated as doc owner
 * - otherClient (JWT): authenticated as a different user
 *
 * If "clarity_docs table missing" -> P551 migration not applied.
 * If "private doc visible to other user" -> clarity_docs SELECT RLS not correct.
 * If "private story added to public doc" -> cross-visibility trigger/constraint missing.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

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

/** Sign in a user and return an authenticated client. */
async function signInAsUser(email: string): Promise<ReturnType<typeof makeUserClient>> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`Failed to sign in ${email}: ${error?.message}`);
  }
  return makeUserClient(data.session.access_token);
}

/** Create an anonymous (unauthenticated) Supabase client. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Helper: create a test doc via admin (bypasses RLS)
// ---------------------------------------------------------------------------
async function createTestDoc(
  ownerId: string,
  options: { title?: string; visibility?: 'public' | 'private' } = {}
) {
  const { data, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({
      owner_id: ownerId,
      title: options.title ?? `Test Doc ${Date.now()}`,
      visibility: options.visibility ?? 'private',
    })
    .select('id, title, visibility, owner_id')
    .single();

  if (error || !data) throw new Error(`Failed to create test doc: ${error?.message}`);
  return data;
}

/** Delete a test doc via admin. */
async function deleteTestDoc(docId: string) {
  await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
}

/** Add a story to a doc via admin. */
async function addStoryToDoc(docId: string, storyId: string, position: number) {
  const { data, error } = await supabaseAdmin
    .from('doc_stories')
    .insert({ doc_id: docId, story_id: storyId, position })
    .select('doc_id, story_id, position')
    .single();

  if (error) throw new Error(`Failed to add story to doc: ${error?.message}`);
  return data;
}

// ===========================================================================
// 1. Schema checks — clarity_docs table
// ===========================================================================

test.describe('P551: Schema — clarity_docs table', () => {
  test('clarity_docs table exists (P551 migration applied)', async () => {
    const { error } = await supabaseAdmin.from('clarity_docs').select('id').limit(1);
    expect(
      error,
      `clarity_docs table missing — apply P551 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('clarity_docs has required columns: id, owner_id, title, visibility, created_at, updated_at', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_docs')
      .select('id, owner_id, title, visibility, created_at, updated_at')
      .limit(1);

    expect(
      error,
      `clarity_docs missing required columns.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('clarity_docs visibility column accepts "private" value', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DocPrivate' });
    try {
      const doc = await createTestDoc(owner.user.id, { visibility: 'private' });
      expect(doc.visibility).toBe('private');
      await deleteTestDoc(doc.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });

  test('clarity_docs visibility column accepts "public" value', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DocPublic' });
    try {
      const doc = await createTestDoc(owner.user.id, { visibility: 'public' });
      expect(doc.visibility).toBe('public');
      await deleteTestDoc(doc.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });

  test('clarity_docs defaults to private visibility when not specified', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DocDefault' });
    try {
      // Insert without specifying visibility
      const { data, error } = await supabaseAdmin
        .from('clarity_docs')
        .insert({
          owner_id: owner.user.id,
          title: 'Default visibility test',
        })
        .select('id, visibility')
        .single();

      expect(error, `INSERT without visibility failed: ${error?.message}`).toBeNull();
      expect(
        data?.visibility,
        `New doc should default to 'private', got '${data?.visibility}'`
      ).toBe('private');

      if (data?.id) await deleteTestDoc(data.id);
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });
});

// ===========================================================================
// 2. Schema checks — doc_stories junction table
// ===========================================================================

test.describe('P551: Schema — doc_stories junction table', () => {
  test('doc_stories table exists', async () => {
    const { error } = await supabaseAdmin.from('doc_stories').select('doc_id').limit(1);
    expect(
      error,
      `doc_stories table missing — apply P551 migration.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('doc_stories has required columns: doc_id, story_id, position, created_at', async () => {
    const { error } = await supabaseAdmin
      .from('doc_stories')
      .select('doc_id, story_id, position, created_at')
      .limit(1);

    expect(
      error,
      `doc_stories missing required columns.\nError: ${error?.message}`
    ).toBeNull();
  });

  test('doc_stories position column stores numeric ordering', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 Position' });
    let docId: string | undefined;
    let storyId: string | undefined;
    try {
      const doc = await createTestDoc(owner.user.id);
      docId = doc.id;

      const story = await createTestStory(owner.user.id, {
        title: 'P551 position test story',
      });
      storyId = story.id;

      const row = await addStoryToDoc(doc.id, story.id, 42);
      expect(row.position).toBe(42);
    } finally {
      if (docId) await deleteTestDoc(docId);
      if (storyId) await deleteTestStory(storyId);
      await deleteTestUser(owner.user.id);
    }
  });

  test('doc_stories UNIQUE constraint prevents duplicate story in same doc', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 Unique' });
    let docId: string | undefined;
    let storyId: string | undefined;
    try {
      const doc = await createTestDoc(owner.user.id);
      docId = doc.id;

      const story = await createTestStory(owner.user.id, {
        title: 'P551 unique constraint test',
      });
      storyId = story.id;

      // First insert should succeed
      await addStoryToDoc(doc.id, story.id, 0);

      // Second insert of same story should fail
      const { error } = await supabaseAdmin
        .from('doc_stories')
        .insert({ doc_id: doc.id, story_id: story.id, position: 1 });

      expect(
        error,
        'Duplicate story in same doc should be rejected by UNIQUE constraint'
      ).not.toBeNull();
      expect(error?.message).toMatch(/unique|duplicate|already exists/i);
    } finally {
      if (docId) await deleteTestDoc(docId);
      if (storyId) await deleteTestStory(storyId);
      await deleteTestUser(owner.user.id);
    }
  });

  test('same story CAN appear in multiple docs (same owner)', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 MultiDoc' });
    let doc1Id: string | undefined;
    let doc2Id: string | undefined;
    let storyId: string | undefined;
    try {
      const doc1 = await createTestDoc(owner.user.id, { title: 'Doc 1' });
      doc1Id = doc1.id;
      const doc2 = await createTestDoc(owner.user.id, { title: 'Doc 2' });
      doc2Id = doc2.id;

      const story = await createTestStory(owner.user.id, {
        title: 'P551 multi-doc story',
        visibility: 'private',
      });
      storyId = story.id;

      // Add same story to both docs
      await addStoryToDoc(doc1.id, story.id, 0);
      const row2 = await addStoryToDoc(doc2.id, story.id, 0);
      expect(row2.story_id).toBe(story.id);
    } finally {
      if (doc1Id) await deleteTestDoc(doc1Id);
      if (doc2Id) await deleteTestDoc(doc2Id);
      if (storyId) await deleteTestStory(storyId);
      await deleteTestUser(owner.user.id);
    }
  });
});

// ===========================================================================
// 3. RLS — private doc invisible to non-owner
// ===========================================================================

test.describe('P551: RLS — clarity_docs visibility enforcement', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privateDocId: string;
  let publicDocId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DocOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P551 DocOther' });
    otherId = other.user.id;

    const privateDoc = await createTestDoc(ownerId, {
      title: 'P551 private doc',
      visibility: 'private',
    });
    privateDocId = privateDoc.id;

    const publicDoc = await createTestDoc(ownerId, {
      title: 'P551 public doc',
      visibility: 'public',
    });
    publicDocId = publicDoc.id;
  });

  test.afterAll(async () => {
    await deleteTestDoc(privateDocId);
    await deleteTestDoc(publicDocId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('owner can SELECT their own private doc', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('clarity_docs')
      .select('id, title, visibility')
      .eq('id', privateDocId)
      .single();

    expect(error, `Owner should read own private doc: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(privateDocId);
    expect(data?.visibility).toBe('private');
  });

  test('other user CANNOT SELECT a private doc', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('clarity_docs')
      .select('id, title')
      .eq('id', privateDocId)
      .single();

    expect(data, 'Other user should NOT see private doc').toBeNull();
    expect(
      error,
      'Query for private doc by non-owner should return error (no rows or permission denied)'
    ).not.toBeNull();
  });

  test('any authenticated user can SELECT a public doc', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('clarity_docs')
      .select('id, title, visibility')
      .eq('id', publicDocId)
      .single();

    expect(error, `Any user should read public doc: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(publicDocId);
  });

  test('anonymous user CANNOT SELECT private doc', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient
      .from('clarity_docs')
      .select('id')
      .eq('id', privateDocId)
      .single();

    expect(data, 'Anon should NOT see private doc').toBeNull();
    expect(error).not.toBeNull();
  });

  test('anonymous user CAN SELECT public doc', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient
      .from('clarity_docs')
      .select('id')
      .eq('id', publicDocId)
      .single();

    expect(error, `Anon should read public doc: ${error?.message}`).toBeNull();
    expect(data?.id).toBe(publicDocId);
  });
});

// ===========================================================================
// 4. RLS — doc_stories scoped through doc ownership
// ===========================================================================

test.describe('P551: RLS — doc_stories scoped through doc ownership', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let privateDocId: string;
  let publicDocId: string;
  let storyId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DSOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P551 DSOther' });
    otherId = other.user.id;

    const story = await createTestStory(ownerId, {
      title: 'P551 doc_stories RLS test story',
    });
    storyId = story.id;

    const privateDoc = await createTestDoc(ownerId, {
      title: 'P551 private doc for DS',
      visibility: 'private',
    });
    privateDocId = privateDoc.id;

    const publicDoc = await createTestDoc(ownerId, {
      title: 'P551 public doc for DS',
      visibility: 'public',
    });
    publicDocId = publicDoc.id;

    await addStoryToDoc(privateDocId, storyId, 0);
    await addStoryToDoc(publicDocId, storyId, 0);
  });

  test.afterAll(async () => {
    await deleteTestDoc(privateDocId);
    await deleteTestDoc(publicDocId);
    await deleteTestStory(storyId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('other user CANNOT see doc_stories rows for a private doc', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('doc_stories')
      .select('doc_id, story_id')
      .eq('doc_id', privateDocId);

    expect(error, `doc_stories query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length ?? 0,
      `Other user should see 0 doc_stories rows for private doc, got ${data?.length}`
    ).toBe(0);
  });

  test('owner CAN see doc_stories rows for their private doc', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('doc_stories')
      .select('doc_id, story_id')
      .eq('doc_id', privateDocId);

    expect(error, `Owner doc_stories query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Owner should see doc_stories rows for their private doc'
    ).toBeGreaterThan(0);
  });

  test('any user CAN see doc_stories rows for a public doc', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { data, error } = await otherClient
      .from('doc_stories')
      .select('doc_id, story_id')
      .eq('doc_id', publicDocId);

    expect(error, `Public doc_stories query should not error: ${error?.message}`).toBeNull();
    expect(
      data?.length,
      'Any user should see doc_stories rows for a public doc'
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. RLS — only own stories can be added to doc
// ===========================================================================

test.describe('P551: RLS — only own stories can be added to doc', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;
  let docId: string;
  let ownerStoryId: string;
  let otherStoryId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 StoryOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P551 StoryOther' });
    otherId = other.user.id;

    const doc = await createTestDoc(ownerId, { title: 'P551 own stories test' });
    docId = doc.id;

    const ownerStory = await createTestStory(ownerId, { title: 'Owner story' });
    ownerStoryId = ownerStory.id;

    const otherStory = await createTestStory(otherId, { title: 'Other user story' });
    otherStoryId = otherStory.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteTestDoc(docId);
    await deleteTestStory(ownerStoryId);
    await deleteTestStory(otherStoryId);
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('doc owner CAN add their own story to their doc (via RLS)', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { error } = await ownerClient
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: ownerStoryId, position: 0 });

    expect(
      error,
      `Owner should add own story to doc: ${error?.message}`
    ).toBeNull();

    // Cleanup for next test
    await supabaseAdmin.from('doc_stories').delete()
      .eq('doc_id', docId).eq('story_id', ownerStoryId);
  });

  test('doc owner CANNOT add another user story to their doc', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { error } = await ownerClient
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: otherStoryId, position: 0 });

    // This should fail — either RLS blocks or a trigger/constraint rejects
    expect(
      error,
      'Adding another user\'s story to doc should fail'
    ).not.toBeNull();
  });

  test('other user CANNOT add stories to someone else doc', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { error } = await otherClient
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: otherStoryId, position: 0 });

    expect(
      error,
      'Non-owner should NOT be able to add stories to someone else\'s doc'
    ).not.toBeNull();
  });
});

// ===========================================================================
// 6. Cross-visibility constraint — private story cannot be in public doc
// ===========================================================================

test.describe('P551: Cross-visibility — private story cannot be added to public doc', () => {
  let ownerId: string;
  let publicDocId: string;
  let privateDocId: string;
  let privateStoryId: string;
  let publicStoryId: string;

  test.beforeAll(async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 CrossVis' });
    ownerId = owner.user.id;

    const publicDoc = await createTestDoc(ownerId, {
      title: 'P551 public doc for cross-vis',
      visibility: 'public',
    });
    publicDocId = publicDoc.id;

    const privateDoc = await createTestDoc(ownerId, {
      title: 'P551 private doc for cross-vis',
      visibility: 'private',
    });
    privateDocId = privateDoc.id;

    const privateStory = await createTestStory(ownerId, {
      title: 'P551 private story for cross-vis',
      visibility: 'private',
    });
    privateStoryId = privateStory.id;

    const publicStory = await createTestStory(ownerId, {
      title: 'P551 public story for cross-vis',
      visibility: 'public',
    });
    publicStoryId = publicStory.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('doc_stories').delete().in('doc_id', [publicDocId, privateDocId]);
    await deleteTestDoc(publicDocId);
    await deleteTestDoc(privateDocId);
    await deleteTestStory(privateStoryId);
    await deleteTestStory(publicStoryId);
    await deleteTestUser(ownerId);
  });

  test('public story CAN be added to public doc', async () => {
    const { error } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: publicDocId, story_id: publicStoryId, position: 0 });

    expect(error, `Public story in public doc should work: ${error?.message}`).toBeNull();

    await supabaseAdmin.from('doc_stories').delete()
      .eq('doc_id', publicDocId).eq('story_id', publicStoryId);
  });

  test('public story CAN be added to private doc (private collection)', async () => {
    const { error } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: privateDocId, story_id: publicStoryId, position: 0 });

    expect(
      error,
      `Public story in private doc should work (private collection): ${error?.message}`
    ).toBeNull();

    await supabaseAdmin.from('doc_stories').delete()
      .eq('doc_id', privateDocId).eq('story_id', publicStoryId);
  });

  test('private story CAN be added to private doc', async () => {
    const { error } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: privateDocId, story_id: privateStoryId, position: 0 });

    expect(
      error,
      `Private story in private doc should work: ${error?.message}`
    ).toBeNull();

    await supabaseAdmin.from('doc_stories').delete()
      .eq('doc_id', privateDocId).eq('story_id', privateStoryId);
  });

  test('private story CANNOT be added to public doc (visibility leak blocked)', async () => {
    const { error } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: publicDocId, story_id: privateStoryId, position: 0 });

    expect(
      error,
      'Private story in public doc should be blocked — cross-visibility constraint missing'
    ).not.toBeNull();
    expect(
      error?.message,
      'Error message should mention visibility or private'
    ).toMatch(/private|visibility|cannot/i);
  });
});

// ===========================================================================
// 7. Cascade — deleting doc deletes doc_stories but NOT stories
// ===========================================================================

test.describe('P551: Cascade — doc deletion cleans up doc_stories, preserves stories', () => {
  test('deleting a doc removes its doc_stories rows but stories survive', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 Cascade' });
    const ownerId = owner.user.id;

    try {
      const doc = await createTestDoc(ownerId, { title: 'P551 cascade test doc' });
      const story1 = await createTestStory(ownerId, { title: 'P551 cascade story 1' });
      const story2 = await createTestStory(ownerId, { title: 'P551 cascade story 2' });

      await addStoryToDoc(doc.id, story1.id, 0);
      await addStoryToDoc(doc.id, story2.id, 1);

      // Verify doc_stories exist
      const { data: beforeRows } = await supabaseAdmin
        .from('doc_stories')
        .select('doc_id')
        .eq('doc_id', doc.id);
      expect(beforeRows?.length, 'Should have 2 doc_stories rows before delete').toBe(2);

      // Delete the doc
      await deleteTestDoc(doc.id);

      // doc_stories should be gone (CASCADE)
      const { data: afterRows } = await supabaseAdmin
        .from('doc_stories')
        .select('doc_id')
        .eq('doc_id', doc.id);
      expect(afterRows?.length ?? 0, 'doc_stories should be deleted after doc deletion').toBe(0);

      // Stories should survive
      const { data: survivedStory1 } = await supabaseAdmin
        .from('stories')
        .select('id')
        .eq('id', story1.id)
        .single();
      expect(survivedStory1?.id, 'Story 1 should survive doc deletion').toBe(story1.id);

      const { data: survivedStory2 } = await supabaseAdmin
        .from('stories')
        .select('id')
        .eq('id', story2.id)
        .single();
      expect(survivedStory2?.id, 'Story 2 should survive doc deletion').toBe(story2.id);

      // Cleanup stories
      await deleteTestStory(story1.id);
      await deleteTestStory(story2.id);
    } finally {
      await deleteTestUser(ownerId);
    }
  });
});

// ===========================================================================
// 8. Doc INSERT/UPDATE RLS — only owner can create/modify their docs
// ===========================================================================

test.describe('P551: RLS — doc INSERT/UPDATE restricted to owner', () => {
  let ownerEmail: string;
  let ownerId: string;
  let otherEmail: string;
  let otherId: string;

  test.beforeAll(async () => {
    ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 WriteOwner' });
    ownerId = owner.user.id;

    otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P551 WriteOther' });
    otherId = other.user.id;
  });

  test.afterAll(async () => {
    await deleteTestUser(ownerId);
    await deleteTestUser(otherId);
  });

  test('authenticated user can INSERT a doc they own', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const { data, error } = await ownerClient
      .from('clarity_docs')
      .insert({
        owner_id: ownerId,
        title: 'P551 RLS insert test',
      })
      .select('id, owner_id')
      .single();

    expect(error, `Owner should create doc: ${error?.message}`).toBeNull();
    expect(data?.owner_id).toBe(ownerId);

    if (data?.id) await deleteTestDoc(data.id);
  });

  test('user CANNOT INSERT a doc with another user as owner', async () => {
    const otherClient = await signInAsUser(otherEmail);

    const { error } = await otherClient
      .from('clarity_docs')
      .insert({
        owner_id: ownerId, // Trying to create as someone else
        title: 'P551 RLS spoof test',
      });

    expect(
      error,
      'User should NOT create a doc with someone else as owner'
    ).not.toBeNull();
  });

  test('user can UPDATE title on their own doc', async () => {
    const ownerClient = await signInAsUser(ownerEmail);

    const doc = await createTestDoc(ownerId, { title: 'Original title' });
    try {
      const { error } = await ownerClient
        .from('clarity_docs')
        .update({ title: 'Updated title' })
        .eq('id', doc.id);

      expect(error, `Owner should update own doc: ${error?.message}`).toBeNull();

      const { data } = await supabaseAdmin
        .from('clarity_docs')
        .select('title')
        .eq('id', doc.id)
        .single();
      expect(data?.title).toBe('Updated title');
    } finally {
      await deleteTestDoc(doc.id);
    }
  });

  test('user CANNOT UPDATE another user doc', async () => {
    const doc = await createTestDoc(ownerId, { title: 'Not your doc' });
    try {
      const otherClient = await signInAsUser(otherEmail);

      const { error, data } = await otherClient
        .from('clarity_docs')
        .update({ title: 'Hijacked' })
        .eq('id', doc.id)
        .select('id');

      // Either error or no rows affected (RLS filters out the row)
      const noEffect = (!error && (!data || data.length === 0)) || error !== null;
      expect(noEffect, 'Non-owner update should have no effect').toBe(true);

      // Verify title unchanged
      const { data: verify } = await supabaseAdmin
        .from('clarity_docs')
        .select('title')
        .eq('id', doc.id)
        .single();
      expect(verify?.title).toBe('Not your doc');
    } finally {
      await deleteTestDoc(doc.id);
    }
  });
});

// ===========================================================================
// 9. Doc DELETE RLS — only owner can delete
// ===========================================================================

test.describe('P551: RLS — doc DELETE restricted to owner', () => {
  test('owner can DELETE their own doc', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DelOwner' });
    try {
      const doc = await createTestDoc(owner.user.id, { title: 'P551 delete test' });
      const ownerClient = await signInAsUser(ownerEmail);

      const { error } = await ownerClient
        .from('clarity_docs')
        .delete()
        .eq('id', doc.id);

      expect(error, `Owner should delete own doc: ${error?.message}`).toBeNull();

      // Verify deleted
      const { data } = await supabaseAdmin
        .from('clarity_docs')
        .select('id')
        .eq('id', doc.id)
        .single();
      expect(data, 'Doc should be deleted').toBeNull();
    } finally {
      await deleteTestUser(owner.user.id);
    }
  });

  test('non-owner CANNOT DELETE someone else doc', async () => {
    const ownerEmail = generateTestEmail();
    const owner = await createTestUser({ email: ownerEmail, name: 'P551 DelTarget' });
    const otherEmail = generateTestEmail();
    const other = await createTestUser({ email: otherEmail, name: 'P551 DelAttacker' });
    let docId: string | undefined;

    try {
      const doc = await createTestDoc(owner.user.id, { title: 'Protected doc' });
      docId = doc.id;

      const otherClient = await signInAsUser(otherEmail);
      await otherClient.from('clarity_docs').delete().eq('id', doc.id);

      // Verify doc still exists
      const { data } = await supabaseAdmin
        .from('clarity_docs')
        .select('id')
        .eq('id', doc.id)
        .single();
      expect(data?.id, 'Doc should survive non-owner delete attempt').toBe(doc.id);
    } finally {
      if (docId) await deleteTestDoc(docId);
      await deleteTestUser(owner.user.id);
      await deleteTestUser(other.user.id);
    }
  });
});
