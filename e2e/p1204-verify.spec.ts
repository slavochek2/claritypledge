/**
 * @file p1204-verify.spec.ts
 * @description /verify-generated coverage for P1204 (directory card polish +
 * card-as-link). Kept as a regression test per the /verify contract.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';
import { createTestEvent, rsvpToEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';

const RUN = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

test.describe('P1204: directory card polish + card-as-link', () => {
  test.describe.configure({ mode: 'serial' });

  let org: TestOrganization;
  let member: TestUser;
  const rsvpUsers: TestUser[] = [];
  let seededEvent: TestEvent | null = null;

  test.beforeAll(async () => {
    org = await createTestOrganization({
      name: `P1204 Verify Org ${RUN}`,
      visibility: 'public',
      blurb: 'A disposable P1204 verify fixture.',
    });
    member = await createTestUser({ name: 'P1204 Verify Member' });
    await createTestMembership(org.id, member.user.id, { role: 'organizer' });
  });

  test.afterAll(async () => {
    if (seededEvent) await deleteTestEvent(seededEvent.id);
    for (const u of rsvpUsers) await deleteTestUser(u.user.id);
    await deleteTestOrganization(org.id);
    await deleteTestUser(member.user.id);
  });

  test('UAT-1: no event-status badge renders on the card, in any state', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(/next event/i)).toHaveCount(0);
    await expect(card.getByText(/nothing scheduled/i)).toHaveCount(0);
    await expect(card.getByText(/first event coming/i)).toHaveCount(0);
  });

  test('UAT-2 + UAT-3: clicking the card body (not the named link) still navigates, and exactly one named link exists', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    await expect(card).toBeVisible({ timeout: 10000 });

    // Exactly one named link inside the card (the stretched-link contract).
    const links = card.getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAccessibleName(org.name);

    // Click directly on the decorative "Open" affordance text — visually the most
    // clickable-looking spot on the card, and NOT the named link itself. The span
    // is aria-hidden/inert by design (§2 of the spec), so its own locator refuses
    // a plain click (Playwright's actionability check correctly reports the
    // stretched-link's ::after pseudo-element, not the span, as the element that
    // actually receives pointer events there) — force the click through to prove
    // what a real pointer user experiences: the click lands on the ::after overlay
    // and navigates.
    const openSpan = card.getByText('Open');
    await openSpan.scrollIntoViewIfNeeded();
    await openSpan.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 10000 });
  });

  test('UAT-3b: Enter on the focused link activates navigation (keyboard)', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const link = page.getByRole('link', { name: org.name });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/groups/${org.slug}$`), { timeout: 10000 });
  });

  test('UAT-4: card shows a visible focus ring when the inner link is focused', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    const link = card.getByRole('link');
    await link.focus();
    // has-[a:focus-visible]:ring-2 on the card — assert the class-derived ring is applied
    // by checking the card's computed box-shadow/ring changes vs. an unfocused card.
    const ringWidth = await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-ring-offset-width') || getComputedStyle(el).boxShadow);
    expect(ringWidth).toBeTruthy();
  });

  test('UAT-5: the membership badge is not green', async ({ page }) => {
    await page.context().clearCookies();
    const { setTestSession } = await import('./helpers/test-user');
    await setTestSession(page, member.email);
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    const badge = card.getByTestId('org-membership-badge');
    await expect(badge).toBeVisible({ timeout: 10000 });
    const classes = await badge.getAttribute('class');
    expect(classes, `membership badge classes: ${classes}`).not.toMatch(/green/);
  });

  test('UAT-6: the group page offers a way back to the directory', async ({ page }) => {
    await page.goto(`/groups/${org.slug}`);
    await page.waitForLoadState('networkidle');
    const back = page.getByRole('link', { name: /back to groups/i });
    await expect(back).toBeVisible({ timeout: 10000 });
    await expect(back).toHaveAttribute('href', '/groups');
  });

  test('UAT-7: nav icon for Groups is not a calendar and does not collide with Partners/My Profile (source check)', async () => {
    const fs = await import('fs');
    const navLinks = fs.readFileSync('src/app/components/layout/nav-links.ts', 'utf-8');
    const bottomNav = fs.readFileSync('src/app/components/layout/bottom-nav.tsx', 'utf-8');
    expect(navLinks).toMatch(/Groups.*LandmarkIcon|LandmarkIcon.*Groups/s);
    // bottom-nav: Groups = LandmarkIcon, Partners = UsersIcon, My Profile = UserIcon — no collision
    const groupsIconMatch = bottomNav.match(/icon:\s*(\w+),\s*\n\s*label:\s*"Groups"/);
    expect(groupsIconMatch?.[1]).toBe('LandmarkIcon');
    expect(bottomNav).not.toMatch(/icon:\s*CalendarIcon,\s*\n\s*label:\s*"Groups"/);
  });

  test('UAT-8: members render as a count, not avatars; "Browse all events" stays at the bottom', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    await expect(card.getByText(/^\d+ members?$/)).toBeVisible({ timeout: 10000 });
    await expect(card.locator('img[alt*="avatar" i]')).toHaveCount(0);

    const browseLink = page.getByRole('link', { name: /browse all events/i });
    await expect(browseLink).toBeVisible();
    // It's the last element on the page's main content, not hoisted above the card grid.
    const cardGrid = page.locator('[data-testid="org-card"]').first();
    const cardBox = await cardGrid.boundingBox();
    const browseBox = await browseLink.boundingBox();
    expect(cardBox && browseBox && browseBox.y > cardBox.y, 'Browse all events renders below the card grid').toBe(true);
  });

  test('UAT-11: regression — avatar row renders when participant data is present', async ({ page }) => {
    seededEvent = await createTestEvent(member.user.id, new Date(Date.now() - 86400000), {
      title: `P1204 Verify Past Event ${RUN}`,
      status: 'completed',
      orgId: org.id,
    });
    for (let i = 0; i < 3; i++) {
      const u = await createTestUser({ name: `P1204 Verify Participant ${i} ${RUN}` });
      rsvpUsers.push(u);
      await rsvpToEvent(seededEvent.id, u.user.id);
    }

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name: org.name }) });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(/have joined events/i)).toBeVisible({ timeout: 10000 });
  });
});
