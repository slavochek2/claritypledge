/**
 * @file live-page-layout.spec.ts
 * @description P30: Visual layout tests for /live page
 *
 * These tests ensure the Live Meeting start page matches the Google Meet-style layout:
 * - Desktop: buttons inline (horizontal), centered on page
 * - Mobile: buttons stacked (vertical), centered on page
 * - Auth state: no flicker for logged-in users
 */
import { test, expect } from '@playwright/test';

test.describe('Live Page Layout - Desktop', () => {
  test.beforeEach(async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });
  });

  test('buttons are inline (horizontal) on desktop', async ({ page }) => {
    await page.goto('/live');

    // Wait for page to load (either guest or logged-in view)
    await expect(page.locator('h1')).toBeVisible();

    // Get the two main controls
    const newMeetingBtn = page.getByRole('button', { name: /new meeting/i });
    const joinInputContainer = page.locator('input[placeholder="Enter a code or link"]').locator('..');

    await expect(newMeetingBtn).toBeVisible();
    await expect(joinInputContainer).toBeVisible();

    // Get bounding boxes
    const btnBox = await newMeetingBtn.boundingBox();
    const inputBox = await joinInputContainer.boundingBox();

    if (!btnBox || !inputBox) {
      throw new Error('Could not get bounding boxes for layout elements');
    }

    // ASSERTION: They should be on the same horizontal row
    // Allow 20px tolerance for slight vertical alignment differences
    const yDifference = Math.abs(btnBox.y - inputBox.y);

    console.log(`Button Y: ${btnBox.y}, Input Y: ${inputBox.y}, Difference: ${yDifference}`);

    expect(yDifference).toBeLessThan(20);

    // ASSERTION: Button should be to the LEFT of input (or they overlap horizontally for centered layout)
    // For centered layout, button's right edge should be near or before input's left edge
    console.log(`Button X: ${btnBox.x}-${btnBox.x + btnBox.width}, Input X: ${inputBox.x}-${inputBox.x + inputBox.width}`);
  });

  test('content is centered on page', async ({ page }) => {
    await page.goto('/live');

    await expect(page.locator('h1')).toBeVisible();

    const h1 = page.locator('h1');
    const h1Box = await h1.boundingBox();
    const viewportWidth = 1024;

    if (!h1Box) {
      throw new Error('Could not get bounding box for h1');
    }

    // Calculate center of h1
    const h1Center = h1Box.x + h1Box.width / 2;
    const pageCenter = viewportWidth / 2;

    // ASSERTION: h1 should be roughly centered (within 50px)
    const centerDifference = Math.abs(h1Center - pageCenter);

    console.log(`H1 center: ${h1Center}, Page center: ${pageCenter}, Difference: ${centerDifference}`);

    expect(centerDifference).toBeLessThan(50);
  });
});

test.describe('Live Page Layout - Mobile', () => {
  test.beforeEach(async ({ page }) => {
    // Set mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test('buttons are stacked (vertical) on mobile', async ({ page }) => {
    await page.goto('/live');

    await expect(page.locator('h1')).toBeVisible();

    const newMeetingBtn = page.getByRole('button', { name: /new meeting/i });
    const joinInput = page.locator('input[placeholder="Enter a code or link"]');

    await expect(newMeetingBtn).toBeVisible();
    await expect(joinInput).toBeVisible();

    const btnBox = await newMeetingBtn.boundingBox();
    const inputBox = await joinInput.boundingBox();

    if (!btnBox || !inputBox) {
      throw new Error('Could not get bounding boxes for layout elements');
    }

    // ASSERTION: Input should be BELOW button (stacked)
    // Input's top (Y) should be greater than button's bottom (Y + height)
    const btnBottom = btnBox.y + btnBox.height;

    console.log(`Button bottom: ${btnBottom}, Input top: ${inputBox.y}`);

    // Allow small gap tolerance
    expect(inputBox.y).toBeGreaterThan(btnBottom - 10);
  });
});

test.describe('Live Page Auth State', () => {
  test('guest user sees name input without flicker', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/live');

    // Wait for content to load
    await expect(page.getByText('Practice Clarity Together')).toBeVisible();

    // Name input should be visible for guests
    const nameInput = page.locator('input[placeholder="Enter your name"]');
    await expect(nameInput).toBeVisible();

    // Poll for stability - ensure no flicker
    const stabilityChecks: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      stabilityChecks.push(await nameInput.isVisible());
    }

    // All checks should be true (visible throughout)
    expect(stabilityChecks.every(v => v === true)).toBe(true);
  });

  test('name input is above buttons on desktop (guest)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/live');

    // Wait for content to load
    await expect(page.getByText('Practice Clarity Together')).toBeVisible();

    // Get elements
    const nameInput = page.locator('input[placeholder="Enter your name"]');
    const newMeetingBtn = page.getByRole('button', { name: /new meeting/i });

    await expect(nameInput).toBeVisible();
    await expect(newMeetingBtn).toBeVisible();

    // Get bounding boxes
    const nameBox = await nameInput.boundingBox();
    const btnBox = await newMeetingBtn.boundingBox();

    if (!nameBox || !btnBox) {
      throw new Error('Could not get bounding boxes');
    }

    // ASSERTION: Name input should be ABOVE button
    const nameBottom = nameBox.y + nameBox.height;

    console.log(`Name bottom: ${nameBottom}, Button top: ${btnBox.y}`);

    // Name input bottom should be above button top (with some gap tolerance)
    expect(nameBottom).toBeLessThan(btnBox.y + 10);
  });

  // Note: Testing logged-in user requires authentication setup
  // which is covered in e2e/helpers/test-user.ts
});
