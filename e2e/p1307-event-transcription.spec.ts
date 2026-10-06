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
import { startTranscribingInRoom } from './helpers/test-event-room';

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

    await expect(page.getByTestId('room-ready-continue')).toBeVisible({ timeout: 10_000 });
    expect(errors, `console errors on /events/${event.slug}/ready: ${errors.join('; ')}`).toEqual([]);
  });

  test('the ready screen has no switch; the room offers "Transcribe", nothing pre-selected (D12, walkthrough 7)', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await expect(page.getByTestId('room-ready-continue')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByTestId('room-transcribe-idle')).toContainText('Not transcribing');
    await expect(page.getByTestId('room-capture-bar')).toHaveCount(0);
  });

  test('"Transcribe" in the room starts capture: the running bar replaces it', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await startTranscribingInRoom(page, event.slug);
    await expect(page.getByTestId('room-transcribe-idle')).toHaveCount(0);
  });

  test('Continue alone lands on /meet with NO bar, and nothing captured', async ({ page }) => {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 15_000 });
    await expect(page.getByTestId('room-capture-bar')).not.toBeVisible();

    const { data: members } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('id')
      .eq('profile_id', attendee.user.id);
    expect(members ?? [], 'Continue without the Transcribe tap must create no member row with consent for this event').toEqual([]);
  });

  async function reachCapturing(page: Page) {
    await setTestSession(page, attendee.email);
    await page.waitForLoadState('networkidle');
    await startTranscribingInRoom(page, event.slug);
  }

  // /dev (KDD 2026-09-14): the bar can show while every slice is refused. The test project
  // serves the DEPLOYED transcribe-slice, and until this branch's version is deployed there a
  // 13 s slice (416 KB) is over main's 320 KB bound and returns 400. Nothing else in this file
  // looks at a slice response, so the whole suite stayed green. Expected red on the test
  // project until transcribe-slice is deployed to it.
  test('a live slice sent while transcribing is accepted by transcribe-slice', async ({ page }) => {
    test.setTimeout(60_000);
    const sliceResponse = page.waitForResponse(
      // An AUDIO slice only: the pre-warm call posts {warmup: true} to the same function and
      // is accepted even when real slices are refused — this test passed on it once.
      (r) => r.url().includes('/functions/v1/transcribe-slice')
        && r.request().method() === 'POST'
        && (r.request().postData() ?? '').includes('"audio"'),
      { timeout: 45_000 },
    );
    await reachCapturing(page);
    const response = await sliceResponse;
    expect(response.status(), `transcribe-slice refused the slice: ${await response.text()}`).toBeLessThan(300);
  });

  test('the bar persists across profile and feed navigation', async ({ page }) => {
    await reachCapturing(page);
    await page.goto('/feed');
    await expect(page.getByTestId('room-capture-bar')).toBeVisible({ timeout: 10_000 });
    await page.goto(`/p/${attendee.slug}`);
    await expect(page.getByTestId('room-capture-bar')).toBeVisible({ timeout: 10_000 });
  });

  test('Stop transcribing from the bar clears it and ends this person\'s capture', async ({ page }) => {
    await reachCapturing(page);
    await page.getByRole('button', { name: /stop transcribing/i }).click();
    await expect(page.getByTestId('room-capture-bar')).not.toBeVisible({ timeout: 10_000 });

    const { data: members } = await supabaseAdmin
      .from('transcribe_room_members')
      .select('capture_ended_at')
      .eq('profile_id', attendee.user.id);
    expect(members?.[0]?.capture_ended_at, 'End session must set capture_ended_at server-side').not.toBeNull();
  });

  test('opening the room from the bar shows the room view with no second consent screen', async ({ page }) => {
    await reachCapturing(page);
    await page.getByTestId('room-capture-bar-open').click();
    await expect(page).toHaveURL(/\/transcribe\//, { timeout: 10_000 });
    // No consent screen: the switch/consent copy from the ready page must not reappear here.
    // Founder, 2026-09-14: the ready-screen line now reads "Transcription follows our …".
    await expect(page.getByText('Transcription follows our')).not.toBeVisible();
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
      await expect(pageB.getByTestId('room-capture-bar')).toBeVisible({ timeout: 10_000 });

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
