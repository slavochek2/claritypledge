/**
 * @file p1307-event-transcription.spec.ts
 * @description E2E for P1307 — event transcription across the ready screen, /meet, and
 * cross-page persistence. Written test-first: every test past the smoke check is expected
 * to fail until /dev builds Parts 1, 5 and 6 (which the spec requires ship together).
 *
 * Microphone: Playwright's fake media device flags, per docs/technical/e2e-testing-guide.md
 * conventions and CLAUDE.md's browser-tools guidance. `playwright.config.ts` currently sets
 * only `--use-fake-ui-for-media-stream` (verified this session) — `--use-fake-device-for-
 * media-stream` is added here via `test.use()` so this file does not depend on a config
 * change landing elsewhere first; flagged in the test report as a candidate to hoist into
 * the shared config once more P1307 E2E files need it.
 *
 * Real-device items (iPhone lock-screen resume T1/T3, phone-in-pocket screen-off T4) are
 * UAT-only (features/uat/p1307.md) — Playwright cannot lock a real device's screen.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test.describe('P1307: event transcription', () => {
  let attendee: TestUser;
  let event: TestEvent;
  const createdRoomIds: string[] = [];

  test.beforeEach(async () => {
    attendee = await createTestUser({ name: 'P1307 E2E Attendee' });
    event = await createTestEvent(attendee.user.id, new Date(), { title: 'P1307 E2E Event' });
    // The creator is also the host in createTestEvent's fixture shape (see test-event.ts) —
    // RSVP explicitly anyway so this test does not depend on host-equals-attendee, which
    // D10/Parent-verification-2's RSVP-or-host check would otherwise silently let through
    // for the wrong reason.
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterEach(async () => {
    for (const id of createdRoomIds) {
      try {
        await supabaseAdmin.from('transcribe_rooms').delete().eq('id', id);
      } catch {
        // Best-effort cleanup — a room that was never created (test failed before reaching
        // it) has nothing to delete, and that must not fail the teardown itself.
      }
    }
    createdRoomIds.length = 0;
    if (event?.id) await deleteTestEvent(event.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  test('smoke: the ready screen loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('switch')).toBeVisible({ timeout: 10_000 });
    expect(errors, `console errors on /events/${event.slug}/ready: ${errors.join('; ')}`).toEqual([]);
  });

  test('the switch is OFF by default (D12)', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);

    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Not transcribed')).toBeVisible();
  });

  test('switch on + Continue lands on /meet with the bar showing', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);

    await page.getByRole('switch').click();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 15_000 });
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 15_000 });
  });

  test('switch off + Continue lands on /meet with NO bar, and nothing captured', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 15_000 });
    await expect(page.getByText(/Transcribing for AI insights/i)).not.toBeVisible();

    const { data: members } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id')
      .eq('profile_id', attendee.user.id);
    expect(members ?? [], 'switch-off Continue must create no member row with consent for this event').toEqual([]);
  });

  test('going back to the ready screen and switching on starts capture from there', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 15_000 });

    // D10: a return visit must reach /ready again, not skip to /meet, because this person
    // is not yet being transcribed.
    await page.goto(`/events/${event.slug}/room`);
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/ready`), { timeout: 15_000 });

    await page.getByRole('switch').click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 15_000 });
  });

  async function reachCapturing(page: Page) {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('switch').click();
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 15_000 });
  }

  test('the bar persists across profile and feed navigation', async ({ page }) => {
    await reachCapturing(page);
    await page.goto('/feed');
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 10_000 });
    await page.goto(`/p/${attendee.slug}`);
    await expect(page.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 10_000 });
  });

  test('End session from the bar clears it and ends this person\'s capture', async ({ page }) => {
    await reachCapturing(page);
    await page.getByRole('button', { name: /end session/i }).click();
    await expect(page.getByText(/Transcribing for AI insights/i)).not.toBeVisible({ timeout: 10_000 });

    const { data: members } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('capture_ended_at')
      .eq('profile_id', attendee.user.id);
    expect(members?.[0]?.capture_ended_at, 'End session must set capture_ended_at server-side').not.toBeNull();
  });

  test('opening the room from the bar shows the room view with no second consent screen', async ({ page }) => {
    await reachCapturing(page);
    await page.getByRole('button', { name: /^open$/i }).click();
    await expect(page).toHaveURL(/\/transcribe\//, { timeout: 10_000 });
    // No consent screen: the switch/consent copy from the ready page must not reappear here.
    await expect(page.getByText('By continuing, you agree to our')).not.toBeVisible();
  });

  test('two tabs while transcribing: exactly one captures (Web Locks)', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['microphone'],
    });
    try {
      const pageA = await context.newPage();
      await reachCapturing(pageA);

      const pageB = await context.newPage();
      await setTestSession(pageB, attendee.email);
      await pageB.goto(`/events/${event.slug}/meet`);

      // Both tabs must show the bar (D9: visible wherever it is running), but only one may
      // actually be capturing. Web Locks state is not directly observable from Playwright
      // without a page hook, so this asserts the OBSERVABLE proxy: exactly one member row
      // for this profile+room (the join RPC is idempotent per profile), never two divergent
      // capture states server-side.
      await expect(pageB.getByText(/Transcribing for AI insights/i)).toBeVisible({ timeout: 10_000 });

      const { data: members } = await supabaseAdmin
        .from('transcribe_room_members')
        .select('id')
        .eq('profile_id', attendee.user.id);
      expect(members?.length, 'one profile must map to exactly one member row, regardless of tab count').toBe(1);
    } finally {
      await context.close();
    }
  });
});

// ── Real-device items — UAT only, not E2E ────────────────────────────────────
//
// T1 (resume after iPhone lock screen), T3 (iPhone hold-vs-release stream measurement),
// and T4 (phone-in-pocket, screen off, Android) all require a physical device Playwright
// cannot drive. See features/uat/p1307.md UAT-8.x.
