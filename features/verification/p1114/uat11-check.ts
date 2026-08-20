/** UAT-11 check: a REGISTERED (profile-linked) opt-in renders full name, avatar,
 * pledge ring, ear badge, and links to /p/:slug — not the walk-in-style seed used
 * in the blind-review screenshots. Throwaway script. */
import { chromium } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../../../e2e/helpers/test-event';

const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:5200';

async function main() {
  const host = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT11 Host' });
  const event = await createTestEvent(host.user.id, new Date());
  const visitor = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT11 Registered' });
  await rsvpToEvent(event.id, visitor.user.id);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE_URL });
    const page = await context.newPage();
    await setTestSession(page, visitor.email);

    await page.goto(`${BASE_URL}/events/${event.slug}/meet`);
    await page.waitForSelector('[data-testid="room-meet"]');
    await page.getByTestId('room-opt-in-yes').click();
    await page.waitForSelector('[data-testid="room-roster-item"]');
    await page.waitForTimeout(500);

    const rosterHtml = await page.getByTestId('room-roster').innerHTML();
    console.log('--- roster HTML ---');
    console.log(rosterHtml);

    const link = page.locator('[data-testid="room-roster-item"] a').first();
    const href = await link.getAttribute('href').catch(() => null);
    console.log('--- profile link href ---', href);

    await page.screenshot({ path: 'features/verification/p1114/screenshots/uat11-registered-roster.png' });
  } finally {
    await browser.close();
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
