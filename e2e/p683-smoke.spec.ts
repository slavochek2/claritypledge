/**
 * @file p683-smoke.spec.ts
 * @description P683: One-to-One Letter TOS Consent — Smoke tests
 *
 * Fast regression checks:
 * 1. Letter cover page loads without JS errors
 * 2. Letter cover page has no navigation chrome (chromeFree layout)
 * 3. Letter preview page loads for authenticated sender
 * 4. Non-existent letter token does not crash
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P683 Smoke: TOS Consent — routes load', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P683 Smoke Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P683 Smoke Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P683 Smoke Story',
      content: 'Smoke test story content.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: 'smoke-receiver@example.com',
    });
    invitationToken = delivery.invitationToken;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');
    await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: version.id,
      position: 0,
      visibility: 'public',
      point_config: { storyText: 'test', storyTitle: 'P683 Smoke Story', points: [] },
    });

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 1. Letter cover page loads ─────────────────────────────────────────────

  test('letter cover page renders without JS errors (unauthenticated)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto(`/letter/${letterId}?token=${invitationToken}`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain(`/letter/${letterId}`);

    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });

  // ── 2. No navigation chrome ────────────────────────────────────────────────

  test('letter cover page has no navigation chrome (chromeFree)', async ({ page }) => {
    await page.goto(`/letter/${letterId}?token=${invitationToken}`);
    await page.waitForLoadState('networkidle');

    // No SimpleNavigation / BottomNav present
    const bottomNav = page.locator('[data-testid="bottom-nav"]').or(
      page.locator('nav[aria-label*="navigation" i]')
    );
    await expect(bottomNav).toHaveCount(0);
  });

  // ── 3. Preview page loads for authenticated sender ─────────────────────────

  test('letter preview page loads for authenticated sender', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/preview`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/preview');

    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });

  // ── 4. Non-existent token does not crash ───────────────────────────────────

  test('non-existent letter token shows error state without JS crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/letter/00000000-0000-0000-0000-000000000000?token=invalid-token');
    await page.waitForLoadState('networkidle');

    expect(jsErrors).toHaveLength(0);
  });
});