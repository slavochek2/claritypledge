/**
 * @file join-form-ux.spec.ts
 * @description UX test for join form - ensures context is clear to users
 *
 * When a user clicks a join link, they should immediately understand:
 * 1. WHAT they're joining (whose meeting)
 * 2. WHY they need to provide info (to join the meeting)
 *
 * The title should be prominent INSIDE the form area, not duplicated in header.
 *
 * P396: Guest join form is name-only — email field must be absent.
 */
import { test, expect } from '@playwright/test';

test.describe('Join Form UX - Context Clarity', () => {
  test('join form shows prominent heading with host name', async ({ page }) => {
    // Navigate to a join link (the code doesn't need to be valid for this UX test)
    await page.goto('/live/TEST123');

    // Wait for the form to load
    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();

    // CRITICAL UX ASSERTION: There should be a prominent heading inside the form area
    // that tells the user what they're joining, not just in the header
    const formHeading = page.getByRole('heading', { name: /join.*session/i });
    await expect(formHeading).toBeVisible();

    // The heading should be reasonably large (at least h2 or equivalent)
    const headingTag = await formHeading.evaluate((el) => el.tagName.toLowerCase());
    expect(['h1', 'h2']).toContain(headingTag);
  });

  test('join form heading appears before input fields', async ({ page }) => {
    await page.goto('/live/TEST123');

    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();

    // Get the heading and first input positions
    const heading = page.getByRole('heading', { name: /join.*session/i });
    const nameInput = page.locator('input[placeholder="Enter your name"]');

    await expect(heading).toBeVisible();

    const headingBox = await heading.boundingBox();
    const inputBox = await nameInput.boundingBox();

    if (!headingBox || !inputBox) {
      throw new Error('Could not get bounding boxes');
    }

    // ASSERTION: Heading should be ABOVE the input fields
    expect(headingBox.y + headingBox.height).toBeLessThan(inputBox.y);
  });

  test('header does not duplicate the form heading (KISS)', async ({ page }) => {
    await page.goto('/live/TEST123');

    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();

    // The header banner should NOT have a duplicate "Join...Meeting" title
    // Header is the first child of main, contains logo and menu
    const headerBanner = page.locator('main > div > div').first();
    const headerText = await headerBanner.textContent();

    // Header should just have "Clarity Pledge" (logo text), not the join title
    expect(headerText).not.toMatch(/Join.*Session/i);
  });

  // P396: guest join is name-only — email field must NOT appear
  test('guest join form shows name input only — no email field (P396)', async ({ page }) => {
    await page.goto('/live/TEST123');

    // Name input must be visible
    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();

    // Email input must NOT be present — P396 removes email collection from the guest flow
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput).not.toBeVisible();
  });
});
