/**
 * P1383 — an organizer can host from the group page on ANY tab, not only Events.
 * The founder, organizer of their group, opened it, did not find Host Event (it lived
 * only inside the Events tab) and hosted a general /events event instead.
 * SHOTS_DIR=<dir> also saves screenshots at 375 / 320 / desktop for visual review.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';

const SHOTS = process.env.SHOTS_DIR;

test.describe('P1383: Host event in the group header', () => {
  test.describe.configure({ mode: 'serial' });
  let org: TestOrganization;
  let organizer: TestUser;
  let member: TestUser;

  test.beforeAll(async () => {
    org = await createTestOrganization({ name: 'P1383 Host Org', visibility: 'public', hasEvents: true, blurb: 'Practising calibrated communication together, one evening at a time.' });
    organizer = await createTestUser({ name: 'P1383 Organizer' });
    member = await createTestUser({ name: 'P1383 Member' });
    await createTestMembership(org.id, organizer.user.id, { role: 'organizer' });
    await createTestMembership(org.id, member.user.id, { role: 'member' });
  });

  test.afterAll(async () => {
    await deleteTestOrganization(org.id);
    await deleteTestUser(organizer.user.id);
    await deleteTestUser(member.user.id);
  });

  test('organizer sees Host event on the About tab, carrying ?org=', async ({ page }) => {
    await setTestSession(page, organizer.email);
    await page.goto(`/groups/${org.slug}?tab=about`);
    const host = page.getByRole('link', { name: /host event/i });
    await expect(host).toBeVisible({ timeout: 10000 });
    await expect(host).toHaveAttribute('href', `/events/new?org=${org.slug}`);
    await page.getByRole('tab', { name: /members/i }).click();
    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible();
    // exactly one Host event on the page — the Events tab no longer duplicates it
    await page.getByRole('tab', { name: /events/i }).click();
    await expect(page.getByText('No events yet')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /host event/i })).toHaveCount(1);
    await expect(page.getByText(/join to hear/i)).not.toBeVisible();

    if (SHOTS) {
      for (const [w, h, name] of [[1280, 800, 'desktop'], [375, 812, '375'], [320, 700, '320']] as const) {
        await page.setViewportSize({ width: w, height: h });
        expect(await page.evaluate(() => window.innerWidth)).toBe(w);
        await page.screenshot({ path: `${SHOTS}/organizer-events-${name}.png`, fullPage: true });
      }
    }
  });

  test('plain member sees no Host event and the member empty copy', async ({ page }) => {
    await setTestSession(page, member.email);
    await page.goto(`/groups/${org.slug}?tab=events`);
    await expect(page.getByRole('button', { name: /invite/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /host event/i })).toHaveCount(0);
    await expect(page.getByText('The first event is being planned')).toBeVisible();
    await expect(page.getByText(/join to hear/i)).toHaveCount(0);
    if (SHOTS) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: `${SHOTS}/member-events-375.png`, fullPage: true });
    }
  });
});
