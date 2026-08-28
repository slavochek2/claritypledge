/**
 * @file p1060-org-directory.spec.ts
 * @description E2E coverage for P1060's `/org` directory (Solution item 5,
 * D5). Lists every visibility='public' organization; links to each; readable
 * signed-out; never a creation surface (closing the p1010 Decision 7 gap by
 * name — decisions.md 2026-07-23).
 *
 * SELECTOR ASSUMPTIONS (flag to /dev — confirm or update before relying on
 * green): the directory page has no implementation yet (App.tsx defines only
 * /org/:slug and /org/:slug/join). Assumed:
 *   - Route: /org (bare, no slug)
 *   - Each org renders as role="link" with its name as accessible name,
 *     href="/org/<slug>"
 *   - No element with an accessible name matching /create.*organization/i
 *   - Participant/member counts render in the same verbatim pattern as the
 *     org header ("N have joined events" — Solution item 8; "N members" per
 *     p1010's existing convention, confirmed non-verbatim in
 *     p1010-organizations.spec.ts's own selector-assumptions comment)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';

/** Per-run suffix — see the note in e2e/a11y/p1060-accessibility.spec.ts. */
const RUN = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

test.describe('P1060: /org directory', () => {
  test.describe.configure({ mode: 'serial' });

  let publicOrgWithBlurb: TestOrganization;
  let publicOrgNoBlurb: TestOrganization;
  let privateOrg: TestOrganization;
  let member: TestUser;

  test.beforeAll(async () => {
    publicOrgWithBlurb = await createTestOrganization({
      name: `P1060 Directory Org — With Blurb ${RUN}`,
      visibility: 'public',
      blurb: 'A disposable directory-listing fixture with a blurb.',
    });
    publicOrgNoBlurb = await createTestOrganization({
      name: `P1060 Directory Org — No Blurb ${RUN}`,
      visibility: 'public',
      blurb: null,
    });
    privateOrg = await createTestOrganization({
      name: `P1060 Directory Org — Private (must never list) ${RUN}`,
      visibility: 'private',
    });
    member = await createTestUser({ name: 'P1060 Directory Member' });
    await createTestMembership(publicOrgWithBlurb.id, member.user.id, { role: 'member' });
  });

  test.afterAll(async () => {
    await deleteTestOrganization(publicOrgWithBlurb.id);
    await deleteTestOrganization(publicOrgNoBlurb.id);
    await deleteTestOrganization(privateOrg.id);
    await deleteTestUser(member.user.id);
  });

  test('smoke: /org loads with no console errors, readable signed out', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: publicOrgWithBlurb.name })).toBeVisible({ timeout: 10000 });
    expect(errors, `Console errors on /org: ${errors.join(', ')}`).toEqual([]);
  });

  test('mechanical check: /org is registered in PROD_HEALTH_ROUTES (Risk item, Done-When)', async () => {
    const { PROD_HEALTH_ROUTES } = await import('./helpers/prod-health');
    expect(PROD_HEALTH_ROUTES, '/org must ship in the same diff that adds this public route').toContain('/org');
  });

  test('lists every public organization and links to /org/:slug', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: publicOrgWithBlurb.name }))
      .toHaveAttribute('href', `/org/${publicOrgWithBlurb.slug}`);
    await expect(page.getByRole('link', { name: publicOrgNoBlurb.name }))
      .toHaveAttribute('href', `/org/${publicOrgNoBlurb.slug}`);
  });

  test('a private organization never appears on the public directory', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(privateOrg.name)).not.toBeVisible();
  });

  test('directory card omits the blurb line entirely for a NULL blurb (D7), no placeholder string', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('A disposable directory-listing fixture with a blurb.')).toBeVisible({ timeout: 10000 });
    const noBlurbCard = page
      .locator('[data-testid="org-card"]')
      .filter({ has: page.getByRole('link', { name: publicOrgNoBlurb.name }) });
    await expect(noBlurbCard).toBeVisible();
    await expect(noBlurbCard.getByText('A Clarity Organization.')).not.toBeVisible();
  });

  test('no create-organization affordance appears, signed out or signed in', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /create.*organization/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /create.*organization/i })).toHaveCount(0);

    await setTestSession(page, member.email);
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /create.*organization/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /create.*organization/i })).toHaveCount(0);
  });

  test('signed-in member sees a membership indicator on their org\'s card; signed-out does not', async ({ page }) => {
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    // TIGHTENED BY /dev. The generated assertion was `card.getByText(/member/i)`,
    // which cannot express the claim: every card carries a member COUNT ("1 member"),
    // so /member/i is visible signed out by design and the test could only pass by
    // the card omitting the count the spec requires it to show. The claim being
    // asserted is Screen B's — the ONLY signed-in delta is a membership badge — so
    // it binds to the badge itself. Card scope is the [data-testid="org-card"]
    // ancestor rather than `.locator('..')`, which depended on unstated DOM nesting.
    const cardFor = (name: string) =>
      page.locator('[data-testid="org-card"]').filter({ has: page.getByRole('link', { name }) });

    await expect(cardFor(publicOrgWithBlurb.name)).toBeVisible({ timeout: 10000 });
    await expect(cardFor(publicOrgWithBlurb.name).getByTestId('org-membership-badge')).toHaveCount(0);
    // The member count IS still shown signed out — asserted positively so that
    // "no badge" can never be satisfied by rendering an empty card.
    await expect(cardFor(publicOrgWithBlurb.name).getByText(/^\d+ members?$/)).toBeVisible();

    await setTestSession(page, member.email);
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    await expect(cardFor(publicOrgWithBlurb.name).getByTestId('org-membership-badge'))
      .toBeVisible({ timeout: 10000 });
  });

  test('renders without horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/org');
    await page.waitForLoadState('networkidle');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth, 'no horizontal overflow at 320px').toBeLessThanOrEqual(321);
  });
});
