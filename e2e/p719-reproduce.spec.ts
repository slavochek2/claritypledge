/**
 * @file p719-reproduce.spec.ts
 * @description P719 Regression test: signup after completing a public letter
 * with a stale session must return 200 and show "Check your email".
 *
 * Background: anonymous user (with stale auth cookies) completes a one-to-many
 * letter, reaches the signup form, fills in name+email, submits. The bug
 * produced "Invalid request. Please check your input and try again." (400).
 * The Supabase client cleans up stale sessions (SIGNED_OUT) before the form
 * submission, so the 400 could not be reproduced in Playwright. Diagnostic
 * logging was added to the edge function to identify the failing check on the
 * next prod occurrence (see [P719-DIAG] codes in index.ts).
 *
 * This test verifies the happy path and guards against regression:
 * 1. Create a sealed one-to-many letter with a story + point
 * 2. Inject a stale session (expired access token, invalid refresh token)
 * 3. Navigate to the letter, complete reading flow
 * 4. Land on signup page, fill form, submit
 * 5. Assert: edge function returns 200 { ok: true }, "Check your email" visible
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
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique test email that won't collide across runs */
function uniqueTestEmail(): string {
  return `e2e-p719-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.claritypledge.com`;
}

/**
 * Inject a stale/expired Supabase session into localStorage.
 * The session has a real user ID but an expired access token and a garbage
 * refresh token. This simulates a user who logged in previously but whose
 * session expired — the cookies/localStorage still hold the old session data.
 */
async function injectStaleSession(
  page: import('@playwright/test').Page,
  userId: string,
  email: string,
) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;

  // Expired access token: real user ID but expires_at in the past.
  // The refresh_token is garbage — refresh will fail, triggering SIGNED_OUT.
  const staleSession = JSON.stringify({
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.stale-token-for-testing', // gitleaks:allow
    refresh_token: 'invalid-refresh-token-for-p719-testing',
    expires_at: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    expires_in: -3600,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      created_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name: 'Stale Session User' },
      aud: 'authenticated',
      role: 'authenticated',
    },
  });

  await page.context().addInitScript(
    ({ key, value }) => { localStorage.setItem(key, value); },
    { key: storageKey, value: staleSession },
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('P719: Signup 400 error with stale session after public letter', () => {
  test.describe.configure({ timeout: 120000 });

  let sender: TestUser;
  let storyId: string;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P719 Sender' });

    // Create a 0-point story (simplest reading flow: story-rate → story-revealed → transition)
    const story = await createTestStory(sender.user.id, {
      title: 'P719 test story',
      content: 'A test story for P719 reproduce.',
    });
    storyId = story.id;

    // Create doc + doc_stories link
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P719 Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    // Create one-to-many letter
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    // Get latest story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    // Create snapshot (0 points — simplest flow)
    await createTestStorySnapshot(letter.id, storyId, version.id, {
      position: 0,
      pointConfig: {
        storyTitle: 'P719 test story',
        storyText: 'A test story for P719 reproduce.',
        points: [],
      },
    });

    await sealTestLetter(letter.id);
  });

  test.afterAll(async () => {
    // Clean up test data created by the edge function (auth users, pending rows)
    if (letterId) {
      const { data: pendingRows } = await supabaseAdmin
        .from('letter_response_pending')
        .select('user_id')
        .eq('letter_id', letterId);
      for (const row of pendingRows ?? []) {
        await supabaseAdmin.from('letter_response_pending').delete().eq('user_id', row.user_id);
        await supabaseAdmin.from('profiles').delete().eq('id', row.user_id);
        await supabaseAdmin.auth.admin.deleteUser(row.user_id);
      }
      await deleteTestLetter(letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  // ==========================================================================
  // P719 regression: stale session → complete letter → signup → 200 success
  // ==========================================================================

  test('stale session does not produce 400 "Invalid request" on signup form submit', async ({ page }) => {
    // Inject a stale session — expired access token, invalid refresh token.
    // This simulates a user returning with stale cookies from a previous session.
    await injectStaleSession(page, sender.user.id, sender.email);

    // Navigate to the public letter.
    // With stale session, the Supabase client detects the expired token,
    // attempts refresh (fails with invalid refresh_token), fires SIGNED_OUT.
    // The page eventually treats the user as anonymous.
    await page.goto(`/letter/${letterId}`);
    await page.waitForLoadState('networkidle');

    // Open the letter cover
    const openBtn = page.getByRole('button', { name: /open.*letter/i });
    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await openBtn.click();
    await page.waitForLoadState('networkidle');

    // Rate the story (0-point story: story-rate is first phase).
    // The rating UI is a FixedBottomBar with ComprehensionRatingCard, not a dialog.
    // Buttons have aria-label="Rate N".
    const rateBtn = page.getByRole('button', { name: 'Rate 7' });
    await expect(rateBtn).toBeVisible({ timeout: 15000 });
    await rateBtn.click();
    await page.getByRole('button', { name: 'Submit' }).click();

    // Continue past story reveal / transition
    const continueBtn = page.getByRole('button', { name: /^continue$/i });
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click();
    }

    // After rating + continue, the app navigates directly to /signup with the
    // "Save your responses" form (no intermediate CTA page).
    await expect(
      page.getByRole('heading', { name: /save your responses/i }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/signup/, { timeout: 8000 });

    // Verify the URL has the letter-response source param
    const url = new URL(page.url());
    expect(url.searchParams.get('source')).toBe('letter-response');
    expect(url.searchParams.get('letterId')).toBeTruthy();

    // Fill in the signup form
    const testEmail = uniqueTestEmail();
    await page.getByLabel('Full Name').fill('P719 Test Reader');
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByRole('checkbox').click();

    // Monitor network for the edge function call
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('request-letter-response-signin'),
      { timeout: 15000 },
    );

    // Submit the form — button is "Save my responses" on the letter-response signup
    await page.getByRole('button', { name: /save my responses/i }).click();

    // Wait for the edge function response
    const response = await responsePromise;
    const status = response.status();
    const body = await response.json().catch(() => ({}));

    // Regression guard: edge function must return 200 { ok: true }.
    // If 400 appears here, check Supabase edge function logs for [P719-DIAG] codes
    // to identify which validation check failed.
    expect(status, `Edge function returned ${status}: ${JSON.stringify(body)}`).toBe(200);

    // Confirm the success UI appears
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10000 });

    // Verify NO error banner is visible
    const errorBanner = page.getByText(/invalid request/i);
    await expect(errorBanner).not.toBeVisible();
  });
});
