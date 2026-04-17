/**
 * @file p684-signup-flow.spec.ts
 * @description P684: E2E tests — end-of-letter CTA redirect, signup flow, confirm, completion.
 *
 * BLOCK-3 design: rating controls always active; end-of-letter CTA redirects to /signup
 * for email signup (or Google OAuth). The response draft is stored in sessionStorage during
 * reading; the confirm page reads it on return from the magic link.
 *
 * Covers UAT-8 through UAT-15.
 *
 * Not covered (current implementation):
 * - UAT-10 (controls become active post-signup): BLOCK-3 controls always active; no unlock.
 * - UAT-11 (toast "Signed in as [Name]"): No toast in current signup flow.
 * - UAT-12 (magic link notice): Not implemented in BLOCK-3.
 *
 * Confirm flow (UAT-13+15, UAT-14) is tested by injecting an auth session via
 * setTestSession() and navigating directly to /letter/{id}/confirm. This preserves
 * sessionStorage (the response draft) written by the reading page's onComplete handler
 * without requiring a real OTP/magic-link flow (which would hit Supabase's rate limits
 * and require localhost:5200 in the redirect URL allowlist).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open the letter cover → rate the story → wait for end-of-letter CTA ("Save your responses").
 * Uses a 0-point story so the rating drawer appears immediately and the CTA is reachable
 * with a single rating + Continue interaction.
 */
async function openLetterAndRate(page: import('@playwright/test').Page, letterId: string) {
  await page.goto(`/letter/${letterId}`);
  await page.waitForLoadState('networkidle');

  const openBtn = page.getByRole('button', { name: /open.*letter/i });
  if (await openBtn.isVisible({ timeout: 8000 })) {
    await openBtn.click();
    await page.waitForLoadState('networkidle');
  }

  await expect(page.getByRole('dialog').filter({ hasText: 'Rate this story' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Rate 7' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();

  const continueBtn = page.getByRole('button', { name: /^continue$/i });
  if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.click();
  }

  await expect(page.getByRole('heading', { name: 'Save your responses' })).toBeVisible({ timeout: 10000 });
}

/**
 * Navigate to the signup page via the end-of-letter CTA's "Sign up with email" link.
 * Must be called after openLetterAndRate().
 */
async function clickSignUpWithEmail(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: /sign up with email/i }).click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/signup/, { timeout: 8000 });
}

/**
 * Fill the signup page form (Full Name + Email + TOS checkbox).
 * The page is assumed to already be at /signup.
 */
async function fillSignupForm(
  page: import('@playwright/test').Page,
  name: string,
  email: string,
) {
  await page.getByLabel('Full Name').fill(name);
  await page.getByLabel('Email Address').fill(email);
  await page.getByRole('checkbox').click();
}

function uniqueTestEmail(): string {
  return `e2e-test-p684-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@gmail.com`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('P684: Signup flow — end-of-letter gate', () => {
  test.describe.configure({ timeout: 120000 });

  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Signup Sender' });

    const story = await createTestStory(sender.user.id, {
      title: 'P684 signup flow test story',
      content: 'P684 signup flow test story content.',
    });
    storyId = story.id;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Signup Flow Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    await createTestStorySnapshot(letter.id, storyId, version.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'P684 signup flow test story',
        storyText: 'P684 signup flow test story content.',
        points: [],
      },
    });

    await sealTestLetter(letter.id);
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
  // UAT-8: Invalid email shows inline error on the signup page
  // ==========================================================================

  test('UAT-8: invalid email surfaces error on the signup page', async ({ page }) => {
    await openLetterAndRate(page, letterId);
    await clickSignUpWithEmail(page);

    await page.getByLabel('Full Name').fill('Test Reader');
    // Fill an email that passes browser type="email" validation but fails the
    // server-side regex (no TLD dot separator after the final @-segment):
    // Use JS eval to set value so React state is updated without browser validation
    await page.evaluate(() => {
      const el = document.querySelector('#signup-email') as HTMLInputElement | null;
      if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!
        .set!.call(el, 'notanemail');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('checkbox').click();

    // Dispatch form submit via JS to bypass browser's native type="email" validation popup.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const errorEl = page.getByText(/valid email|invalid email|valid email address/i);
    await expect(errorEl).toBeVisible({ timeout: 3000 });
  });

  // ==========================================================================
  // UAT-9: Signup form creates auth user
  // ==========================================================================

  test('UAT-9: signup form submission shows confirmation state', async ({ page }) => {
    // Note: Supabase creates the auth user with email_confirmed=false on signInWithOtp,
    // so the profile row (created by trigger on email_confirmed) doesn't exist yet at
    // this stage. The profile is created when the magic link is clicked (OTP verified).
    // UAT-13+15 covers the full confirm flow including DB state verification.
    await openLetterAndRate(page, letterId);
    await clickSignUpWithEmail(page);
    await fillSignupForm(page, 'New Reader', uniqueTestEmail());
    await page.getByRole('button', { name: /create account/i }).click();
    // Success state — magic link was sent.
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 15000 });
  });

  // ==========================================================================
  // UAT-13 + UAT-15: Confirm flow — identity-tagged rating + completion screen
  // ==========================================================================

  test('UAT-13 + UAT-15: confirm flow saves rating with real listener_id and shows completion screen', async ({ page }) => {
    // Create a test reader with a confirmed profile. The confirm page needs an
    // authenticated session — we inject one via setTestSession rather than going
    // through the full magic link flow (which requires PKCE and a Supabase redirect
    // URL allowlist entry for localhost:5200; tested by UAT-9 and p458 suite).
    const reader = await createTestUser({ name: 'Confirm Reader P684' });

    try {
      // 1. Rate letter as unauthenticated reader → draft stored in sessionStorage.
      await openLetterAndRate(page, letterId);

      // 2. Inject auth session. setTestSession navigates to '/' (same origin) so
      //    the sessionStorage draft written in step 1 is preserved.
      await setTestSession(page, reader.email);

      // 3. Navigate to confirm page — session active + sessionStorage draft present.
      await page.goto(`/letter/${letterId}/confirm`);
      await page.waitForLoadState('networkidle');

      // UAT-15: Completion screen text.
      await expect(page.getByText(/your responses have been shared with/i)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/you can close this tab/i)).toBeVisible();

      // UAT-15: No links that navigate away to the main app.
      const appLinks = page.getByRole('link').filter({ hasText: /explore|get started|try|open|sign up/i });
      await expect(appLinks).toHaveCount(0);

      // UAT-13: story_verifications row has real listener_id (not sentinel UUID).
      const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';
      const { data: verifications } = await supabaseAdmin
        .from('story_verifications')
        .select('listener_id, listener_rating')
        .eq('listener_id', reader.user.id)
        .eq('source', 'letter');
      expect(verifications?.length, 'story_verifications row must exist for the confirmed reader').toBeGreaterThan(0);
      for (const row of verifications ?? []) {
        expect(row.listener_id).not.toBe(SENTINEL_UUID);
        expect(row.listener_id).toBe(reader.user.id);
      }
    } finally {
      await supabaseAdmin.from('letter_deliveries').delete().eq('receiver_profile_id', reader.user.id);
      await supabaseAdmin.from('story_verifications').delete().eq('listener_id', reader.user.id);
      await deleteTestUser(reader.user.id);
    }
  });

  // ==========================================================================
  // UAT-14: Existing email links delivery to existing profile (no duplicate user)
  // ==========================================================================

  test('UAT-14: existing user email links delivery to their existing profile', async ({ page }) => {
    // Uses setTestSession (same approach as UAT-13+15) to avoid PKCE/redirect-URL
    // constraints. The key assertion is delivery linking, not the auth flow.
    const existingUser = await createTestUser({ name: 'Existing P684 Reader' });

    try {
      // Rate letter, inject existing user's session, confirm.
      await openLetterAndRate(page, letterId);
      await setTestSession(page, existingUser.email);
      await page.goto(`/letter/${letterId}/confirm`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/your responses have been shared with/i)).toBeVisible({ timeout: 20000 });

      // Delivery must be linked to the EXISTING profile, not a new one.
      const { data: delivery } = await supabaseAdmin
        .from('letter_deliveries')
        .select('receiver_profile_id, receiver_email')
        .eq('letter_id', letterId)
        .eq('receiver_profile_id', existingUser.user.id)
        .maybeSingle();
      expect(delivery, 'Delivery must link to existing profile').not.toBeNull();
      expect(delivery!.receiver_email).toBe(existingUser.email);

      // No duplicate profiles created — exactly one profile for this email.
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', existingUser.email);
      expect(profiles?.length, 'Only one profile may exist for this email').toBe(1);
    } finally {
      await supabaseAdmin
        .from('letter_deliveries')
        .delete()
        .eq('letter_id', letterId)
        .eq('receiver_profile_id', existingUser.user.id);

      await deleteTestUser(existingUser.user.id);
    }
  });
});
