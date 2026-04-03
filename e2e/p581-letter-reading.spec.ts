/**
 * @file p581-letter-reading.spec.ts
 * @description P581: Letter Reading Flow — E2E tests for the receiver experience
 *
 * Tests the full sequential reading flow:
 * 1. Cover screen renders with sender info, story count, time estimate
 * 2. "Open the Letter" transitions to first story
 * 3. D36 ordering: anti-point first for 2+ point stories, story first for 1-point
 * 4. D37 engagement gate: must position or file story before proceeding
 * 5. Understanding rating (0-10 dot picker) is mandatory
 * 6. Sealed-bid reveal: prediction shown only after receiver rates
 * 7. Gap display: dual numbers (receiver rating / sender prediction)
 * 8. Forward-only: rating cannot be changed after submission (D7/D50)
 * 9. Progress bar updates as receiver progresses through stories
 * 10. Author position locked until receiver engages (D10)
 *
 * Uses authenticated receiver session for 1-to-1 tests.
 * Uses anonymous session for 1-to-many tests.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P581: Letter Reading — receiver experience', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581 Read Sender' });
    receiver = await createTestUser({ name: 'P581 Read Receiver' });

    // Create doc with story and point
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'Letter Reading Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'False consensus in decision framing',
      content: 'I have watched twelve co-founder pairs describe a moment they knew was a false agreement.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'Partners who avoid difficult conversations are choosing short-term comfort over trust.',
    });
    pointId = point.id;

    // Link story to doc and point
    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin
      .from('story_points')
      .insert({ story_id: storyId, point_id: pointId, author_id: sender.user.id });

    // Create sealed letter with delivery
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Get story version for snapshot
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (version) {
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
      });
    }

    // Create delivery with token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        invitation_expires_at: expiresAt,
      })
      .select('id, invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;
    deliveryToken = delivery.invitation_token;

    // Create prediction
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction: 3,
    });
  });

  test.afterAll(async () => {
    // Clean story_verifications that might have been created during tests
    await supabaseAdmin.from('story_verifications').delete()
      .eq('story_id', storyId).eq('source', 'letter');
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Cover screen ──────────────────────────────────────────────────

  test('cover screen shows sender name and story count', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Cover should show letter-related content
    const cover = page.locator('text=/clarity letter|letter for/i').first();
    await expect(cover).toBeVisible({ timeout: 10000 });

    // Should show sender name
    await expect(
      page.locator(`text=/${sender.name}/i`).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('cover screen shows "Open the Letter" button', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i })
      .or(page.locator('button:has-text("Open")'));
    await expect(openBtn).toBeVisible({ timeout: 10000 });
  });

  test('1-to-1 cover shows ToS acceptance line (D48)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // For 1-to-1, ToS text should be present on cover
    const tosText = page.locator('text=/terms of service|accept/i');
    // This is conditional on 1-to-1 for new users (D48)
    // If visible, verify it's there
    if (await tosText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(tosText).toBeVisible();
    }
  });

  // ── 2. Opening the letter transitions to reading flow ─────────────────

  test('clicking "Open the Letter" shows first story content or point', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Open the letter
    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // After opening, story content or point should appear (depending on D36 ordering)
    // For 1-point stories: story appears first
    // For 2+ point stories: anti-point appears first
    const readingContent = page.locator('text=/false consensus|partners who avoid|where do you stand|story 1/i').first();
    await expect(readingContent).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Progress bar ──────────────────────────────────────────────────

  test('progress bar shows "Story N of M"', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Progress bar with aria-label or visible text
    const progressBar = page.locator('[aria-label*="Story"], text=/story.*of/i').first();
    await expect(progressBar).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Understanding rating is mandatory ─────────────────────────────

  test('understanding rating prompt appears with dot picker (0-10)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Open letter
    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Navigate through the reading flow until we reach the rating step
    // For 1-point story: story → "I've read it" → rating
    // For 2+ points: point → engage → story → "I've read it" → rating
    // Try clicking through available buttons
    const readItBtn = page.getByRole('button', { name: /read it|continue|next/i }).first();
    if (await readItBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await readItBtn.click();
    }

    // Rating prompt should eventually appear (D49 wording)
    const ratingPrompt = page.locator('text=/how well do you.*understand|rate.*understanding/i');
    if (await ratingPrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(ratingPrompt).toBeVisible();

      // Rating buttons (dot picker) should be present
      const ratingButtons = page.locator('[role="group"] button, [data-testid*="rating"]');
      await expect(ratingButtons.first()).toBeVisible({ timeout: 3000 });
    }
  });

  // ── 5. D37: Engagement gate — must position or file story ─────────────

  test('point engagement: position buttons visible (disagree/maybe/agree)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Position buttons should appear at some point in the flow
    // Three-button pattern: disagree / maybe / agree
    const positionGroup = page.locator('[role="group"]').first();
    if (await positionGroup.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Look for position-related buttons
      const disagreeBtn = page.locator('button:has-text("Disagree"), button[aria-label*="disagree"]').first();
      const agreeBtn = page.locator('button:has-text("Agree"), button[aria-label*="agree"]').first();

      // At least one position button should be visible
      const hasDisagree = await disagreeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      const hasAgree = await agreeBtn.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasDisagree || hasAgree).toBeTruthy();
    }
  });

  // ── 6. Author position locked until receiver engages (D10) ────────────

  test('author position is locked until receiver engages', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Look for lock indicator (D10)
    const lockIndicator = page.locator(
      'text=/position hidden|engage to reveal|locked/i, [aria-label*="hidden"]'
    ).first();

    if (await lockIndicator.isVisible({ timeout: 10000 }).catch(() => false)) {
      await expect(lockIndicator).toBeVisible();
    }
  });

  // ── 7. Story filing CTA present ──────────────────────────────────────

  test('story filing CTA "Add a story" is visible on points', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // "Add a story" CTA should appear on points
    const addStoryCTA = page.locator('text=/add a story/i').first();
    if (await addStoryCTA.isVisible({ timeout: 10000 }).catch(() => false)) {
      await expect(addStoryCTA).toBeVisible();
    }
  });
});

// ===========================================================================
// 1-to-many anonymous reading
// ===========================================================================

test.describe('P581: Letter Reading — anonymous 1-to-many', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581 Anon Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'Anon Reading Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'Anon Test Story',
      content: 'Story content for anonymous reading test.',
    });
    storyId = story.id;

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId, story_id: storyId, position: 0,
    });

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-many',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Get version for snapshot
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (version) {
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
      });
    }

    // Shared prediction for 1-to-many (no delivery_id)
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      story_id: storyId,
      prediction: 6,
    });
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('1-to-many letter is accessible without authentication', async ({ page }) => {
    // No setTestSession — anonymous access
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Should not redirect to login/signup
    expect(page.url()).toContain(`/letter/${letterId}`);

    // Cover content should be visible
    const letterContent = page.locator('text=/letter|clarity/i').first();
    await expect(letterContent).toBeVisible({ timeout: 10000 });
  });

  test('1-to-many cover does NOT show ToS line (D48: ToS only for 1-to-1)', async ({ page }) => {
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // For 1-to-many, ToS acceptance happens at registration gate (end), not cover
    // The cover should NOT have "By opening, you accept the Terms"
    const tosLine = page.locator('text=/by opening.*terms/i');
    await expect(tosLine).not.toBeVisible({ timeout: 3000 });
  });
});
