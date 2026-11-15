/**
 * @file p1529-inbox338-not-reaching.spec.ts
 * @description INBOX-338 (1) in a real browser with Chromium's fake microphone: while the audio
 * archive (storage.googleapis.com) refuses every request, as the bucket's CORS refusal did on
 * 2026-11-13, the recording bar says the audio is not reaching us; once requests get through
 * again, the very chunks that were held upload, the line goes away and recording carries on. The
 * unit tests fake the clock and the network; this one runs the real queue, the real signed-URL
 * calls and the real bar. The bar at this width is the short bar ("Audio not reaching us"); the
 * full line's wording ("Your audio isn't reaching us") is pinned by the unit tests.
 *
 * Run by hand and at ship only (about 4 minutes on shared TEST):
 *   P1529_BROWSER_CHECK=1 npx playwright test e2e/p1529-inbox338-not-reaching.spec.ts --project=chromium --retries=0
 *
 * Timing: a chunk is queued after its 30 s slice, and the line rises once the oldest audio not
 * received is more than 45 s old, so about 75-85 s after recording starts (5 s review tick).
 * After unblocking, the held chunk's next try comes within the 30 s retry cap (36 s with jitter),
 * and the line clears only once the backlog has caught up (oldest unsent audio 15 s old or less).
 * On a slow link that takes a while: one measured run needed 22 s to PUT one ~1 MB chunk, with new
 * chunks still arriving, and runs cleared 112-118 s after unblocking, so the waits are generous.
 *
 * Cost (metered-services rule 6), per run on TEST: 1 test user, 1 event, 1 room created and
 * deleted. While blocked: about 4 signed-URL edge-function calls (one per queue try; its 3 PUTs
 * reuse the URL and never leave the browser). After unblocking: one signed-URL call and one PUT
 * per held or new chunk, plus the tail chunk at the end (about 6-8 of each). One chunk-number
 * reservation per chunk (about 7). The live caption slices are answered inside the browser, so
 * no transcription is paid for. The uploaded chunks (about 1 MB each) stay in the archive under
 * the dev prefix, as every room e2e test's do.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

const ARCHIVE = '**://storage.googleapis.com/**';
const LIVE_SLICES = '**/functions/v1/transcribe-slice';
const fileOf = (url: string) => url.split('?')[0].split('/').pop() ?? '';

test.describe('INBOX-338 (1): audio that cannot reach us is said, and clears once it does', () => {
  test.skip(process.env.P1529_BROWSER_CHECK !== '1', 'By hand and at ship only: set P1529_BROWSER_CHECK=1 (about 4 minutes on TEST).');
  test.setTimeout(420_000);
  let recorder: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    recorder = await createTestUser({ name: 'INBOX-338 Recorder' });
    event = await createTestEvent(recorder.user.id, new Date(), { title: 'INBOX-338 E2E Event' });
    await rsvpToEvent(event.id, recorder.user.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (recorder?.user?.id) await deleteTestUser(recorder.user.id);
  });

  test('blocked archive: the bar says so after ~45 s of unsent audio, then the held chunks arrive and it clears', async ({ page }) => {
    let blocked = true;
    const held = new Set<string>();       // chunk files refused while blocked
    const arrived = new Set<string>();    // chunk files the archive accepted (PUT 2xx)
    // A timeline of archive requests, upload logs and the bar, printed only when the test fails.
    const t0 = Date.now();
    const timeline: string[] = [];
    const note = (m: string) => timeline.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
    await page.route(ARCHIVE, async (route) => {
      const file = fileOf(route.request().url());
      if (blocked) { held.add(file); note(`refused ${route.request().method()} ${file}`); await route.abort('failed'); return; }
      note(`passed ${route.request().method()} ${file}`);
      await route.continue();
    });
    // Live captions are not under test: answer each slice as a silent one ({} carries no destination), so no transcription is paid for.
    await page.route(LIVE_SLICES, (route) => route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'content-type': 'application/json' },
      body: '{}',
    }));
    page.on('response', (r) => {
      if (!/storage\.googleapis\.com/.test(r.url()) || r.request().method() !== 'PUT') return;
      note(`PUT ${r.status()} ${fileOf(r.url())}`);
      if (r.ok()) arrived.add(fileOf(r.url()));
    });
    page.on('console', (m) => { if (/room-capture|ML Upload/.test(m.text())) note(`browser ${m.type()}: ${m.text().slice(0, 160)}`); });

    await setTestSession(page, recorder.email);
    await page.waitForLoadState('networkidle');
    // startTranscribingInRoom's steps, inline, so the clock starts at the Transcribe click: never later than recording starts
    // (the measured rise time is not shorter than the real one), and not before the page setup (which would hide an early rise).
    await page.goto(`/events/${event.slug}/ready`);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 15_000 });
    const started = Date.now();
    await page.getByTestId('room-transcribe-start').click();
    const bar = page.getByTestId('room-capture-bar');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const notReaching = bar.getByText('Audio not reaching us', { exact: true });
    const watch = setInterval(() => { void bar.textContent().then((t) => note(`bar: ${t?.slice(0, 60)}`), () => {}); }, 5_000);
    try {
      // The first chunk is cut at 30 s and fails: one short failure is not shown (F5).
      await expect.poll(() => held.size, { timeout: 60_000, message: 'the first chunk tried to upload and was refused' }).toBeGreaterThan(0);
      await expect(notReaching, 'a fresh failure is not shown yet').toHaveCount(0);

      // Unsent audio older than 45 s: the line appears.
      await expect(notReaching).toBeVisible({ timeout: 90_000 });
      const raisedAfterS = Math.round((Date.now() - started) / 1000);
      expect(raisedAfterS, 'not raised before the oldest unsent audio is 45 s old').toBeGreaterThanOrEqual(70);
      expect(arrived.size, 'nothing reached the archive while blocked').toBe(0);

      // The archive accepts requests again: every held chunk arrives, the line clears, and recording carries on.
      blocked = false;
      const heldChunks = [...held];
      await expect.poll(() => heldChunks.filter((f) => !arrived.has(f)), { timeout: 120_000, message: 'every chunk refused while blocked reached the archive' }).toEqual([]);
      await expect(notReaching).toHaveCount(0, { timeout: 150_000 });
      await expect(bar.getByText('Transcribing', { exact: true }), 'still recording after the outage').toBeVisible();
      console.log(`INBOX-338 browser check: raised after ${raisedAfterS}s; held ${heldChunks.join(', ')}; all arrived; cleared ${Math.round((Date.now() - started) / 1000)}s after start, ${arrived.size} chunks in the archive`);

      // Stop, and let the tail chunk upload before teardown deletes the room: its recording row is written only after the
      // last chunk's PUT (uploadRoomAudioChunk, isLastChunk), so that request marks the tail as uploaded.
      const tailSaved = page.waitForResponse((r) => /\/rest\/v1\/ml_training_sessions/.test(r.url()) && r.request().method() === 'POST', { timeout: 90_000 });
      await page.getByRole('button', { name: /stop transcribing/i }).filter({ visible: true }).first().click();
      await tailSaved;
    } catch (err) {
      console.log(`TIMELINE\n${timeline.join('\n')}`);
      throw err;
    } finally {
      clearInterval(watch);
    }
  });
});
