import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';

const BASE_URL = 'http://localhost:5100';
// Upcoming event in test DB (datetime 2026-05-27, not hosted by test user)
const TEST_EVENT_SLUG = 'sdfsd-asdf-sad-2026-05-17-wfli';
const EVENT_URL = `${BASE_URL}/events/${TEST_EVENT_SLUG}`;
const EVENTS_LIST_URL = `${BASE_URL}/events`;

test.describe('P844 — Reduce RSVP Friction', () => {
  let testUserId: string;
  let testUserEmail: string;

  test.beforeAll(async () => {
    const { user, email } = await createTestUser({ prefix: 'test-p844' });
    testUserId = user.id;
    testUserEmail = email;
  });

  test.afterAll(async () => {
    await deleteTestUser(testUserId);
  });

  test('UAT-1: Logged-out visitor sees "Reserve a seat" button label', async ({ page }) => {
    await page.goto(EVENT_URL);
    await expect(page.getByRole('button', { name: 'Reserve a seat' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Sign up to join' })).not.toBeVisible();
  });

  test('UAT-3: Header CTA hidden on /events/:slug', async ({ page }) => {
    await page.goto(EVENT_URL);
    await expect(page.getByRole('link', { name: 'Start a Clarity Session' })).not.toBeVisible({ timeout: 10000 });
  });

  test('UAT-4: Header CTA visible on /events list page (no regression)', async ({ page }) => {
    await page.goto(EVENTS_LIST_URL);
    await page.waitForTimeout(500);
    await expect(page.getByRole('link', { name: 'Start a Clarity Session' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('UAT-5: Practice Rooms card hidden for logged-out visitors', async ({ page }) => {
    await page.goto(EVENT_URL);
    await expect(page.getByText('Open a room')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Clarity Practice Rooms')).not.toBeVisible();
  });

  test('UAT-2: Logged-in non-attendee sees "Reserve a seat"', async ({ page }) => {
    await setTestSession(page, testUserEmail);
    await page.goto(EVENT_URL);
    await expect(page.getByRole('button', { name: 'Reserve a seat' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: "I'm going" })).not.toBeVisible();
  });

  test('UAT-6: Practice Rooms card visible for logged-in users (no regression)', async ({ page }) => {
    await setTestSession(page, testUserEmail);
    await page.goto(EVENT_URL);
    await expect(page.getByText('Open a room')).toBeVisible({ timeout: 10000 });
  });

  test('UAT-10: Sticky bar visible for non-host on mobile viewport', async ({ page }) => {
    await setTestSession(page, testUserEmail);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(EVENT_URL);
    await expect(page.locator('[data-testid="rsvp-sticky-bar"]')).toBeVisible({ timeout: 10000 });
  });
});
