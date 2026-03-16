/**
 * @file p527-smoke.spec.ts
 * @description Smoke tests for P527: Direct Sign for New Users.
 *
 * Fast regression detection — verifies accept page loads correctly
 * and the create-and-sign edge function endpoint is reachable.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import {
  createTestAgreement,
  deleteTestAgreement,
  type TestAgreement,
} from './helpers/test-agreement';

test.describe('P527 — Smoke Tests', () => {
  test.setTimeout(30000);

  let creator: TestUser;
  let agreement: TestAgreement;
  const partnerEmail = `p527-smoke-${Date.now()}@gmail.com`;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P527 Smoke Creator' });
    agreement = await createTestAgreement(creator.user.id, partnerEmail);
  });

  test.afterAll(async () => {
    if (agreement?.id) await deleteTestAgreement(agreement.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('accept page loads for new user without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Page should render the creator's invitation heading
    await expect(page.getByText(/invited you/i)).toBeVisible({ timeout: 10000 });

    // Filter out known benign console errors (e.g. Supabase realtime, favicon)
    const realErrors = consoleErrors.filter(
      e => !e.includes('favicon') && !e.includes('realtime') && !e.includes('WebSocket')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('accept page renders name input and sign button', async ({ page }) => {
    await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
    await page.waitForLoadState('networkidle');

    // Name input visible for new user
    await expect(page.getByPlaceholder('Your full name')).toBeVisible({ timeout: 10000 });

    // Sign button visible
    await expect(page.getByRole('button', { name: /seal.*sign/i })).toBeVisible();

    // No "check your email" content
    await expect(page.getByText(/check your email/i)).not.toBeVisible();
  });

  test('create-and-sign edge function endpoint is reachable', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

    // POST with invalid body — should get 400 (not 404 or 502)
    const response = await request.post(`${supabaseUrl}/functions/v1/create-and-sign`, {
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      data: {},
    });

    // 400 = function exists and validates input
    // 404 or 502 = function not deployed
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('INVALID_INPUT');
  });
});
