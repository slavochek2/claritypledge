/**
 * @file p800-supersede-banner.spec.ts
 * @description E2E tests for P800: point supersede banner + version history on point detail page.
 *
 * Tests:
 * 1. Smoke: point detail page loads without console errors
 * 2. Non-superseded point shows no banner
 * 3. Superseded point shows banner with "Superseded by" text
 * 4. Version history section is visible when chain exists
 *
 * Auth: tests 2–4 require a signed-in user (point detail page may be auth-gated for full data).
 * Uses setTestSession pattern from existing E2E tests.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P800: point supersede banner', () => {
  test.describe.configure({ timeout: 60000 });

  // ── 1. Smoke: page loads without console errors ───────────────────────────
  test('smoke: point detail page loads without console errors', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let pointId: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P800 Smoke User' });
      const point = await createTestPoint(testUser.user.id, {
        statement: 'P800 smoke test point for detail page',
      });
      pointId = point.id;

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Exclude known benign browser warnings
          if (!text.includes('ResizeObserver') && !text.includes('Non-Error promise rejection')) {
            consoleErrors.push(text);
          }
        }
      });

      await setTestSession(page, testUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Page must load successfully
      await expect(page).not.toHaveURL(/error|404|500/);

      // Point statement must be visible
      await expect(
        page.getByText('P800 smoke test point for detail page'),
      ).toBeVisible({ timeout: 10000 });

      expect(
        consoleErrors,
        `Console errors on point detail page: ${consoleErrors.join('; ')}`,
      ).toHaveLength(0);
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 2. Non-superseded point: no banner visible ─────────────────────────────
  test('non-superseded point shows no supersede banner', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let pointId: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P800 NoBanner User' });
      const point = await createTestPoint(testUser.user.id, {
        statement: 'P800 active point — should have no banner',
      });
      pointId = point.id;

      await setTestSession(page, testUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('P800 active point — should have no banner'),
      ).toBeVisible({ timeout: 10000 });

      // Banner must NOT be present for a non-superseded point
      await expect(
        page.getByTestId('supersede-banner'),
      ).not.toBeVisible({ timeout: 3000 });

      await expect(
        page.getByText(/superseded by/i),
      ).not.toBeVisible({ timeout: 3000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 3. Superseded point: banner visible with "Superseded by" text ──────────
  test('superseded point shows banner with "Superseded by" text and link', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let p1Id: string | null = null;
    let p2Id: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P800 Banner User' });

      const p1 = await createTestPoint(testUser.user.id, {
        statement: 'P800 v1 statement — this will be superseded',
      });
      p1Id = p1.id;

      const p2 = await createTestPoint(testUser.user.id, {
        statement: 'P800 v2 statement — the head',
      });
      p2Id = p2.id;

      // Set p1.superseded_by = p2 via admin (bypasses RLS, trigger still fires)
      const { error: wireError } = await supabaseAdmin
        .from('points')
        .update({ superseded_by: p2Id })
        .eq('id', p1Id);

      expect(wireError, `Failed to wire supersede for banner test: ${wireError?.message}`).toBeNull();

      await setTestSession(page, testUser.email);
      await page.goto(`/point/${p1Id}`);
      await page.waitForLoadState('networkidle');

      // v1 statement must be visible
      await expect(
        page.getByText('P800 v1 statement — this will be superseded'),
      ).toBeVisible({ timeout: 10000 });

      // Banner must be visible
      await expect(
        page.getByTestId('supersede-banner'),
      ).toBeVisible({ timeout: 8000 });
    } finally {
      // Clear superseded_by before deleting
      if (p1Id) {
        await supabaseAdmin
          .from('points')
          .update({ superseded_by: null })
          .eq('id', p1Id);
        await deleteTestPoint(p1Id);
      }
      if (p2Id) await deleteTestPoint(p2Id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 4. Version history expander visible when chain exists ─────────────────
  test('version history section is visible on a superseded point detail page', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let p1Id: string | null = null;
    let p2Id: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P800 VersionHistory User' });

      const p1 = await createTestPoint(testUser.user.id, {
        statement: 'P800 v1 for version history test',
      });
      p1Id = p1.id;

      const p2 = await createTestPoint(testUser.user.id, {
        statement: 'P800 v2 head for version history test',
      });
      p2Id = p2.id;

      const { error: wireError } = await supabaseAdmin
        .from('points')
        .update({ superseded_by: p2Id })
        .eq('id', p1Id);

      expect(wireError, `Failed to wire supersede for history test: ${wireError?.message}`).toBeNull();

      await setTestSession(page, testUser.email);
      await page.goto(`/point/${p1Id}`);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('P800 v1 for version history test'),
      ).toBeVisible({ timeout: 10000 });

      // Version history section must be present for a point in a chain
      await expect(
        page.getByTestId('point-version-history'),
      ).toBeVisible({ timeout: 8000 });
    } finally {
      if (p1Id) {
        await supabaseAdmin
          .from('points')
          .update({ superseded_by: null })
          .eq('id', p1Id);
        await deleteTestPoint(p1Id);
      }
      if (p2Id) await deleteTestPoint(p2Id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
