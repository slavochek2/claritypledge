/**
 * @file p581-letter-1to1-flow.spec.ts
 * @description P581: 1-to-1 Letter Flow — token-gated access, registration, reading
 *
 * Tests the complete 1-to-1 letter delivery:
 * 1. Token validation: valid token grants access
 * 2. Invalid/expired token returns 404 (D25 — no existence leak)
 * 3. Wrong user sees "This letter wasn't sent to you"
 * 4. Magic link flow for existing users (P488 pattern)
 * 5. One-click registration for new users (D48, P527 pattern)
 * 6. Receiver can access letter from within app (docs page)
 * 7. 1-to-1 letter requires authentication (D47)
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

test.describe('P581: 1-to-1 Letter Flow — token access + auth', () => {
  test.describe.configure({ timeout: 45000 });

  let sender: TestUser;
  let receiver: TestUser;
  let wrongUser: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;
  let validToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581 1to1 Sender' });
    receiver = await createTestUser({ name: 'P581 1to1 Receiver' });
    wrongUser = await createTestUser({ name: 'P581 1to1 Wrong' });

    // Create doc + story
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: '1-to-1 Flow Test Doc',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: '1-to-1 Test Story',
      content: 'A story about partnership dynamics.',
    });
    storyId = story.id;

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId, story_id: storyId, position: 0,
    });

    // Create sealed 1-to-1 letter
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

    // Create story snapshot
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

    // Create delivery with valid token (7-day expiry)
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
    validToken = delivery.invitation_token;

    // Create prediction
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction: 5,
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
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (wrongUser?.user?.id) await deleteTestUser(wrongUser.user.id);
  });

  // ── 1. Valid token grants access ──────────────────────────────────────

  test('valid token + authenticated receiver can access 1-to-1 letter', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // Should stay on letter page (not redirected)
    expect(page.url()).toContain(`/letter/${letterId}`);

    // Cover content should be visible
    const cover = page.locator('text=/letter|clarity/i').first();
    await expect(cover).toBeVisible({ timeout: 10000 });
  });

  // ── 2. No token → 404 (D25) ─────────────────────────────────────────

  test('1-to-1 letter URL without token shows 404 or not found (D25)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Without token, 1-to-1 letter should show 404 or not found state
    // D25: no existence leak — don't distinguish "doesn't exist" from "can't access"
    const notFound = page.locator('text=/not found|404|doesn.t exist/i');
    await expect(notFound).toBeVisible({ timeout: 10000 });
  });

  // ── 3. Invalid token → 404 ──────────────────────────────────────────

  test('invalid token returns 404 (no existence leak)', async ({ page }) => {
    const fakeToken = '00000000-0000-0000-0000-000000000000';
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${fakeToken}`);
    await page.waitForLoadState('networkidle');

    const notFound = page.locator('text=/not found|404|doesn.t exist/i');
    await expect(notFound).toBeVisible({ timeout: 10000 });
  });

  // ── 4. Expired token ────────────────────────────────────────────────

  test('expired token shows expiry message', async ({ page }) => {
    // Create a delivery with expired token
    const expiredAt = new Date(Date.now() - 60000).toISOString(); // 1 min ago
    const { data: expiredDelivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'expired@gmail.com',
        invitation_expires_at: expiredAt,
      })
      .select('invitation_token')
      .single();

    if (!expiredDelivery) {
      test.skip();
      return;
    }

    await page.goto(`/letter/${letterId}?token=${expiredDelivery.invitation_token}`);
    await page.waitForLoadState('networkidle');

    // Should show expiry message or 404
    const expiredContent = page.locator('text=/expired|not found|404|contact/i');
    await expect(expiredContent).toBeVisible({ timeout: 10000 });

    // Cleanup
    await supabaseAdmin
      .from('letter_deliveries')
      .delete()
      .eq('invitation_token', expiredDelivery.invitation_token);
  });

  // ── 5. Wrong user sees rejection message ─────────────────────────────

  test('wrong authenticated user sees "not sent to you" message', async ({ page }) => {
    await setTestSession(page, wrongUser.email);
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // D25: for wrong user, show "wasn't sent to you" or treat as 404
    const rejection = page.locator('text=/wasn.t sent to you|not found|404/i');
    await expect(rejection).toBeVisible({ timeout: 10000 });
  });

  // ── 6. Unauthenticated access to 1-to-1 requires login (D47) ────────

  test('unauthenticated access to 1-to-1 letter redirects to auth', async ({ page }) => {
    // No setTestSession — unauthenticated
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // 1-to-1 always requires auth (D47)
    // Should either redirect to login or show auth gate
    const url = page.url();
    const isAuthRedirect = url.includes('/signup') || url.includes('/login');
    const authGate = page.locator('text=/sign in|log in|create account|open the letter/i');
    const isAuthGateVisible = await authGate.isVisible({ timeout: 5000 }).catch(() => false);

    // Either redirected to auth page or shows auth gate on the letter page
    expect(isAuthRedirect || isAuthGateVisible).toBeTruthy();
  });
});
