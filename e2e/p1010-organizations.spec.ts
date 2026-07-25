/**
 * @file p1010-organizations.spec.ts
 * @description E2E coverage for P1010 — Clarity Organizations community container.
 * Routes: /org/:slug (OrgPage), seeded orgs `cm` and `champions`.
 *
 * SELECTOR ASSUMPTIONS (flag to /dev — confirm or update before relying on green):
 *   - Tabs use role="tab" (mirrors the existing profile-page tab pattern, P465).
 *   - "Manage membership ▾" is a dropdown whose items expose role="menuitem".
 *   - Member count text matches /\d+\s+members?/i (exact copy not in the UI Contract
 *     — spec's ASCII mock "👥 6 members" is illustrative, not verbatim).
 *   - Organizer-first roster ordering is NOT asserted here — the seed migration's
 *     organizer row depends on a founder profile slug that may not exist in the
 *     test DB (Decision 9 caveat: "skips the membership INSERT instead of failing").
 *     That ordering is proven at the integration-test layer with a controlled fixture.
 *
 * UI Contract strings asserted verbatim: "Join", "Manage membership ▾", "Leave",
 * "You're not a member yet", "Clarity Organization Agreement",
 * "By joining this clarity organization, I commit to every other member:",
 * "I Accept & Join", "Be the first to join".
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import {
  createTestOrganization,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';

test.describe('P1010: Clarity Organizations — /org/:slug', () => {
  test.describe.configure({ mode: 'serial' }); // shared seeded orgs (cm/champions) mutated by join/leave

  let joiner: TestUser;
  let emptyOrg: TestOrganization;
  let privateOrg: TestOrganization;

  test.beforeAll(async () => {
    joiner = await createTestUser({ name: 'P1010 E2E Joiner' });
    emptyOrg = await createTestOrganization({ name: 'P1010 Empty Roster Org', visibility: 'public' });
    privateOrg = await createTestOrganization({ name: 'P1010 Private Org', visibility: 'private' });
  });

  test.afterAll(async () => {
    // Belt-and-suspenders: remove joiner's membership from cm/champions in case a
    // mid-suite failure skipped its own cleanup, before deleting the user.
    await supabaseAdmin.from('membership').delete().eq('user_id', joiner.user.id);
    await deleteTestOrganization(emptyOrg.id);
    await deleteTestOrganization(privateOrg.id);
    await deleteTestUser(joiner.user.id);
  });

  test('smoke: /org/cm loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    // TODO(/dev): confirm the org name heading selector once OrgHeader exists.
    await expect(page.getByRole('heading', { name: /clarity community/i })).toBeVisible({ timeout: 10000 });
    expect(errors, `Console errors on /org/cm: ${errors.join(', ')}`).toEqual([]);
  });

  test('default tab: /org/cm defaults to Events, /org/champions defaults to About', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /events/i })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /about/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('non-member sees Join CTA', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  });

  test('About tab: non-member sees the "You\'re not a member yet" note above the pending COA', async ({ page }) => {
    // Runs before the Join-flow test (serial mode) so `joiner` is still a non-member here.
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /about/i }).click();
    await page.waitForLoadState('networkidle');

    // UI Contract, verbatim (short form — the "…join to accept the oath." tail was cut).
    await expect(page.getByText("You're not a member yet")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Clarity Organization Agreement')).toBeVisible();
  });

  test('unauthenticated Join click redirects to /login', async ({ page }) => {
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Join flow: COA shows verbatim intro + title, accepting inserts a membership row', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join' }).click();

    // Decision 4: "The certificate title and all copy use 'Clarity Organization Agreement.'"
    await expect(page.getByText('Clarity Organization Agreement')).toBeVisible({ timeout: 10000 });
    // Decision 4: founder-approved single-party intro, verbatim, no name interpolation.
    await expect(
      page.getByText('By joining this clarity organization, I commit to every other member:'),
    ).toBeVisible();

    const acceptBtn = page.getByRole('button', { name: 'I Accept & Join' });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Verify the DB row landed — the row IS the acceptance record (Decision 3).
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from('membership')
          .select('id')
          .eq('user_id', joiner.user.id)
          .maybeSingle();
        return !!data;
      }, { timeout: 10000 })
      .toBe(true);

    // CTA swaps to the member state (the visible boundary, per UX Notes).
    await expect(page.getByRole('button', { name: 'Manage membership ▾' })).toBeVisible({ timeout: 10000 });
  });

  test('post-join: joiner appears on the Members roster as a PledgerCard', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /members/i }).click();
    await page.waitForLoadState('networkidle');

    // PledgerCard renders name as a heading and links to /p/:slug (pledger-card.tsx).
    await expect(page.getByRole('heading', { name: 'P1010 E2E Joiner' })).toBeVisible({ timeout: 10000 });
    // PledgerGrid renders each member twice (mobile carousel + desktop grid, one CSS-hidden —
    // the spec-mandated responsive pattern reused from /pledgers). A bare CSS a[href] selector
    // matches BOTH DOM copies (strict-mode violation); the role locator matches only the
    // visible one (display:none is excluded from the a11y tree). Assert the href on that.
    await expect(page.getByRole('link', { name: /P1010 E2E Joiner/ }))
      .toHaveAttribute('href', `/p/${joiner.slug}/pledge`);
  });

  test('roster is scoped per org: joiner (member of champions) does not appear on cm\'s roster', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /members/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'P1010 E2E Joiner' })).not.toBeVisible();
  });

  test('Leave flow: removes membership row and reverts CTA to Join', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Manage membership ▾' }).click();
    // TODO(/dev): confirm menuitem vs plain button role for "Leave" once the dropdown exists.
    await page.getByRole('menuitem', { name: 'Leave' }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from('membership')
          .select('id')
          .eq('user_id', joiner.user.id)
          .maybeSingle();
        return data;
      }, { timeout: 10000 })
      .toBeNull();

    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible({ timeout: 10000 });
  });

  test('Events tab: /org/cm shows the calendar embed; /org/champions has no Events tab', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    // chiang-mai-page.tsx embeds a Google Calendar iframe (buildEmbedUrl).
    await expect(page.locator('iframe[src*="calendar.google.com"]')).toBeVisible({ timeout: 10000 });

    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /events/i })).not.toBeVisible();
  });

  test('regression guard: /cm standalone calendar embed still works unchanged', async ({ page }) => {
    await page.goto('/cm');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('iframe[src*="calendar.google.com"]')).toBeVisible({ timeout: 10000 });
  });

  test('edge case: nonexistent org slug renders a not-found state, not a create flow', async ({ page }) => {
    await page.goto('/org/this-slug-does-not-exist');
    await page.waitForLoadState('networkidle');
    // TODO(/dev): confirm exact not-found copy once OrgPage's unknown-slug branch exists.
    await expect(page.getByText(/not found|doesn't exist|no such organization/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Join' })).not.toBeVisible();
  });

  test('edge case: a private org is not publicly viewable', async ({ page }) => {
    await page.goto(`/org/${privateOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: privateOrg.name })).not.toBeVisible();
  });

  test('edge case: empty roster shows the org blurb + "Be the first to join" prompt, not a blank grid', async ({ page }) => {
    await page.goto(`/org/${emptyOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /members/i }).click();
    await page.waitForLoadState('networkidle');

    // UI Contract, verbatim.
    await expect(page.getByText('Be the first to join')).toBeVisible({ timeout: 10000 });
  });
});
