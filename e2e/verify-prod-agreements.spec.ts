/**
 * One-off prod verification: Agreement creation flow works with real DB.
 * Uses the persistent e2e-agent@claritypledge.com test account on prod.
 *
 * Run: VERIFY_PROD=1 PROD_SUPABASE_URL="<url>" PROD_SUPABASE_ANON_KEY="<key>" PROD_SERVICE_ROLE_KEY="<srk>" npx playwright test e2e/verify-prod-agreements.spec.ts
 *
 * PROD_SUPABASE_URL has no default — it must be passed explicitly on every run.
 * A hardcoded prod fallback here would let the repo's shared e2e test password
 * silently authenticate against production if this file were ever run without
 * thinking about the target (see .private/docs/security-log.md, 2026-08-08).
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY!;
const TEST_EMAIL = 'e2e-agent@claritypledge.com';
const TEST_PASSWORD = 'test-password-12345';

test.skip(!process.env.VERIFY_PROD, 'Set VERIFY_PROD=1 to run prod verification');
test.skip(!!process.env.VERIFY_PROD && !PROD_URL, 'Set PROD_SUPABASE_URL explicitly — no default target');

test('agreement creation persists to prod DB', async ({ browser }) => {
  // Step 1: Sign in to get a valid session
  const supabase = createClient(PROD_URL!, PROD_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  expect(signInError).toBeNull();
  expect(signInData?.session).toBeTruthy();

  const { access_token, refresh_token } = signInData!.session!;
  const projectRef = PROD_URL!.split('//')[1].split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  const sessionPayload = JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: signInData!.user!.id,
      email: signInData!.user!.email,
      created_at: signInData!.user!.created_at,
      app_metadata: signInData!.user!.app_metadata,
      user_metadata: signInData!.user!.user_metadata,
      aud: 'authenticated',
      role: 'authenticated',
    },
  });

  // Step 2: Create browser context with injected auth
  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: storageKey, value: sessionPayload },
  );

  const page = await context.newPage();

  // Step 3: Navigate to agreement creation page on PROD
  await page.goto('https://claritypledge.com/agreements/new');
  await page.waitForLoadState('networkidle');

  // Should see the certificate form (not a login redirect)
  const partnerNameInput = page.getByPlaceholder('Full name of your partner');
  await expect(partnerNameInput).toBeVisible({ timeout: 10000 });

  // Step 4: Fill in agreement
  await partnerNameInput.fill('Prod Verification Partner');

  const emailInput = page.getByPlaceholder('email@example.com');
  await emailInput.fill('prodtest-verification@gmail.com');

  // Wait for email lookup debounce
  await page.waitForTimeout(1000);

  // Step 5: Submit
  await page.getByRole('button', { name: /seal.*send/i }).click();

  // Step 6: Verify success — should navigate to partners page with toast
  await expect(page).toHaveURL(/\/partners/, { timeout: 10000 });

  // Step 7: Check the agreement exists in the prod DB
  const prodSRK = process.env.PROD_SERVICE_ROLE_KEY;
  if (prodSRK) {
    const adminClient = createClient(PROD_URL!, prodSRK, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: agreements } = await adminClient
      .from('clarity_agreements')
      .select('id, partner_email, status')
      .eq('partner_email', 'prodtest-verification@gmail.com')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(agreements).toHaveLength(1);
    expect(agreements![0].status).toBe('pending');

    // Cleanup: delete the test agreement
    await adminClient
      .from('clarity_agreements')
      .delete()
      .eq('id', agreements![0].id);

    console.log(`[PROD VERIFY] Agreement created and cleaned up: ${agreements![0].id}`);
  }

  await context.close();
});
