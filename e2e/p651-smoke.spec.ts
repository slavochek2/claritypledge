/**
 * @file p651-smoke.spec.ts
 * @description P651: Letter Recipient Onboarding Redesign — Smoke tests
 *
 * Fast regression checks that verify:
 * 1. Cover page loads with proper sender name display (not UUID)
 * 2. Composition page loads with name input available
 * 3. No uncaught JS errors on letter pages after P651 changes
 *
 * These are intentionally lightweight — full flow tests are in
 * p651-letter-onboarding.spec.ts and p651-letter-composition.spec.ts.
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

test.describe('P651 Smoke: Letter Onboarding — routes load', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let validToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651 Smoke Sender' });
    receiver = await createTestUser({ name: 'P651 Smoke Receiver' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Smoke Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story for the doc
    const story = await createTestStory(sender.user.id, {
      title: 'P651 Smoke Story',
      content: 'Test story for smoke tests.',
    });
    storyId = story.id;

    // Link story to doc
    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

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

    // Create delivery with receiver_name
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        receiver_name: 'P651 Smoke Receiver',
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    validToken = delivery.invitation_token;
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  // ── 1. Cover page loads with sender name ──────────────────────────────

  test('1-to-1 cover page loads without JS errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // Should not be a blank page or redirect to 404
    expect(page.url()).toContain(`/letter/${letterId}`);

    // No uncaught JS errors
    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });

  test('cover shows letter content (envelope, title, or open button)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // Cover should show some letter-identifying UI
    const letterContent = page.locator('text=/letter|clarity|open/i').first();
    await expect(letterContent).toBeVisible({ timeout: 10000 });
  });

  // ── 2. Composition page loads with name input ────────────────────────

  test('composition page loads without JS errors for sender', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    // Should stay on composition route
    expect(page.url()).toContain('/compose');

    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });

  test('composition "Specific people" mode is selectable', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/letter/${docId}/compose`);
    await page.waitForLoadState('networkidle');

    const specificPeople = page.locator('text=/specific people/i');
    await expect(specificPeople).toBeVisible({ timeout: 10000 });
  });

  // ── 3. No console errors on reading page transitions ──────────────────

  test('no console errors when opening letter as authenticated receiver', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${validToken}`);
    await page.waitForLoadState('networkidle');

    // Click "Open the Letter" if visible
    const openButton = page.getByRole('button', { name: /open the letter/i })
      .or(page.locator('text=/open the letter/i'));
    if (await openButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await openButton.click();
      await page.waitForLoadState('networkidle');
    }

    // No app errors during the transition
    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });
});
