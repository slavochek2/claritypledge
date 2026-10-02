/**
 * @file p1388-capture-controls.spec.ts
 * @description P1388 in a real browser with Chromium's fake microphone (a steady tone): the bar
 * pauses and resumes, stays up while paused, the level meter moves with input, the ⓘ opens,
 * and the stop control reads "Stop transcribing". Screenshots at 1280 / 375 / 320 go to
 * P1388_SHOTS (when set) for visual QA. Real-phone items (meter vs actual speech, USB-C
 * unplug, stored audio while paused) are UAT — a fake device cannot be unplugged.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

const SHOTS = process.env.P1388_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

test.describe('P1388: capture controls', () => {
  // Serial: three fake-microphone browsers in parallel left the meter flat at 375/320 in one
  // run (each passed alone) — contention, not the feature. One browser at a time.
  test.describe.configure({ mode: 'serial' });
  let attendee: TestUser;
  let event: TestEvent;

  test.beforeEach(async () => {
    attendee = await createTestUser({ name: 'P1388 Recorder' });
    event = await createTestEvent(attendee.user.id, new Date(), { title: 'P1388 E2E Event' });
    await rsvpToEvent(event.id, attendee.user.id);
  });

  test.afterEach(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (attendee?.user?.id) await deleteTestUser(attendee.user.id);
  });

  for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: '375', width: 375, height: 740 }, { name: '320', width: 320, height: 640 }]) {
    test(`pause, resume, meter, info and stop — ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setTestSession(page, attendee.email);
      await page.waitForLoadState('networkidle');
      await page.goto(`/events/${event.slug}/ready`);
      await page.getByRole('switch').click();
      await page.getByRole('button', { name: /continue/i }).click();
      const bar = page.getByTestId('room-capture-bar');
      await expect(bar).toBeVisible({ timeout: 15_000 });

      // The fake device plays a tone: the meter must light up.
      await expect.poll(async () => Number(await page.getByTestId('capture-level-meter').getAttribute('data-level')), { timeout: 10_000 }).toBeGreaterThan(0);
      await shot(page, `${vp.name}-1-running`);

      await bar.getByRole('button', { name: 'Pause' }).click();
      await expect(bar.getByText('Paused — not recording')).toBeVisible();
      await expect(page.getByTestId('capture-level-meter')).toHaveAttribute('data-level', '0');
      await shot(page, `${vp.name}-2-paused`);
      await page.waitForTimeout(3_000);
      await expect(bar.getByRole('button', { name: 'Resume' }), 'still paused — not auto-resumed').toBeVisible();

      await bar.getByRole('button', { name: 'Resume' }).click();
      await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible();

      await bar.getByRole('button', { name: 'About this recording' }).click();
      await expect(page.getByTestId('capture-info-sheet')).toBeVisible();
      await page.waitForTimeout(400); // let the popover's fade-in finish before the screenshot
      await shot(page, `${vp.name}-3-info`);
      await page.keyboard.press('Escape');

      await bar.getByRole('button', { name: 'Open' }).click();
      await expect(page.getByTestId('transcribe-room-screen')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: /stop transcribing/i }).filter({ visible: true })).toHaveCount(1);
      await shot(page, `${vp.name}-4-room`);
      await page.getByTestId('transcribe-room-screen').getByRole('button', { name: 'Pause' }).click();
      await shot(page, `${vp.name}-5-room-paused`);

      await page.getByRole('button', { name: /stop transcribing/i }).filter({ visible: true }).click();
    });
  }
});
