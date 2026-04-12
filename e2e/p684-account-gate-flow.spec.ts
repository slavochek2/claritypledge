/**
 * @file p684-account-gate-flow.spec.ts
 * @description P684: E2E tests — browse-only flow for one-to-many letters.
 *
 * Design (BLOCK-3): all rating controls are fully interactive during reading;
 * signup form appears only at the END of the letter after all stories are read.
 * No muted controls, no mid-reading prompts.
 *
 * Covers:
 * - Browse-only: reader sees story content without signing in
 * - Browse-only: zero DB footprint (no letter_deliveries, no story_verifications)
 *
 * Not covered here:
 * - Form validation, button states, aria-describedby → see e2e/a11y/p684-accessibility.spec.ts
 * - RPC auth guards, zero delivery rows at RPC level → see e2e/integration/p684-rpc-auth-guards.spec.ts
 * - Magic link flow, terms_acceptances creation → requires Mailgun; UAT only
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

async function buildPublicLetter(senderId: string, storyId: string, versionId: string, docId: string) {
  const letter = await createTestLetter(senderId, docId, { mode: 'one-to-many' });
  await createTestStorySnapshot(letter.id, storyId, versionId, {
    position: 0,
    pointConfig: {
      storyTitle: 'P684 browse test story',
      storyText: 'This is a story used to test anonymous browsing without signup.',
      points: [],
    },
  });
  await sealTestLetter(letter.id);
  return letter;
}

// ---------------------------------------------------------------------------
// Browse-only flow
// ---------------------------------------------------------------------------

test.describe('P684: Browse-only flow — zero DB footprint', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let storyId: string;
  let letterId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Browse Sender' });

    const story = await createTestStory(sender.user.id, {
      title: 'P684 browse test story',
      content: 'This is a story used to test anonymous browsing without signup.',
    });
    storyId = story.id;

    // Real clarity_docs row required by FK on clarity_letters.source_doc_id
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Browse Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    // Real story_versions.id required by FK on letter_story_snapshots.version_id
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const letter = await buildPublicLetter(sender.user.id, storyId, version.id, docId);
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  // ==========================================================================
  // 1. Story content visible without signin
  // ==========================================================================

  test('anonymous reader sees story content without needing to sign in', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open.*letter/i });
    if (await openBtn.isVisible({ timeout: 8000 })) {
      await openBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // LiveStoryCardExpanded renders story.content (not title)
    await expect(
      page.getByText('This is a story used to test anonymous browsing without signup.')
    ).toBeVisible({ timeout: 10000 });
  });

  // ==========================================================================
  // 2. Zero delivery rows for browse-only reader
  // ==========================================================================

  test('browse-only reader leaves zero delivery rows in DB', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open.*letter/i });
    if (await openBtn.isVisible({ timeout: 5000 })) {
      await openBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Browse for a moment — scroll, look at content without interacting with rating
    await page.waitForTimeout(1500);

    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);

    expect(data?.length ?? 0).toBe(0);
  });

  // ==========================================================================
  // 3. Zero story_verifications rows for browse-only reader
  // ==========================================================================

  test('browse-only reader leaves zero story_verifications rows in DB', async () => {
    const { data } = await supabaseAdmin
      .from('story_verifications')
      .select('id')
      .eq('story_id', storyId)
      .eq('source', 'letter');

    expect(data?.length ?? 0).toBe(0);
  });
});
