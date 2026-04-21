/**
 * @file p782-authed-reader-name.spec.ts
 *
 * P782 canary — authenticated non-sender opening a public one-to-many letter
 * should see "For {first-name}" on the cover, not "For you".
 *
 * Root cause: letter-reading-page.tsx was reading currentUser.user_metadata?.name
 * but useAuth() returns a Profile (not a Supabase auth user). Profile has name
 * at the top level; user_metadata does not exist on it.
 *
 * Fix: read currentUser.name directly (three sites fixed).
 */

import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
  type TestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';

async function makePublicDoc(ownerId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title: 'P782 Test Doc', visibility: 'public' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Doc creation failed: ${error?.message}`);
  return data.id;
}

async function deleteDoc(docId: string): Promise<void> {
  await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
}

test.describe('P782: authed reader sees first name on public letter cover', () => {
  test.setTimeout(60_000);

  let sender: TestUser;
  let reader: TestUser;
  let letter: TestLetter;
  let docId: string;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P782 Sender' });
    reader = await createTestUser({ name: 'Vyacheslav Tester' });

    docId = await makePublicDoc(sender.user.id);

    const story = await createTestStory(sender.user.id, {
      title: 'P782 Story',
      content: 'Test content for P782.',
    });
    storyId = story.id;

    // Fetch the auto-created story_versions row (DB trigger fires on story INSERT)
    const { data: version, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('version_number', { ascending: true })
      .limit(1)
      .single();
    if (versionError || !version) throw new Error(`Failed to fetch story version: ${versionError?.message}`);

    letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });

    await createTestStorySnapshot(letter.id, storyId, version.id, {
      position: 0,
      pointConfig: { storyTitle: 'P782 Story', storyText: 'Test content for P782.', points: [] },
    });

    await sealTestLetter(letter.id);
    letter.status = 'sealed';
  });

  test.afterAll(async () => {
    if (letter) await deleteTestLetter(letter.id).catch(() => {});
    if (docId) await deleteDoc(docId).catch(() => {});
    if (storyId) await deleteTestStory(storyId).catch(() => {});
    if (reader) await deleteTestUser(reader.user.id).catch(() => {});
    if (sender) await deleteTestUser(sender.user.id).catch(() => {});
  });

  test('P782 canary: public letter cover shows reader first name when authed non-sender opens it', async ({
    page,
  }: { page: Page }) => {
    // Authenticate as reader (not sender — must be a non-sender)
    await setTestSession(page, reader.email);

    // Navigate using letter ID (one-to-many public path)
    await page.goto(`/letter/${letter.id}`);

    // Wait for cover to render (loader disappears)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    // CANARY: cover shows reader first name, not "you"
    // "Vyacheslav Tester" → first name is "Vyacheslav"
    await expect(page.getByRole('heading', { level: 1 })).toContainText('For Vyacheslav');
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText('For you');
  });

  test('P782 regression: anon reader still sees "For you"', async ({ page }: { page: Page }) => {
    // No session — anon path
    await page.goto(`/letter/${letter.id}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('For you');
  });
});
