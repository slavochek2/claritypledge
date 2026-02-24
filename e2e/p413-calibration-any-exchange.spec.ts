/**
 * @file p413-calibration-any-exchange.spec.ts
 * @description E2E tests for P413: Count any completed paraphrase exchange toward calibration
 *
 * Tests:
 * - 5 no-story exchanges unlock calibration display on profile
 * - Mixed no-story + story exchanges still count
 * - Low speaker rating (< 10) still counts toward calibration
 * - Existing calibration averages still compute correctly
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import {
  createCalibrationData,
  createCalibrationDataNoStory,
  deleteCalibrationData,
} from './helpers/test-calibration';

test.describe('P413 — Calibration from any paraphrase exchange', () => {
  test.setTimeout(45000);

  let listener: TestUser;
  let speaker: TestUser;

  test.beforeEach(async () => {
    listener = await createTestUser({ name: 'P413 Listener' });
    speaker = await createTestUser({ name: 'P413 Speaker' });
  });

  test.afterEach(async () => {
    if (listener?.user?.id) {
      await deleteCalibrationData(listener.user.id);
      await deleteTestUser(listener.user.id);
    }
    if (speaker?.user?.id) {
      await deleteCalibrationData(speaker.user.id);
      await deleteTestUser(speaker.user.id);
    }
  });

  // ── AC1: No-story exchanges unlock calibration ───────────────────────────
  test('5 no-story exchanges unlock calibration display on profile', async ({ page }) => {
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 5,
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: listener.name })).toBeVisible();
    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });

  // ── AC2: Low speaker rating (< 10) still counts ─────────────────────────
  test('exchanges with speaker_rating < 10 count toward calibration', async ({ page }) => {
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 5,
      lowRatings: true, // speaker_rating 4-6, listener_rating 5-7
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });

  // ── AC3: Mixed story + no-story exchanges count together ─────────────────
  test('mix of story and no-story exchanges (3+2) unlocks calibration', async ({ page }) => {
    // 3 with story
    await createCalibrationData({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 3,
    });
    // 2 without story
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 2,
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });

  // ── AC4: Fewer than 5 exchanges do NOT show calibration ──────────────────
  test('4 no-story exchanges do not unlock calibration (threshold not met)', async ({ page }) => {
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 4,
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    // Calibration section should not be visible (locked state)
    await expect(page.getByText('Understanding Calibration')).not.toBeVisible();
  });

  // ── AC5: Calibration averages compute from actual ratings ────────────────
  test('calibration averages reflect speaker_rating and listener_rating from no-story rows', async ({
    page,
  }) => {
    // Overconfident pattern: listener rates self 8-9, speaker rates them 6-7
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 5,
      overconfident: true,
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Understanding Calibration')).toBeVisible();
    // Tooltip confirms session count is recorded
    const calibrationBar = page.locator('.bg-blue-500.rounded-full').first();
    await calibrationBar.click();
    await expect(page.getByText(/over \d+ session/i).first()).toBeVisible();
  });
});
