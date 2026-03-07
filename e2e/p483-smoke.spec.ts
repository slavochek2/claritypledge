/**
 * @file p483-smoke.spec.ts
 * @description Smoke tests for P483: Existing User Invite Path Streamlining.
 *
 * Fast regression detection — pages load without errors in the new states.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';
import { setTestSession } from './helpers/test-user';

test.describe('P483 — Smoke Tests', () => {
  test.setTimeout(30000);

  let creator: TestUser;
  let partner: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P483 Smoke Creator' });
    partner = await createTestUser({ name: 'P483 Smoke Partner' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
  });

  test('create page loads without console errors after email lookup', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)
      ) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Trigger lookup
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(partner.email);
    await page.waitForTimeout(2000);

    expect(consoleErrors).toHaveLength(0);
  });

  test('accept page loads without errors for logged-in existing user', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending', visibility: 'private',
    });

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)
      ) {
        consoleErrors.push(msg.text());
      }
    });

    try {
      await setTestSession(page, partner.email);
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Page loaded — certificate title visible
      await expect(page.getByText(/Clarity Partner Agreement/i).first()).toBeVisible({ timeout: 10000 });
      expect(consoleErrors).toHaveLength(0);
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });

  test('accept page loads without errors for unauthenticated user (existing)', async ({ page }) => {
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending', visibility: 'private',
    });

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (
        msg.type() === 'error' &&
        !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)
      ) {
        consoleErrors.push(msg.text());
      }
    });

    try {
      // No session — unauthenticated
      await page.goto(`/agreements/${agreement.id}/accept?token=${agreement.invitationToken}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/Clarity Partner Agreement/i).first()).toBeVisible({ timeout: 10000 });
      expect(consoleErrors).toHaveLength(0);
    } finally {
      await deleteTestAgreement(agreement.id);
    }
  });
});
