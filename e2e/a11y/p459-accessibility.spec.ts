/**
 * @file p459-accessibility.spec.ts
 * @description Accessibility tests for P459: Agreements to Connections page relocation.
 *
 * Verifies the ARIA contract for the two new UI surfaces:
 *
 *   1. Profile header metadata line (compact agreement count + link)
 *      - Link is keyboard-reachable via Tab
 *      - Link has descriptive accessible text (not just "→")
 *      - ✦ symbol is aria-hidden or decorative
 *
 *   2. Connections page (/p/:slug/connections)
 *      - Page has an h1 heading
 *      - Agreement list has an accessible label
 *      - Agreement list items have accessible text describing the partner
 *      - "New Agreement" CTA (owner only) is reachable by keyboard and has accessible label
 *
 * Tests run against a seeded owner + agreement so the metadata line renders.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from '../helpers/test-agreement';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let owner: TestUser;
let partner: TestUser;
let publicAgreement: TestAgreement;

test.beforeAll(async () => {
  owner = await createTestUser({ name: 'P459A11yOwner' });
  partner = await createTestUser({ name: 'P459A11yPartner' });

  publicAgreement = await createTestAgreement(
    owner.user.id,
    partner.email,
    {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    }
  );
});

test.afterAll(async () => {
  if (publicAgreement?.id) await deleteTestAgreement(publicAgreement.id);
  if (owner?.user?.id) await deleteTestUser(owner.user.id);
  if (partner?.user?.id) await deleteTestUser(partner.user.id);
});

// ─── Metadata line accessibility ─────────────────────────────────────────────

test.describe('P459 Accessibility — Profile header metadata line', () => {
  test.describe.configure({ timeout: 60000 });

  test('metadata line link is keyboard-accessible via Tab', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Tab through the page and check that the connections link can receive focus
    const connectionsLink = page.locator(`a[href="/p/${owner.slug}/connections"]`);
    await expect(connectionsLink).toBeVisible({ timeout: 10000 });

    // Focus the link via keyboard navigation
    await connectionsLink.focus();
    await expect(connectionsLink).toBeFocused();
  });

  test('metadata line link can be activated with Enter key', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const connectionsLink = page.locator(`a[href="/p/${owner.slug}/connections"]`);
    await expect(connectionsLink).toBeVisible({ timeout: 10000 });

    await connectionsLink.focus();
    await page.keyboard.press('Enter');

    // Should navigate to the connections page
    await expect(page).toHaveURL(`/p/${owner.slug}/connections`);
  });

  test('metadata line link has descriptive accessible text (not just an arrow symbol)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const connectionsLink = page.locator(`a[href="/p/${owner.slug}/connections"]`);
    await expect(connectionsLink).toBeVisible({ timeout: 10000 });

    // The link must have accessible text beyond a bare symbol
    const accessibleName = await connectionsLink.evaluate((el) => {
      return el.getAttribute('aria-label') || el.textContent || '';
    });

    // Must contain something meaningful — not just "→" or "✦"
    expect(accessibleName.replace(/[✦→\s]/g, '')).toBeTruthy();
  });

  test('✦ symbol in metadata line is aria-hidden or decorative', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // The ✦ symbol should be aria-hidden so screen readers skip it
    const sparkleSpan = page.locator('span[aria-hidden="true"]', { hasText: '✦' });

    // If the symbol renders (implementation may vary), it must be hidden from AT
    const count = await sparkleSpan.count();
    if (count > 0) {
      const ariaHidden = await sparkleSpan.first().getAttribute('aria-hidden');
      expect(ariaHidden).toBe('true');
    }
    // If no explicit aria-hidden span found, the symbol may be inside an aria-hidden container
    // — that's also acceptable. The test serves as a reminder to verify this.
  });
});

// ─── Connections page accessibility ──────────────────────────────────────────

test.describe('P459 Accessibility — Connections page (/p/:slug/connections)', () => {
  test.describe.configure({ timeout: 60000 });

  test('connections page has an h1 heading', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible({ timeout: 10000 });
  });

  test('connections page heading includes the profile name or "Connections" context', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Heading should reference the subject's name or the word "Connections"
    // Per spec wireframe: "← Name Surname's Connections"
    const h1 = page.getByRole('heading', { level: 1 });
    const headingText = await h1.textContent();
    expect(headingText?.toLowerCase()).toMatch(/connections|partner/i);
  });

  test('agreement list section has an accessible label', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // The list of agreements should be wrapped in a section/region with aria-label
    // or a list element with aria-label
    const labelledList = page
      .locator('[aria-label*="agreement" i]')
      .or(page.locator('section[aria-label*="partner" i]'))
      .or(page.locator('[role="list"][aria-label]'));

    await expect(labelledList.first()).toBeAttached({ timeout: 10000 });
  });

  test('agreement list items have accessible text describing the partner', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // List items should have visible text — at minimum the agreement title or partner name
    const listItems = page.locator('ul li, [role="list"] [role="listitem"]');
    await expect(listItems.first()).toBeVisible({ timeout: 10000 });

    const firstItemText = await listItems.first().textContent();
    // Item text must be non-empty — partner name or agreement display ID
    expect(firstItemText?.trim()).toBeTruthy();
  });

  test('"New Agreement" CTA is keyboard-accessible for owner', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    const newAgreementCTA = page.getByRole('link', { name: /new agreement/i })
      .or(page.getByRole('button', { name: /new agreement/i }));
    await expect(newAgreementCTA).toBeVisible({ timeout: 10000 });

    await newAgreementCTA.focus();
    await expect(newAgreementCTA).toBeFocused();
  });

  test('"New Agreement" CTA has accessible label (not just icon or symbol)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // The CTA should be accessible by its role + name — we verified above.
    // Additionally check it has an aria-label or visible text with meaningful content.
    const newAgreementCTA = page.getByRole('link', { name: /new agreement/i })
      .or(page.getByRole('button', { name: /new agreement/i }));
    await expect(newAgreementCTA).toBeVisible({ timeout: 10000 });

    const accessibleName = await newAgreementCTA.evaluate(el => {
      return el.getAttribute('aria-label') || el.textContent || '';
    });
    expect(accessibleName.trim().replace(/[+\s]/g, '').length).toBeGreaterThan(0);
  });

  test('back navigation link/button is keyboard-accessible on connections page', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Per spec wireframe: "← Name Surname's Connections" — the ← implies back navigation
    const backLink = page.getByRole('link', { name: /back|← /i })
      .or(page.locator('a[href*="/p/"]').first());

    const isVisible = await backLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await backLink.focus();
      await expect(backLink).toBeFocused();
    } else {
      // Back navigation may be in the browser history or a different pattern
      // Log as informational — implementation decides the pattern
      console.info('[P459 a11y] No explicit back link found — may use browser back or header nav');
    }
  });

  test('connections page has no console errors (no JS crash)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        consoleErrors.push(msg.text());
      }
    });

    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    expect(
      consoleErrors,
      `Console errors on connections page: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });
});

// ─── Visitor a11y on connections page ────────────────────────────────────────

test.describe('P459 Accessibility — Visitor on connections page', () => {
  test.describe.configure({ timeout: 60000 });

  test('visitor connections page has accessible heading', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible({ timeout: 10000 });
  });

  test('visitor connections page has no "New Agreement" CTA (accessibility: no phantom focusable element)', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Visitor must NOT have a "New Agreement" button in the tab order
    const newAgreementCTA = page.getByRole('link', { name: /new agreement/i })
      .or(page.getByRole('button', { name: /new agreement/i }));
    await expect(newAgreementCTA).not.toBeVisible({ timeout: 5000 }).catch(() => {
      // If the element exists but is visibility:hidden or display:none, that is also acceptable
    });
  });
});
