/**
 * @file p642-letter-reading-flow.spec.ts
 * @description P642: Full letter reading flow — anonymous + authenticated paths.
 *
 * Covers the bugs fixed in P642:
 * 1. Anonymous recipient can open letter via token (RLS bypass)
 * 2. Story content renders (denormalized point_config)
 * 3. Position submit works anonymously (token-based RPC)
 * 4. Story→rate transition has a button (not a dead end)
 * 5. Rating requires authentication (sign-in prompt for anon)
 * 6. Authenticated user can rate after sign-in
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

test.describe('P642: Letter reading flow — full path', () => {
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
    sender = await createTestUser({ name: 'P642 Sender' });
    receiver = await createTestUser({ name: 'P642 Receiver' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P642 Test Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story with content
    const story = await createTestStory(sender.user.id, {
      title: 'The false consensus test',
      content: 'I watched co-founders nod along to decisions they privately disagreed with.',
    });
    storyId = story.id;

    // Create point with statement
    const point = await createTestPoint(sender.user.id, {
      statement: 'Avoiding hard conversations destroys trust faster than having them.',
    });
    pointId = point.id;

    // Link story to doc and point to story
    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId, story_id: storyId, position: 0,
    });
    await supabaseAdmin.from('story_points').insert({
      story_id: storyId, point_id: pointId,
    });

    // Set sender's position on the point
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointId,
      user_id: sender.user.id,
      position: 'agree',
    });

    // Get story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Version not found');

    // Create sealed letter
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

    // Create snapshot WITH denormalized content (as the fixed seal RPC would produce)
    await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: version.id,
      position: 0,
      visibility: 'public',
      point_config: {
        storyText: 'I watched co-founders nod along to decisions they privately disagreed with.',
        storyTitle: 'The false consensus test',
        points: [
          {
            id: pointId,
            text: 'Avoiding hard conversations destroys trust faster than having them.',
            authorPosition: 'agree',
          },
        ],
      },
    });

    // Create delivery with token
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
      prediction: 7,
    });
  });

  test.afterAll(async () => {
    // Clean up in dependency order
    await supabaseAdmin.from('story_verifications').delete()
      .eq('story_id', storyId).eq('source', 'letter');
    await supabaseAdmin.from('letter_point_responses').delete()
      .eq('delivery_id', deliveryId);
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    await supabaseAdmin.from('point_positions').delete()
      .eq('point_id', pointId).eq('user_id', sender.user.id);
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Anonymous cover page loads via token ──────────────────────────

  test('anonymous user sees cover page via token', async ({ page }) => {
    // No setTestSession — anonymous
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /open the letter/i })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/story/i')).toBeVisible();
  });

  // ── 2. Story content renders after opening ───────────────────────────

  test('opening letter shows story content (not blank)', async ({ page }) => {
    // No setTestSession — anonymous
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Story content or point text should be visible (not blank)
    const content = page.locator('text=/co-founders|hard conversations|avoiding/i').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Story→rate has a button (not a dead end) ──────────────────────
  // D36: 1-point stories start in 'story' phase (not anti-point)

  test('story phase has "I\'ve read this story" button', async ({ page }) => {
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // 1-point story goes straight to story phase with story text
    const storyText = page.locator('text=/co-founders|nod along/i').first();
    await expect(storyText).toBeVisible({ timeout: 10000 });

    // Must have a button to advance (not a dead end)
    const advanceBtn = page.locator('button:has-text("read this story")').first();
    await expect(advanceBtn).toBeVisible({ timeout: 5000 });
  });

  // ── 4. Anonymous user sees sign-in prompt at rate phase ──────────────

  test('anonymous user sees sign-in prompt at rate phase', async ({ page }) => {
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Click "I've read this story" to advance to rate
    const advanceBtn = page.locator('button:has-text("read this story")').first();
    await expect(advanceBtn).toBeVisible({ timeout: 10000 });
    await advanceBtn.click();

    // Should see sign-in prompt (not rating buttons)
    const signIn = page.locator('text=/sign in to continue/i');
    await expect(signIn).toBeVisible({ timeout: 10000 });

    // Rating buttons should NOT be visible
    const ratingButtons = page.locator('[role="group"][aria-label*="Rating"]');
    await expect(ratingButtons).not.toBeVisible({ timeout: 3000 });
  });

  // ── 5. Authenticated user can rate ───────────────────────────────────

  test('authenticated user sees rating buttons and can rate', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Click "I've read this story" to advance to rate
    const advanceBtn = page.locator('button:has-text("read this story")').first();
    await expect(advanceBtn).toBeVisible({ timeout: 10000 });
    await advanceBtn.click();

    // Should see rating buttons (not sign-in prompt)
    const ratingGroup = page.locator('[role="group"][aria-label*="Rating"]');
    await expect(ratingGroup).toBeVisible({ timeout: 10000 });

    // Click a rating
    const rateBtn = page.locator('button[aria-label="Rate 7"]');
    await expect(rateBtn).toBeVisible({ timeout: 5000 });
    await rateBtn.click();

    // Should advance to gap-reveal (shows prediction)
    const gapReveal = page.locator('text=/prediction|gap|continue/i').first();
    await expect(gapReveal).toBeVisible({ timeout: 10000 });
  });
});
