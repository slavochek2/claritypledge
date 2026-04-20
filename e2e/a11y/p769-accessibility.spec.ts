/**
 * @file p769-accessibility.spec.ts
 *
 * P769: Session-end terminal authority — Accessibility tests.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestSessionInDB } from '../helpers/test-session';

test.describe('P769 a11y: SessionEndedScreen', () => {
  let user: TestUser;
  let hostUser: TestUser;

  test.beforeAll(async () => {
    [user, hostUser] = await Promise.all([
      createTestUser({ name: 'P769 A11y User' }),
      createTestUser({ name: 'P769 A11y Host' }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([
      deleteTestUser(user.user.id),
      deleteTestUser(hostUser.user.id),
    ]);
  });

  async function navigateToEndedScreen(page: import('@playwright/test').Page) {
    const dbSession = await createTestSessionInDB(
      hostUser.user.id,
      user.name,
      { guestProfileId: user.user.id }
    );

    await supabaseAdmin.rpc('complete_clarity_session', {
      p_session_id: dbSession.sessionId,
    });

    await setTestSession(page, user.email);
    await page.goto(`/live/${dbSession.sessionCode}?skipMicCheck=true`);
    await page.waitForLoadState('networkidle');

    return dbSession;
  }

  test('ended screen has a visible heading "This session has ended"', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      const heading = page.getByRole('heading', { name: /this session has ended/i });
      await expect(heading).toBeVisible({ timeout: 8_000 });
    } finally {
      await fixture.cleanup();
    }
  });

  test('ended screen heading is at least h1 or h2 level (hierarchy check)', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('h1, h2', { timeout: 8_000 });

      const headingLevel = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const h2 = document.querySelector('h2');
        if (h1?.textContent?.toLowerCase().includes('this session has ended')) return 1;
        if (h2?.textContent?.toLowerCase().includes('this session has ended')) return 2;
        return null;
      });

      expect(
        headingLevel,
        '"This session has ended" text must be in an h1 or h2 (not a div or p)'
      ).not.toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  test('CTA link/button to /letters is reachable via Tab key', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('[role="heading"]', { timeout: 8_000 });

      let ctaFocused = false;
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return null;
          const href = (el as HTMLAnchorElement).href ?? '';
          const text = el.textContent ?? '';
          return { href, text };
        });

        if (focused?.href?.includes('/letters') || focused?.text?.toLowerCase().includes('letter')) {
          ctaFocused = true;
          break;
        }
      }

      expect(
        ctaFocused,
        'CTA linking to /letters must be reachable via Tab from the ended screen'
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  test('ended screen CTA is keyboard-activatable (Enter navigates to /letters)', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('[role="heading"]', { timeout: 8_000 });

      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        const href = await page.evaluate(() => {
          const el = document.activeElement as HTMLAnchorElement;
          return el?.href ?? '';
        });
        if (href.includes('/letters')) {
          await page.keyboard.press('Enter');
          await page.waitForURL(/\/letters/, { timeout: 5_000 });
          break;
        }
      }

      expect(page.url()).toContain('/letters');
    } finally {
      await fixture.cleanup();
    }
  });

  test('ended screen does NOT show a "Rejoin Session" button', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('[role="heading"]', { timeout: 8_000 });

      const rejoinButton = page.getByRole('button', { name: /rejoin/i });
      await expect(rejoinButton).not.toBeVisible({ timeout: 2_000 });
    } finally {
      await fixture.cleanup();
    }
  });

  test('ended screen container has role="status" or aria-live for screen reader announcement', async ({
    page,
  }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('[role="heading"]', { timeout: 8_000 });

      const hasAriaAnnouncer = await page.evaluate(() => {
        const statusEl = document.querySelector('[role="status"]');
        const ariaLiveEl = document.querySelector('[aria-live]');
        const heading = Array.from(document.querySelectorAll('h1,h2,h3')).find(
          (el) => el.textContent?.toLowerCase().includes('this session has ended')
        );
        return !!(statusEl || ariaLiveEl || heading);
      });

      expect(
        hasAriaAnnouncer,
        '"This session has ended" must be reachable by screen readers — ' +
          'add role="status", aria-live, or use a heading element'
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  test('no broken or empty aria-label attributes on the ended screen', async ({ page }) => {
    const fixture = await navigateToEndedScreen(page);
    try {
      await page.waitForSelector('[role="heading"]', { timeout: 8_000 });

      const brokenAriaLabels = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('[aria-label]'));
        return elements
          .filter((el) => {
            const label = el.getAttribute('aria-label');
            return label === '' || label === null;
          })
          .map((el) => el.outerHTML.slice(0, 80));
      });

      expect(
        brokenAriaLabels,
        `Elements with empty aria-label found:\n${brokenAriaLabels.join('\n')}`
      ).toHaveLength(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
