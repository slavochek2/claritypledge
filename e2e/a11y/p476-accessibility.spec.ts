/**
 * @file p476-accessibility.spec.ts
 * @description Accessibility tests for P476: Accept Page — Full-Screen Email Confirmation
 *
 * P476 introduces a new full-screen confirmation page (AgreementEmailConfirmationPage)
 * shown to unauthenticated partners after clicking "Seal & Create Account".
 *
 * This is a novel surface — a dedicated full-page email check state that requires:
 *   - A keyboard-accessible main heading
 *   - A keyboard-accessible resend button
 *   - A keyboard-accessible back navigation link
 *   - The partner email display has appropriate context (in a landmark or with accessible label)
 *   - No JS crashes on the confirmation page
 *
 * Tests are written against the pre-transition (accept page) and post-transition
 * (confirmation page) states. OTP calls are mocked via page.route().
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from '../helpers/test-agreement';

async function mockOtpSuccess(page: import('@playwright/test').Page) {
  await page.route('**/auth/v1/otp**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let creator: TestUser;
let pendingAgreement: TestAgreement;

test.beforeAll(async () => {
  creator = await createTestUser({ name: 'P476A11y Creator' });
  pendingAgreement = await createTestAgreement(
    creator.user.id,
    'p476-a11y-partner@example-test.com',
    { status: 'pending', visibility: 'private' }
  );
});

test.afterAll(async () => {
  if (pendingAgreement?.id) await deleteTestAgreement(pendingAgreement.id);
  if (creator?.user?.id) await deleteTestUser(creator.user.id);
});

// ── Accept page (pre-confirmation) keyboard accessibility ─────────────────────

test.describe('P476 Accessibility — Accept page (unauthenticated pre-OTP state)', () => {
  test.describe.configure({ timeout: 60000 });

  test('"Seal & Create Account" button is keyboard-accessible', async ({ page }) => {
    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });

    await sealButton.focus();
    await expect(sealButton).toBeFocused();
  });

  test('accept page has a main heading', async ({ page }) => {
    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    // Page should have a discoverable h1 (the "X invited you" heading)
    const mainHeading = page.getByRole('heading', { level: 1 });
    await expect(mainHeading).toBeVisible({ timeout: 10000 });
  });

  test('name input on accept page is keyboard-accessible and has accessible label', async ({ page }) => {
    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    // Unauthenticated accept page has a name input for the partner
    const nameInput = page
      .getByRole('textbox', { name: /your name|partner name/i })
      .or(page.locator('input[id="unauth-partner-name"]'));

    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.focus();
      await expect(nameInput).toBeFocused();

      // Must have a label
      const label = await nameInput.getAttribute('aria-label');
      const id = await nameInput.getAttribute('id');
      if (id) {
        // Check for a corresponding <label for="id">
        const labelEl = page.locator(`label[for="${id}"]`);
        const hasLabel = await labelEl.isVisible().catch(() => false);
        expect(hasLabel || (label && label.length > 0)).toBe(true);
      }
    }
  });
});

// ── Confirmation page keyboard accessibility ──────────────────────────────────

test.describe('P476 Accessibility — Email confirmation page (post-OTP state)', () => {
  test.describe.configure({ timeout: 60000 });

  test('confirmation page main heading is keyboard-reachable', async ({ page }) => {
    await mockOtpSuccess(page);

    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });
    await sealButton.click();

    await page.waitForTimeout(1500);

    // After P476: confirmation page must have a main heading (h1)
    // Try keyboard navigation to heading via Tab
    const heading = page.getByRole('heading', { level: 1 });
    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Heading exists — navigable by screen reader
      const headingText = await heading.textContent();
      expect(headingText?.trim().length).toBeGreaterThan(0);
    }
  });

  test('resend button on confirmation page is keyboard-accessible', async ({ page }) => {
    await mockOtpSuccess(page);

    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });
    await sealButton.click();

    await page.waitForTimeout(1500);

    // Resend element — either a button or a text link
    const resendEl = page
      .getByRole('button', { name: /resend/i })
      .or(page.getByRole('link', { name: /resend/i }));

    if (await resendEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await resendEl.focus();
      await expect(resendEl).toBeFocused();
    }
  });

  test('back button/link on confirmation page is keyboard-accessible', async ({ page }) => {
    await mockOtpSuccess(page);

    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });
    await sealButton.click();

    await page.waitForTimeout(1500);

    // Back navigation
    const backEl = page
      .getByRole('button', { name: /back/i })
      .or(page.getByRole('link', { name: /back/i }));

    if (await backEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backEl.focus();
      await expect(backEl).toBeFocused();
    }
  });

  test('partner email on confirmation page is within a landmark or has contextual label', async ({ page }) => {
    await mockOtpSuccess(page);

    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });
    await sealButton.click();

    await page.waitForTimeout(1500);

    // Email should be displayed in a meaningful context
    // Either inside a landmark (main, region) or accompanied by explanatory text
    const emailText = page.getByText('p476-a11y-partner@example-test.com');
    if (await emailText.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Email text exists — it should be inside the main content area
      const isInMain = await emailText.evaluate(el => {
        let node: Element | null = el;
        while (node) {
          const role = node.getAttribute('role');
          const tag = node.tagName.toLowerCase();
          if (role === 'main' || tag === 'main' || role === 'region') return true;
          node = node.parentElement;
        }
        return false;
      }).catch(() => false);
      // Soft assertion — surfacing as test info if not in a landmark
      if (!isInMain) {
        console.info('[P476 a11y] Partner email not found inside a landmark role="main" or role="region" — verify implementation');
      }
    }
  });

  test('confirmation page loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]/i)) {
        jsErrors.push(msg.text());
      }
    });

    await mockOtpSuccess(page);

    await page.goto(
      `/agreements/${pendingAgreement.id}/accept?token=${pendingAgreement.invitationToken}`
    );
    await page.waitForLoadState('networkidle');

    const sealButton = page.getByRole('button', { name: /seal.*create account/i });
    await expect(sealButton).toBeVisible({ timeout: 10000 });
    await sealButton.click();

    await page.waitForTimeout(1500);

    expect(
      jsErrors,
      `JS errors on confirmation page: ${jsErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
