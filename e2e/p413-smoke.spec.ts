/**
 * @file p413-smoke.spec.ts
 * @description Smoke test for P413: profile page loads without errors for user with no-story verifications
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createCalibrationDataNoStory, deleteCalibrationData } from './helpers/test-calibration';

test.describe('P413 — Smoke', () => {
  test.setTimeout(30000);

  let listener: TestUser;
  let speaker: TestUser;

  test.beforeAll(async () => {
    listener = await createTestUser({ name: 'P413 Smoke Listener' });
    speaker = await createTestUser({ name: 'P413 Smoke Speaker' });
    await createCalibrationDataNoStory({
      listenerId: listener.user.id,
      speakerId: speaker.user.id,
      count: 5,
    });
  });

  test.afterAll(async () => {
    if (listener?.user?.id) {
      await deleteCalibrationData(listener.user.id);
      await deleteTestUser(listener.user.id);
    }
    if (speaker?.user?.id) {
      await deleteCalibrationData(speaker.user.id);
      await deleteTestUser(speaker.user.id);
    }
  });

  test('profile page loads without errors for user with no-story verifications', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/p/${listener.slug}`);
    await page.waitForLoadState('networkidle');

    // Page loaded
    await expect(page.getByRole('heading', { name: listener.name })).toBeVisible();

    // No JS errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('JSHINT') && !e.includes('[HMR]')
    );
    expect(criticalErrors, `Console errors: ${criticalErrors.join(', ')}`).toHaveLength(0);

    // Calibration section visible (5 sessions seeded)
    await expect(page.getByText('Understanding Calibration')).toBeVisible();
  });
});
