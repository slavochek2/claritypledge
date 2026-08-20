/**
 * Throwaway capture script for the P1114 blind-reviewer rounds (goal-gate CHECK 5).
 * Seeds a registered attendee + a small roster, then screenshots EventRoomReady and
 * EventRoomMeet at 320/375/desktop. Not part of the permanent suite — deleted once
 * the review rounds are done.
 */
import { chromium } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../../../e2e/helpers/test-event';
import { seedRoomMember, deleteRoomMembers } from '../../../e2e/helpers/test-event-room';

const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:5200';
const OUT_DIR = 'features/verification/p1114/screenshots';

// Tall viewports + fullPage:false — meet-page has a position:fixed decision bar,
// which Playwright's fullPage compositing duplicates/overlaps onto the scrolled
// content (a capture artifact, not a real rendering bug). A single tall viewport
// avoids it while still showing the whole page in one shot.
const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: '320', width: 320, height: 1400 },
  { name: '375', width: 375, height: 1400 },
  { name: 'desktop', width: 1440, height: 1400 },
];

async function main() {
  const host = await createTestUser({ email: generateTestEmail(), name: 'P1114 Screenshot Host' });
  const event = await createTestEvent(host.user.id, new Date());
  const visitor = await createTestUser({ email: generateTestEmail(), name: 'P1114 Screenshot Visitor' });
  await rsvpToEvent(event.id, visitor.user.id);

  // A small, realistic-looking roster with pledged + unpledged mixed in, so the
  // reviewer is judging a populated room, not an empty one.
  const seeded = await Promise.all([
    seedRoomMember(event.id, { optedIn: true, displayName: 'Alicia Ferrante', profileId: null }),
    seedRoomMember(event.id, { optedIn: true, displayName: 'Marcus Boyle', profileId: null }),
    seedRoomMember(event.id, { optedIn: true, displayName: 'Priya Nakamura', profileId: null }),
  ]);

  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, baseURL: BASE_URL });
      const page = await context.newPage();
      await setTestSession(page, visitor.email);

      await page.goto(`${BASE_URL}/events/${event.slug}/ready`);
      await page.waitForSelector('[data-testid="room-ready"]');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT_DIR}/ready-${vp.name}.png`, fullPage: false });

      await page.goto(`${BASE_URL}/events/${event.slug}/meet`);
      await page.waitForSelector('[data-testid="room-meet"]');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT_DIR}/meet-${vp.name}.png`, fullPage: false });

      await context.close();
    }
    // Also grab the shipped standalone /ready and /meet for the reviewer to compare against.
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/ready`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT_DIR}/standalone-ready-${vp.name}.png`, fullPage: false });
      await page.goto(`${BASE_URL}/meet`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT_DIR}/standalone-meet-${vp.name}.png`, fullPage: false });
      await context.close();
    }
  } finally {
    await browser.close();
    await deleteRoomMembers(seeded.map((m) => m.id));
    await deleteTestEvent(event.id);
    await deleteTestUser(visitor.user.id);
    await deleteTestUser(host.user.id);
  }
  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
