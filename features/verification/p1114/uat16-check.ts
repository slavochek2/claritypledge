/** UAT-16/17 check: a return visit with readiness already set skips straight to
 * /meet; without it, lands on /ready. Throwaway script. */
import { chromium } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../../../e2e/helpers/test-event';

const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:5200';

async function main() {
  const host = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT16 Host' });
  const event = await createTestEvent(host.user.id, new Date());
  const visitorA = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT16 Readiness Set' });
  const visitorB = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT16 Readiness Unset' });
  await rsvpToEvent(event.id, visitorA.user.id);
  await rsvpToEvent(event.id, visitorB.user.id);

  const browser = await chromium.launch();
  try {
    // Visitor A: visits /ready, sets readiness via Continue, then RETURNS to /room.
    const contextA = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE_URL });
    const pageA = await contextA.newPage();
    await setTestSession(pageA, visitorA.email);
    await pageA.goto(`${BASE_URL}/events/${event.slug}/ready`);
    await pageA.waitForSelector('[data-testid="room-ready"]');
    await pageA.getByRole('button', { name: 'Continue' }).click();
    await pageA.waitForSelector('[data-testid="room-meet"]');
    console.log('A: reached /meet after Continue —', pageA.url());

    // Return visit — readiness is already set for this event now.
    await pageA.goto(`${BASE_URL}/events/${event.slug}/room`);
    await pageA.waitForLoadState('networkidle');
    console.log('A: return visit to /room resolved to —', pageA.url());
    await contextA.close();

    // Visitor B: never set readiness. First (and only) visit to /room.
    const contextB = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE_URL });
    const pageB = await contextB.newPage();
    await setTestSession(pageB, visitorB.email);
    await pageB.goto(`${BASE_URL}/events/${event.slug}/room`);
    await pageB.waitForLoadState('networkidle');
    console.log('B: first visit to /room (no readiness set) resolved to —', pageB.url());
    await contextB.close();
  } finally {
    await browser.close();
    await deleteTestEvent(event.id);
    await deleteTestUser(visitorA.user.id);
    await deleteTestUser(visitorB.user.id);
    await deleteTestUser(host.user.id);
  }
  console.log('DONE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
