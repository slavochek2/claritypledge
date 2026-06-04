/**
 * @file verify-prod-p886-auth.spec.ts
 * @description Prod verification for P886 — auth flows survive the re-applied
 * profiles column gate.
 *
 * The 2026-06-04 incident mode: a browser session loads the app → AuthContext
 * reads the profile → 403 "permission denied for table profiles". The first
 * user impact was the magic-link callback after a letter response ("Error
 * creating profile"). These tests drive both paths against the LIVE prod app
 * with the gate active:
 *
 *   A. Session restore: password session injected (verify-prod-agreements
 *      pattern), app loads, profile-dependent UI renders, zero
 *      permission-denied responses on the wire.
 *   B. Auth-callback processing: a session walks /auth/callback?source=login —
 *      AuthCallbackPage ALWAYS upserts the profile (upsert_my_profile RPC) and
 *      reads it back. This is the step that showed "Error creating profile" to
 *      the letter recipient during the incident. Token exchange itself is NOT
 *      driven here: the client is PKCE (src/lib/supabase.ts flowType) — an
 *      admin.generateLink link cannot mint a session in a browser that lacks
 *      the code_verifier, so the email→token leg is auth-service-internal and
 *      orthogonal to the column gate.
 *
 * Uses the persistent prod test account (PROD_TEST_AGENT_EMAIL). Sign-ins are
 * ordinary auth events — no rows are created.
 *
 * Run: VERIFY_PROD=1 npx playwright test e2e/verify-prod-p886-auth.spec.ts
 * Env (from .env.local): PROD_SUPABASE_ANON_KEY, PROD_TEST_AGENT_EMAIL,
 *   PROD_TEST_AGENT_PASSWORD
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';

const PROD_URL = process.env.PROD_SUPABASE_URL ?? 'https://besjtuodziykmjidubzw.supabase.co';
const APP_URL = 'https://claritypledge.com';
const PROD_ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY!;
const TEST_EMAIL = process.env.PROD_TEST_AGENT_EMAIL!;
const TEST_PASSWORD = process.env.PROD_TEST_AGENT_PASSWORD!;

test.skip(!process.env.VERIFY_PROD, 'Set VERIFY_PROD=1 to run prod verification');

/** Collect permission-denied symptoms: 401/403 REST responses + 42501 console errors. */
function watchForPermissionDenied(page: Page) {
  const hits: string[] = [];
  page.on('response', (res) => {
    if (
      res.url().includes('/rest/v1/') &&
      (res.status() === 401 || res.status() === 403)
    ) {
      hits.push(`HTTP ${res.status()} ${res.url()}`);
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /42501|permission denied/i.test(msg.text())) {
      hits.push(`console: ${msg.text().slice(0, 160)}`);
    }
  });
  return hits;
}

/** Sign in with the prod test agent and return a context with the session injected. */
async function makeAuthedContext(browser: import('@playwright/test').Browser) {
  const supabase = createClient(PROD_URL, PROD_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  expect(signInError, `sign-in failed: ${signInError?.message}`).toBeNull();

  const session: Session = signInData!.session!;
  const projectRef = PROD_URL.split('//')[1].split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionPayload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
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

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: storageKey, value: sessionPayload },
  );
  return context;
}

test('A: authenticated session loads prod app without permission errors', async ({ browser }) => {
  const context = await makeAuthedContext(browser);
  try {
    const page = await context.newPage();
    const denied = watchForPermissionDenied(page);

    await page.goto(APP_URL, { waitUntil: 'networkidle' });

    // Positive gate first: the nav actually rendered (it is a `navigation`
    // landmark, not `banner`). Without this, absence checks pass vacuously.
    await expect(page.getByRole('navigation')).toBeVisible();

    // Open the menu: authenticated state shows Settings + Log Out; the incident
    // mode (profile read 403'd) left users logged-out-looking → Log In + Create
    // Account. Asserting "Log Out" present is the positive auth-state signal.
    await page.getByRole('button', { name: /menu/i }).click();
    await expect(page.getByText(/log out/i).first()).toBeVisible();
    await expect(page.getByText(/^log in$/i)).toHaveCount(0);

    expect(denied, `permission-denied symptoms:\n${denied.join('\n')}`).toHaveLength(0);
  } finally {
    await context.close();
  }
});

test('B: auth-callback profile upsert + read succeed (incident path)', async ({ browser }) => {
  const context = await makeAuthedContext(browser);
  try {
    const page = await context.newPage();
    const denied = watchForPermissionDenied(page);

    // AuthCallbackPage with a live session: always upserts the profile
    // (upsert_my_profile RPC) then reads it back — the exact step that failed
    // with "Error creating profile" during the incident.
    await page.goto(`${APP_URL}/auth/callback?source=login`, { waitUntil: 'networkidle' });

    // Success = navigated away from /auth/callback to a real page. This is the
    // load-bearing assertion: the error states (auth_error, "Error creating
    // profile") all keep the URL parked on /auth/callback.
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/callback'), {
      timeout: 20_000,
    });

    await expect(page.getByText(/error creating profile/i)).toHaveCount(0);
    await expect(page.getByText(/link expired or invalid/i)).toHaveCount(0);
    await expect(page.getByText(/permission denied/i)).toHaveCount(0);

    expect(denied, `permission-denied symptoms:\n${denied.join('\n')}`).toHaveLength(0);
  } finally {
    await context.close();
  }
});
