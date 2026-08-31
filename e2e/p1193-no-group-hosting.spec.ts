/**
 * @file p1193-no-group-hosting.spec.ts
 * @description P1193 Done-When: "Hosting an event with no group selected still works
 * end to end — verified by RUNNING it, not by reading the diff."
 *
 * WHY THIS FILE EXISTS. P1193 removes Co-create from the group-scoped events list, and
 * the only way to do that is to edit `actionButtons` in EventsList.tsx — the exact
 * component that renders the buttons for the STANDALONE list too. The spec names a
 * regression in this funnel as "the most expensive possible outcome" of the change:
 * a first-time host who belongs to no group has no other way in.
 *
 * Nothing else covers it. The P1060 suite asserts the standalone list still SHOWS
 * Host Event, and P1193's own suite asserts it still shows Co-create — but "the button
 * is visible" is not "the flow completes". Between the button and a saved row sit the
 * form, the submit handler, and an `org_id` that must come out NULL rather than
 * inheriting a group from context that isn't there. This drives the whole path.
 *
 * The org_id assertion is the load-bearing one. A created event that silently picked
 * up a group would look identical in the UI and be wrong in the database — and it is
 * the failure mode this diff could actually introduce, since P1193 touches how org
 * context reaches this component.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('P1193: hosting with no group still works end to end', () => {
  test.describe.configure({ mode: 'serial' });

  let host: TestUser;
  let createdEventId: string | null = null;
  const title = `P1193 No-Group Event ${Date.now()}`;

  test.beforeAll(async () => {
    // Deliberately a user with NO membership anywhere — the first-time host this
    // funnel exists for.
    host = await createTestUser({ name: 'P1193 No-Group Host' });
  });

  test.afterAll(async () => {
    if (createdEventId) await supabaseAdmin.from('events').delete().eq('id', createdEventId);
    if (host) await deleteTestUser(host.user.id);
  });

  test('the standalone list offers both ways in, for a user who belongs to no group', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto('/events/list');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /co-create/i })).toBeVisible();
  });

  test('creating an event with no group succeeds and stores org_id NULL', async ({ page }) => {
    await setTestSession(page, host.email);
    // No ?org= — this is the standalone entry point, the one P1193 must not disturb.
    await page.goto('/events/new');
    await page.waitForLoadState('networkidle');

    await page.locator('#title').fill(title);

    // Comfortably in the future so the event is "upcoming" regardless of timezone.
    const when = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await page.locator('#date').fill(when.toISOString().slice(0, 10));
    await page.locator('#time').fill('18:00');
    await page.locator('#location').fill('P1193 test location — no group');
    // Required, minimum 20 characters — the form refuses a shorter one, which is
    // how the first version of this test failed. Left long enough to be obviously
    // over the bound rather than exactly on it.
    await page.locator('#description').fill(
      'A P1193 regression fixture: an event created with no group selected, to prove the standalone hosting funnel still completes.',
    );

    await page.getByRole('button', { name: /publish event/i }).click();

    // Fail loudly on a validation refusal instead of waiting 20s for a row that was
    // never going to be written — a silent client-side rejection is the most likely
    // way this test breaks again, and the timeout hides which field caused it.
    await expect(
      page.locator('form').getByText(/must be at least|is required/i),
    ).toHaveCount(0, { timeout: 5000 });

    // The row is the evidence, not the toast: a UI that says "created" while the
    // insert failed is exactly the shape this test exists to refuse.
    await expect(async () => {
      const { data } = await supabaseAdmin
        .from('events')
        .select('id, org_id, host_id')
        .eq('title', title)
        .maybeSingle();
      expect(data, 'the event row must exist').not.toBeNull();
      createdEventId = data!.id;
      expect(data!.host_id, 'the creating user must be the host').toBe(host.user.id);
      // THE assertion. An event created outside any group must belong to no group —
      // not to whichever group happened to be in context.
      expect(data!.org_id, 'an event hosted with no group selected must store org_id NULL').toBeNull();
    }).toPass({ timeout: 20000 });
  });

  test('the created event is readable on the standalone list', async ({ page }) => {
    // End to end means it comes back out again, not just that a row landed.
    await page.goto('/events/list');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(title)).toBeVisible({ timeout: 15000 });
  });
});
