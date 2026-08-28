/**
 * @file p1060-review-renders.spec.ts
 * @description Produces the renders the P1060 BLIND REVIEWER judges (contract rows
 * UI-1 and UI-2). Not an assertion suite — it seeds the real states and photographs
 * them.
 *
 * SKIPPED unless P1060_RENDERS=1, so it never adds screenshot work to a normal
 * `npm run test:e2e`. Run it with:
 *   P1060_RENDERS=1 npx playwright test e2e/p1060-review-renders.spec.ts
 *
 * Why real states rather than mocked props: the contract says so, and it is the
 * point — "a component fed mock props certifies a screen the user never sees."
 * The signed-in render uses a real user session and a real membership row; the
 * zero-everything state is the actually-seeded `online` organization, not a stub.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';
import { createTestEvent, rsvpToEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

// Per-round output directory. The gate RE-HASHES every round's screenshots, so
// recapturing over an earlier round's files silently invalidates that round's
// recorded evidence — which is exactly what happened between rounds 1 and 2, and
// had to be recovered from git. Each round photographs into its own directory and
// nothing is ever overwritten.
const ROUND = process.env.P1060_ROUND ?? '1';
const OUT = `features/verification/p1060/renders/round-${ROUND}`;
const RUN = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

test.describe('P1060 reviewer renders', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!process.env.P1060_RENDERS, 'render capture — set P1060_RENDERS=1 to run');

  let org: TestOrganization;
  let pastOnlyOrg: TestOrganization;
  let member: TestUser;
  let host: TestUser;
  let p1: TestUser;
  let p2: TestUser;
  let upcoming: TestEvent;
  let past: TestEvent;
  let pastOnlyEvent: TestEvent;

  test.beforeAll(async () => {
    org = await createTestOrganization({
      name: `Clarity Practice Community · Sample ${RUN}`,
      visibility: 'public',
      hasEvents: true,
      blurb: 'Calibrated communication practice, in person.',
    });
    pastOnlyOrg = await createTestOrganization({
      name: `Clarity Practice Community · Past Only ${RUN}`,
      visibility: 'public',
      hasEvents: true,
      blurb: null,
    });
    member = await createTestUser({ name: 'Render Member' });
    host = await createTestUser({ name: 'Render Host' });
    p1 = await createTestUser({ name: 'Ada Lovelace' });
    p2 = await createTestUser({ name: 'Grace Hopper' });

    await createTestMembership(org.id, member.user.id, { role: 'member' });
    await createTestMembership(org.id, host.user.id, { role: 'organizer' });

    upcoming = await createTestEvent(host.user.id, new Date(Date.now() + 7 * 86_400_000), {
      title: 'Clarity Hike — Buddha Footprint Trail',
      orgId: org.id,
    });
    past = await createTestEvent(host.user.id, new Date(Date.now() - 20 * 86_400_000), {
      title: 'Clarity Dinner — Exploring Coordination',
      status: 'completed',
      orgId: org.id,
    });
    pastOnlyEvent = await createTestEvent(host.user.id, new Date(Date.now() - 12 * 86_400_000), {
      title: 'Clarity Run — Waterfall Loop',
      status: 'completed',
      orgId: pastOnlyOrg.id,
    });

    await rsvpToEvent(upcoming.id, p1.user.id);
    await rsvpToEvent(past.id, p2.user.id);
    await rsvpToEvent(past.id, member.user.id);

    // `createTestUser` hardcodes avatar_color '#4A90E2' for every fixture profile
    // (test-user.ts:178). Real profiles carry distinct colours, so a render left at
    // the default photographs three identical discs and certifies an avatar stack
    // nobody sees in production. Give each participant its own colour so the
    // reviewer is judging the real thing.
    const COLOURS = ['#3B82F6', '#0EA5E9', '#6366F1'];
    await Promise.all(
      [p1, p2, member].map((u, i) =>
        supabaseAdmin.from('profiles').update({ avatar_color: COLOURS[i] }).eq('id', u.user.id),
      ),
    );

    // Same reasoning for the event banner: EventCard renders its 16:9 banner only
    // when bannerUrl is set (EventCard.tsx:33), and `createTestEvent` never sets
    // one — so an un-bannered fixture makes a production card look like it has no
    // banner treatment at all. A repo-local asset keeps the render offline-safe.
    await Promise.all(
      [upcoming.id, past.id, pastOnlyEvent.id].map((id) =>
        supabaseAdmin.from('events').update({ banner_url: '/founder-photo.jpg' }).eq('id', id),
      ),
    );
  });

  test.afterAll(async () => {
    for (const e of [upcoming, past, pastOnlyEvent]) if (e?.id) await deleteTestEvent(e.id);
    for (const o of [org, pastOnlyOrg]) if (o?.id) await deleteTestOrganization(o.id);
    for (const u of [member, host, p1, p2]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('A — /org signed out, desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: org.name })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/A-org-signedout-desktop.png`, fullPage: true });
  });

  test('B — /org signed in as a member', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setTestSession(page, member.email);
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('org-membership-badge').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/B-org-signedin-member.png`, fullPage: true });
  });

  test('C — /org at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: org.name })).toBeVisible({ timeout: 15000 });
    // The reference calls 320px the most common overflow surface — confirm the
    // viewport actually took effect before the render is trusted (.claude/rules/browser.md).
    expect(await page.evaluate(() => window.innerWidth)).toBe(320);
    await page.screenshot({ path: `${OUT}/C-org-320.png`, fullPage: true });
  });

  test('C2 — /org at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: org.name })).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(375);
    await page.screenshot({ path: `${OUT}/C2-org-375.png`, fullPage: true });
  });

  test('D — org Events tab, Upcoming empty, falls through to Past', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/org/${pastOnlyOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Clarity Run — Waterfall Loop')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/D-org-upcoming-empty-fallthrough.png`, fullPage: true });
  });

  test('E — /org/online, nothing at all (the seeded day-one state)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/org/online');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Online/ })).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/E-org-online-empty.png`, fullPage: true });
  });

  test('F — org header with the participant row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/have joined events/)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/F-org-header-participants.png`, fullPage: true });
  });
});
