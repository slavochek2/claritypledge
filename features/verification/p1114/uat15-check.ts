/** UAT-15: opt out, then opt in again — the change is visible to a second browser
 * (roster reflects the LATEST answer, both directions, without a reload).
 * Throwaway script. */
import { chromium } from '@playwright/test';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../../../e2e/helpers/test-event';

const BASE_URL = process.env.CAPTURE_BASE_URL || 'http://localhost:5200';

async function main() {
  const host = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT15 Host' });
  const event = await createTestEvent(host.user.id, new Date());
  const actor = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT15 Actor' });
  const viewer = await createTestUser({ email: generateTestEmail(), name: 'P1114 UAT15 Viewer' });
  await rsvpToEvent(event.id, actor.user.id);
  await rsvpToEvent(event.id, viewer.user.id);

  const browser = await chromium.launch();
  try {
    const actorCtx = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE_URL });
    const viewerCtx = await browser.newContext({ viewport: { width: 1024, height: 800 }, baseURL: BASE_URL });
    const actorPage = await actorCtx.newPage();
    const viewerPage = await viewerCtx.newPage();

    await setTestSession(actorPage, actor.email);
    await actorPage.goto(`${BASE_URL}/events/${event.slug}/meet`);
    await actorPage.waitForSelector('[data-testid="room-meet"]');

    await setTestSession(viewerPage, viewer.email);
    await viewerPage.goto(`${BASE_URL}/events/${event.slug}/meet`);
    await viewerPage.waitForSelector('[data-testid="room-meet"]');

    // Opt in — viewer should see the actor appear.
    await actorPage.getByTestId('room-opt-in-yes').click();
    await viewerPage.waitForFunction(
      (name) => document.querySelector('[data-testid="room-roster"]')?.textContent?.includes(name),
      'P1114 UAT15 Actor',
      { timeout: 20000 },
    );
    console.log('STEP 1 (opt in): actor appeared on viewer roster — PASS');

    // Opt out — viewer should see the actor disappear. Per Architecture Decision 2
    // (verified by e2e/integration/p1114-realtime-payload.spec.ts test (b)), Postgres
    // RLS correctly does NOT deliver the new opted_in=false state to a subscriber
    // realtime-side — the true->false transition is ONLY caught by the 30s
    // reconciliation poll (Decision 3), never by the realtime event content. Timeout
    // must exceed that poll interval.
    await actorPage.getByTestId('room-opt-in-no').click();
    await viewerPage.waitForFunction(
      (name) => !document.querySelector('[data-testid="room-roster"]')?.textContent?.includes(name),
      'P1114 UAT15 Actor',
      { timeout: 35000 },
    );
    console.log('STEP 2 (opt out): actor disappeared from viewer roster — PASS');

    // Opt in again — viewer should see the actor reappear.
    await actorPage.getByTestId('room-opt-in-yes').click();
    await viewerPage.waitForFunction(
      (name) => document.querySelector('[data-testid="room-roster"]')?.textContent?.includes(name),
      'P1114 UAT15 Actor',
      { timeout: 35000 },
    );
    console.log('STEP 3 (opt in again): actor reappeared on viewer roster — PASS');

    await actorCtx.close();
    await viewerCtx.close();
  } finally {
    await browser.close();
    await deleteTestEvent(event.id);
    await deleteTestUser(actor.user.id);
    await deleteTestUser(viewer.user.id);
    await deleteTestUser(host.user.id);
  }
  console.log('DONE');
}

main().catch((err) => { console.error(err); process.exit(1); });
