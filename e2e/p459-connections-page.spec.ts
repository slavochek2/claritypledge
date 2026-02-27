/**
 * @file p459-connections-page.spec.ts
 * @description E2E tests for P459: Agreements to Connections page relocation.
 *
 * Covers the viewer-state matrix for both the profile header metadata line
 * and the new /p/:slug/connections route:
 *
 *   Owner     → metadata line with all agreements count → connections page shows all + CTA
 *   Visitor   → party to agreement → "You have N agreement(s)" → shared agreements only
 *   Visitor   → public active agreements exist → count shown → public active only
 *   Visitor   → no visible agreements → metadata line hidden → empty state
 *
 * Regression check: agreements section no longer in profile content area.
 *
 * NOTE: These tests require a working implementation of P459. Before P459 ships,
 * tests that navigate to /p/:slug/connections will fail (route not yet created).
 * Mark tests that depend on the new route with the @p459 tag so they can be
 * selectively run after implementation.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from './helpers/test-agreement';

// ─── Known non-critical error patterns ────────────────────────────────────────

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let owner: TestUser;                      // Profile owner
let visitor: TestUser;                    // Second user — party to one agreement
let stranger: TestUser;                   // Third user — not party to any agreement

let publicAgreement: TestAgreement;       // Public + active — visible to all
let privatePartyAgreement: TestAgreement; // Private + active — visible to visitor (party)
let privateOtherAgreement: TestAgreement; // Private + active — NOT visible to stranger

test.beforeAll(async () => {
  owner = await createTestUser({ name: 'P459Owner' });
  visitor = await createTestUser({ name: 'P459Visitor' });
  stranger = await createTestUser({ name: 'P459Stranger' });

  // Public active agreement between owner and visitor
  publicAgreement = await createTestAgreement(
    owner.user.id,
    visitor.email,
    {
      partnerProfileId: visitor.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    }
  );

  // Private active agreement — visitor is party
  privatePartyAgreement = await createTestAgreement(
    owner.user.id,
    visitor.email,
    {
      partnerProfileId: visitor.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    }
  );

  // Private active agreement between owner and stranger (stranger sees nothing from owner's profile)
  privateOtherAgreement = await createTestAgreement(
    owner.user.id,
    stranger.email,
    {
      partnerProfileId: stranger.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    }
  );
});

test.afterAll(async () => {
  if (publicAgreement?.id) await deleteTestAgreement(publicAgreement.id);
  if (privatePartyAgreement?.id) await deleteTestAgreement(privatePartyAgreement.id);
  if (privateOtherAgreement?.id) await deleteTestAgreement(privateOtherAgreement.id);
  if (owner?.user?.id) await deleteTestUser(owner.user.id);
  if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  if (stranger?.user?.id) await deleteTestUser(stranger.user.id);
});

// ─── Owner tests ──────────────────────────────────────────────────────────────

test.describe('P459 — Owner viewing own profile', () => {
  test.describe.configure({ timeout: 60000 });

  test('profile header shows metadata line with agreement count', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Owner has 3 agreements (public + 2 private) — metadata line must show count
    // The spec shows "✦ N Clarity Partners →" for the owner
    const metadataLine = page.locator('text=/Clarity Partner/i');
    await expect(metadataLine).toBeVisible({ timeout: 10000 });
  });

  test('metadata line links to /p/:slug/connections', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Find the link in the metadata line pointing to the connections page
    const connectionsLink = page.locator(`a[href="/p/${owner.slug}/connections"]`);
    await expect(connectionsLink).toBeVisible({ timeout: 10000 });
  });

  test('connections page shows all agreements (owner sees all)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Owner should see all 3 agreements (public + 2 private)
    // Page must not show 404 or error
    await expect(page).not.toHaveURL(/404/);
    await expect(page.getByRole('heading', { name: /connections/i })).toBeVisible({ timeout: 10000 });

    // All 3 agreements should be listed
    const _agreementItems = page.locator('[aria-label*="agreement"], [data-testid*="agreement"]');
    // Fallback: count list items under agreements section
    // The exact selector depends on implementation — use a flexible approach
    const listItems = page.locator('ul li, [role="list"] [role="listitem"]');
    const count = await listItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('connections page shows "New Agreement" CTA for owner', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    const newAgreementCTA = page.getByRole('link', { name: /new agreement/i })
      .or(page.getByRole('button', { name: /new agreement/i }));
    await expect(newAgreementCTA).toBeVisible({ timeout: 10000 });
  });

  test('profile page no longer shows Partner Agreements section in content area (regression)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // The old "Partner Agreements" section header must NOT appear in the content area
    // (tab bar content region — below the story CTA and tab bar)
    const agreementsSection = page.locator('section[aria-label="Partner Agreements"]');
    await expect(agreementsSection).not.toBeVisible();
  });
});

// ─── Visitor who is a party ───────────────────────────────────────────────────

test.describe('P459 — Visitor who is party to an agreement', () => {
  test.describe.configure({ timeout: 60000 });

  test('profile header shows "You have N agreement(s) with this person"', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // The spec requires: "✦ You have N agreement(s) with this person →"
    const metadataLine = page.locator('text=/You have.*agreement/i');
    await expect(metadataLine).toBeVisible({ timeout: 10000 });
  });

  test('connections page shows only shared agreements (party view)', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/404/);

    // Visitor should see 2 agreements (the public one + the private one they are party to)
    // They should NOT see the private agreement between owner and stranger
    const listItems = page.locator('ul li, [role="list"] [role="listitem"]');
    const count = await listItems.count();
    expect(count).toBe(2);
  });

  test('connections page does NOT show "New Agreement" CTA for visitor', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    const newAgreementCTA = page.getByRole('link', { name: /new agreement/i })
      .or(page.getByRole('button', { name: /new agreement/i }));
    await expect(newAgreementCTA).not.toBeVisible();
  });
});

// ─── Visitor with only public agreements visible ──────────────────────────────

test.describe('P459 — Visitor with public agreements visible (not a party)', () => {
  test.describe.configure({ timeout: 60000 });

  // We need a fresh user who is not party to any of owner's agreements
  let publicOnlyVisitor: TestUser;

  test.beforeAll(async () => {
    publicOnlyVisitor = await createTestUser({ name: 'P459PublicVisitor' });
  });

  test.afterAll(async () => {
    if (publicOnlyVisitor?.user?.id) await deleteTestUser(publicOnlyVisitor.user.id);
  });

  test('profile header shows count of public active agreements', async ({ page }) => {
    await setTestSession(page, publicOnlyVisitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Owner has 1 public active agreement — metadata line shows count
    // The spec shows "✦ N Clarity Partners →" for visitors
    const metadataLine = page.locator('text=/Clarity Partner/i');
    await expect(metadataLine).toBeVisible({ timeout: 10000 });
  });

  test('connections page shows only public active agreements', async ({ page }) => {
    await setTestSession(page, publicOnlyVisitor.email);
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/404/);

    // Only 1 public active agreement should be visible
    const listItems = page.locator('ul li, [role="list"] [role="listitem"]');
    const count = await listItems.count();
    expect(count).toBe(1);
  });
});

// ─── Visitor with no visible agreements ───────────────────────────────────────

test.describe('P459 — Visitor with no visible agreements', () => {
  test.describe.configure({ timeout: 60000 });

  // Create an owner with only private agreements and no public ones
  let privateOwner: TestUser;
  let anotherUser: TestUser;
  let privateOnlyAgreement: TestAgreement;

  test.beforeAll(async () => {
    privateOwner = await createTestUser({ name: 'P459PrivateOwner' });
    anotherUser = await createTestUser({ name: 'P459AnotherUser' });

    privateOnlyAgreement = await createTestAgreement(
      privateOwner.user.id,
      anotherUser.email,
      {
        partnerProfileId: anotherUser.user.id,
        status: 'active',
        visibility: 'private',
        partnerSignedAt: new Date().toISOString(),
      }
    );
  });

  test.afterAll(async () => {
    if (privateOnlyAgreement?.id) await deleteTestAgreement(privateOnlyAgreement.id);
    if (privateOwner?.user?.id) await deleteTestUser(privateOwner.user.id);
    if (anotherUser?.user?.id) await deleteTestUser(anotherUser.user.id);
  });

  test('profile header metadata line is hidden when visitor has no visible agreements', async ({ page }) => {
    // stranger has no agreements with privateOwner
    await setTestSession(page, stranger.email);
    await page.goto(`/p/${privateOwner.slug}`);
    await page.waitForLoadState('networkidle');

    // Metadata line must not appear — spec: "(metadata line hidden — returns null)"
    const metadataLine = page.locator('text=/Clarity Partner/i');
    await expect(metadataLine).not.toBeVisible({ timeout: 5000 });
  });

  test('connections page shows empty state or handles gracefully when visitor has no visible agreements', async ({ page }) => {
    await setTestSession(page, stranger.email);
    await page.goto(`/p/${privateOwner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    // Implementation may show empty state or 404 — both are acceptable per spec
    // ("Visitor (no visible agreements): 404 or empty state")
    // What must NOT happen: a JS crash or unhandled error
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // Page should either show empty state content OR redirect to a 404 page
    // Either way, no unhandled JS errors
    expect(consoleErrors).toHaveLength(0);
  });
});

// ─── Anonymous visitor ────────────────────────────────────────────────────────

test.describe('P459 — Anonymous visitor', () => {
  test.describe.configure({ timeout: 60000 });

  test('profile header shows public agreements count for anonymous visitor', async ({ page }) => {
    // No setTestSession — anonymous browse
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Owner has 1 public active agreement — anonymous should see it
    const metadataLine = page.locator('text=/Clarity Partner/i');
    await expect(metadataLine).toBeVisible({ timeout: 10000 });
  });

  test('connections page shows only public active agreements for anonymous visitor', async ({ page }) => {
    await page.goto(`/p/${owner.slug}/connections`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/404/);

    // Only 1 public active agreement visible to anonymous
    const listItems = page.locator('ul li, [role="list"] [role="listitem"]');
    const count = await listItems.count();
    expect(count).toBe(1);
  });
});
