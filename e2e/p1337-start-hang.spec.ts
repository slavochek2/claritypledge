/**
 * @file p1337-start-hang.spec.ts
 * @description P1337 — founder report 2026-10-05: "I click Start and it just hangs on Grouping…".
 * The host's browser console showed the network changing and disconnecting mid-press
 * (net::ERR_NETWORK_CHANGED / ERR_INTERNET_DISCONNECTED). A request that never answers is what a
 * dropping VPN or venue Wi-Fi looks like to the page; the button must not wait for it forever.
 *
 * Reproduction: the start-round request is held with no answer. The button has to leave
 * "Grouping…" on its own and tell the host what happened, and when the round DID start (the answer
 * was lost, not the write), the panel must show that round instead of an error.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { openHostPreview, seedRoomMember } from './helpers/test-event-room';

test.describe('P1337 — Start never hangs on "Grouping…"', () => {
  test.describe.configure({ mode: 'serial' });
  let host: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ email: generateTestEmail(), name: 'P1337 Hang Host' });
    event = await createTestEvent(host.user.id, new Date(), { title: 'P1337 start hang e2e' });
    for (const name of ['Ann A', 'Bo B', 'Cid C', 'Dot D']) await seedRoomMember(event.id, { displayName: name });
  });

  test.afterAll(async () => {
    if (event) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  async function asHost(page: Page) {
    await setTestSession(page, host.email);
    await page.goto(`/events/${event.slug}/host`);
    await expect(page.getByTestId('host-room-count')).toHaveText('4 in the room');
  }

  test('a start request that never answers ends in a clear message, not an endless "Grouping…"', async ({ page }) => {
    await asHost(page);
    await page.route('**/rest/v1/rpc/host_start_round', () => { /* held: no answer, like a dropped connection */ });
    await openHostPreview(page);
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-preview-start')).toContainText('Starting');
    await expect(page.getByTestId('host-preview-start')).not.toContainText('Starting', { timeout: 30_000 });
    await expect(page.getByRole('alert')).toBeVisible();
    const { count } = await supabaseAdmin.from('event_rounds').select('id', { count: 'exact', head: true }).eq('event_id', event.id);
    expect(count).toBe(0);
  });

  test('when the round started but the answer was lost, the panel shows the round, not an error', async ({ page }) => {
    await asHost(page);
    // The write reaches the server; only its answer is lost on the way back.
    await page.route('**/rest/v1/rpc/host_start_round', async route => {
      await route.fetch();
      /* answer dropped */
    });
    await openHostPreview(page);
    await page.getByTestId('host-preview-start').click();
    await expect(page.getByTestId('host-round-title')).toHaveText('Round 1', { timeout: 30_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
