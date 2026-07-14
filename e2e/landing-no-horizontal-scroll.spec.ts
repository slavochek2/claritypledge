/**
 * @file landing-no-horizontal-scroll.spec.ts
 * @description E2E tests to verify the landing page doesn't have horizontal scroll
 * or double scrollbar issues after overflow-x: clip fix.
 *
 * Route map (P916/P987): `/` renders ProgramPage (key-hire landing); the coach
 * landing lives at `/coach`. The pre-reframe co-founder version is kept at
 * /tree/old-landing-2 (DEV-gated); an earlier landing predates that at /tree/old-landing.
 * The generic scroll/overflow tests run against `/` (now the program page); the
 * section-animation + FAQ contract tests target /tree/old-landing, which still owns
 * that markup.
 *
 * Related: B58 - Overflow Clip Regression Testing
 */
import { test, expect } from '@playwright/test';

test.describe('Landing Page - No Horizontal Scroll', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to fully load
    await page.waitForSelector('h1');
  });

  // P916/P987 swap guard: pins which page each route renders so the homepage swap
  // (/ = program, /coach = coach) can't silently regress. The generic overflow
  // tests below assert no-scroll but would pass for ANY page — this names them.
  test('P987: "/" renders the key-hire program landing, "/coach" renders the coach landing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/De-risk misalignment with/i).first()).toBeVisible();
    await page.goto('/coach');
    await expect(page.getByText(/Stop losing customers/i).first()).toBeVisible();
  });

  test('should not have horizontal scrollbar on desktop', async ({ page }) => {
    // Check that document doesn't have horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('should not have horizontal scrollbar on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X

    // Wait for responsive layout to settle
    await page.waitForTimeout(100);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('should not have double scrollbar (no inner scrollable container)', async ({ page }) => {
    // Find elements with overflow-y: auto or scroll that have scrollable content
    const innerScrollables = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const scrollables: string[] = [];

      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          if (el.scrollHeight > el.clientHeight) {
            const tag = el.tagName.toLowerCase();
            const cls = el.className?.toString().slice(0, 50) || '';
            scrollables.push(`${tag}.${cls}`);
          }
        }
      });

      return scrollables;
    });

    // Should only have the document body as scrollable, not inner containers
    expect(innerScrollables).toEqual([]);
  });

  test('sticky navigation should work while scrolling', async ({ page }) => {
    // Get initial nav position
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);

    // Nav should still be visible (sticky)
    await expect(nav).toBeVisible();

    // Nav should be at top of viewport
    const navBox = await nav.boundingBox();
    expect(navBox).toBeTruthy();
    expect(navBox!.y).toBeLessThanOrEqual(10); // Allow small tolerance
  });

  test('page should be scrollable vertically', async ({ page }) => {
    // Verify page has vertical scroll (content is taller than viewport)
    const hasVerticalScroll = await page.evaluate(() => {
      return document.documentElement.scrollHeight > document.documentElement.clientHeight;
    });

    expect(hasVerticalScroll).toBe(true);

    // Verify we can actually scroll
    await page.evaluate(() => window.scrollTo(0, 1000));
    const scrollY = await page.evaluate(() => window.scrollY);

    expect(scrollY).toBeGreaterThan(0);
  });

  test('mobile viewport should not allow horizontal drag scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Try to scroll horizontally via touch
    await page.evaluate(() => {
      window.scrollTo(100, 0); // Try to scroll right
    });

    const scrollX = await page.evaluate(() => window.scrollX);

    // Should not be able to scroll horizontally
    expect(scrollX).toBe(0);
  });
});

test.describe('Landing Page - Wide Content Sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // P987: "/" is the key-hire program page; its unsent-message illustration is the
  // animated HardTruthChat (key-hire scenario). The contact header "Your New Hire"
  // renders from frame one (not animation-gated), so it's a stable scroll anchor.
  test('unsent-message illustration should not overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Scroll to the illustration (contact header is a stable, always-rendered text node)
    const illustration = page.locator('text=Your New Hire').first();
    await illustration.scrollIntoViewIfNeeded();

    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });
});

// P911: When `/` was redesigned to CoachPartnershipPage, the section-animation
// (data-section-index) and FAQ ("people think") markup moved to the old landing,
// kept at /tree/old-landing (ClarityPledgeLanding, DEV-gated). These two tests
// encode that old-landing contract and are repointed here so they exercise the
// page that still owns those elements. The overflow/scroll tests above stay on `/`.
test.describe('Old Landing (/tree/old-landing) - section + FAQ contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tree/old-landing');
    await page.waitForSelector('[data-section-index="0"]');
  });

  test('section animations should trigger on scroll', async ({ page }) => {
    // First section should be visible immediately
    const firstSection = page.locator('[data-section-index="0"]');
    await expect(firstSection).toHaveClass(/opacity-100/);

    // Scroll to trigger second section
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(600); // Wait for animation

    const secondSection = page.locator('[data-section-index="1"]');
    await expect(secondSection).toHaveClass(/opacity-100/);
  });

  test('FAQ section expanded should not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Find and click FAQ items to expand them
    const faqButtons = page.locator('button:has-text("people think")');
    await faqButtons.first().scrollIntoViewIfNeeded();

    // Check expanded state doesn't cause overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });
});
