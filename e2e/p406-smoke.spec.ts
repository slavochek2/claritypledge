/**
 * @file p406-smoke.spec.ts
 * @description Smoke tests for P406: Practice Rooms — Event-Native Session Start
 *
 * Fast regression checks:
 * 1. Event page loads with Practice Rooms section present — no JS errors (authenticated)
 * 2. Event page loads with Practice Rooms section present — no JS errors (anonymous)
 * 3. /live page is unmodified — no Practice Rooms UI leaked into /live
 * 4. Practice Rooms section renders below Participants (DOM order check)
 *
 * These catch regressions where:
 * - The PracticeRooms component throws on mount and crashes the event page
 * - Practice Rooms section is accidentally injected into /live page
 * - The section renders above Participants (layout regression)
 * - A console error is thrown during Practice Rooms polling initialization
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { mockMicPermission } from './helpers/test-realtime';

test.describe('P406 Smoke: Practice Rooms on event page', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. Authenticated: event page loads with Practice Rooms, no JS errors ───
  test('event page loads with Practice Rooms section — no console errors (authenticated)', async ({ page }) => {
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      host = await createTestUser({ name: 'P406 Smoke Auth Host' });
      event = await createTestEvent(host.user.id, undefined, {
        title: 'P406 Smoke Auth Event',
      });

      await setTestSession(page, host.email);
      await page.goto(`/events/${event.slug}`);
      await page.waitForLoadState('networkidle');

      // Should stay on the event page
      await expect(page).toHaveURL(`/events/${event.slug}`);

      // Practice Rooms section heading must be present
      await expect(
        page.getByRole('heading', { name: /practice rooms/i })
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors, `Console errors: ${appErrors.join('; ')}`).toHaveLength(0);
    } finally {
      if (event) await deleteTestEvent(event.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });

  // ── 2. Anonymous: event page loads with Practice Rooms, no JS errors ───────
  test('event page loads with Practice Rooms section — no console errors (anonymous)', async ({ page }) => {
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      host = await createTestUser({ name: 'P406 Smoke Anon Host' });
      event = await createTestEvent(host.user.id, undefined, {
        title: 'P406 Smoke Anon Event',
      });

      // Navigate without auth
      await page.goto(`/events/${event.slug}`);
      await page.waitForLoadState('networkidle');

      // Event heading present
      await expect(
        page.getByRole('heading', { name: event.title })
      ).toBeVisible({ timeout: 10000 });

      // Practice Rooms section present (section is always visible)
      await expect(
        page.getByRole('heading', { name: /practice rooms/i })
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors, `Console errors: ${appErrors.join('; ')}`).toHaveLength(0);
    } finally {
      if (event) await deleteTestEvent(event.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });

  // ── 3. /live page is unmodified — no Practice Rooms UI present ─────────────
  test('/live page has no Practice Rooms section (zero changes to /live)', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    await mockMicPermission(page);

    try {
      testUser = await createTestUser({ name: 'P406 Smoke LiveCheck' });
      await setTestSession(page, testUser.email);

      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // Practice Rooms section must NOT appear on /live
      await expect(
        page.getByRole('heading', { name: /practice rooms/i })
      ).not.toBeVisible({ timeout: 5000 });

      // /live primary action must still be present (no regression)
      await expect(
        page.getByRole('button', { name: /new session/i })
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 4. Practice Rooms renders below Participants (DOM order) ───────────────
  test('Practice Rooms section renders after Participants in the DOM', async ({ page }) => {
    let host: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let event: TestEvent | null = null;

    try {
      host = await createTestUser({ name: 'P406 Smoke Order Host' });
      event = await createTestEvent(host.user.id, undefined, {
        title: 'P406 Smoke Order Event',
      });

      await page.goto(`/events/${event.slug}`);
      await page.waitForLoadState('networkidle');

      // Both sections must be present
      const participantsHeading = page.getByText(/participants/i).first();
      const practiceRoomsHeading = page.getByRole('heading', { name: /practice rooms/i });

      await expect(participantsHeading).toBeVisible({ timeout: 10000 });
      await expect(practiceRoomsHeading).toBeVisible({ timeout: 10000 });

      // Get DOM positions — Practice Rooms must appear after Participants
      const participantsY = await participantsHeading.boundingBox().then(b => b?.y ?? 0);
      const practiceRoomsY = await practiceRoomsHeading.boundingBox().then(b => b?.y ?? 0);

      expect(practiceRoomsY).toBeGreaterThan(participantsY);
    } finally {
      if (event) await deleteTestEvent(event.id);
      if (host) await deleteTestUser(host.user.id);
    }
  });
});
