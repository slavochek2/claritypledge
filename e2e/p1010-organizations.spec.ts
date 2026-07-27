/**
 * @file p1010-organizations.spec.ts
 * @description E2E coverage for P1010 — Clarity Organizations community container.
 * Routes: /org/:slug (OrgPage), seeded orgs `cm` and `champions`.
 *
 * SELECTOR ASSUMPTIONS (flag to /dev — confirm or update before relying on green):
 *   - Tabs use role="tab" (mirrors the existing profile-page tab pattern, P465).
 *   - "Manage membership" is a dropdown whose items expose role="menuitem"; its
 *     Leave item opens the shared ConfirmDialog (role="dialog", Leave/Stay buttons).
 *   - Member count text matches /\d+\s+members?/i (exact copy not in the UI Contract
 *     — spec's ASCII mock "👥 6 members" is illustrative, not verbatim).
 *   - Organizer-first roster ordering is NOT asserted here — the seed migration's
 *     organizer row depends on a founder profile slug that may not exist in the
 *     test DB (Decision 9 caveat: "skips the membership INSERT instead of failing").
 *     That ordering is proven at the integration-test layer with a controlled fixture.
 *
 * UI Contract strings asserted verbatim: "Join as member", "Manage membership", "Leave",
 * "Clarity Organization Terms" (join gate at /org/:slug/join, NOT the About tab),
 * "Members accept these not legally binding terms as a shared intention.",
 * "Accept terms & join", "Be the first to join".
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

    // Founder-confirmed name: "Clarity Practice Community · Chiang Mai". Matched on the
    // distinguishing words rather than verbatim so a punctuation/locale tweak to the
    // separator does not fail a smoke test whose subject is "the page renders at all".
    await expect(page.getByRole('heading', { name: /clarity practice community/i })).toBeVisible({ timeout: 10000 });
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

    await expect(page.getByRole('button', { name: 'Join as member' })).toBeVisible();
  });

  test('About tab: describes the org and links to the terms without rendering them', async ({ page }) => {
    // Runs before the Join-flow test (serial mode) so `joiner` is still a non-member here.
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /about/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /^About / })).toBeVisible({ timeout: 10000 });
    // About NAMES the terms and links to the join gate — but never renders their body.
    await expect(page.getByRole('link', { name: 'Clarity Organization Terms' }))
      .toHaveAttribute('href', '/org/champions/join');
    await expect(
      page.getByText('Members accept these not legally binding terms as a shared intention.'),
    ).not.toBeVisible();
  });

  test('unauthenticated: Join opens the terms page; accepting redirects to /login', async ({ page }) => {
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    // Anyone may READ the terms — the account gate is on the accept action only.
    await page.getByRole('button', { name: 'Join as member' }).click();
    await expect(page).toHaveURL(/\/org\/champions\/join/);
    await expect(page.getByText('Clarity Organization Terms')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Accept terms & join' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Join flow: COA shows verbatim intro + title, accepting inserts a membership row', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join as member' }).click();
    await expect(page).toHaveURL(/\/org\/champions\/join/);

    // Decision 4: "The certificate title and all copy use 'Clarity Organization Terms.'"
    await expect(page.getByText('Clarity Organization Terms')).toBeVisible({ timeout: 10000 });
    // Decision 4: founder-approved single-party intro, verbatim, no name interpolation.
    // Renders as the page SUBTITLE above the certificate, not as a line inside it.
    await expect(
      page.getByText('Members accept these not legally binding terms as a shared intention.'),
    ).toBeVisible();

    const acceptBtn = page.getByRole('button', { name: 'Accept terms & join' });
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
    await expect(page.getByRole('button', { name: 'Manage membership' })).toBeVisible({ timeout: 10000 });
  });

  test('post-join: joiner appears on the Members roster as a PledgerCard', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /members/i }).click();
    await page.waitForLoadState('networkidle');

    // PledgerCard renders name as a heading and links to the member's PROFILE.
    // Founder decision: a roster card opens the person, not a pledge certificate.
    // Membership does not imply pledging — /p/:slug/pledge renders "not found" for
    // a member who never pledged (pledge-page.tsx guards on hasPledged), so the
    // old /p/:slug/pledge target was a dead link for most of the roster.
    await expect(page.getByRole('heading', { name: 'P1010 E2E Joiner' })).toBeVisible({ timeout: 10000 });
    // PledgerGrid renders each member twice (mobile carousel + desktop grid, one CSS-hidden —
    // the spec-mandated responsive pattern reused from /pledgers). A bare CSS a[href] selector
    // matches BOTH DOM copies (strict-mode violation); the role locator matches only the
    // visible one (display:none is excluded from the a11y tree). Assert the href on that.
    await expect(page.getByRole('link', { name: /P1010 E2E Joiner/ }))
      .toHaveAttribute('href', `/p/${joiner.slug}`);
  });

  test('Events tab: a logged-in visitor gets BOTH Co-create and Host Event', async ({ page }) => {
    // Founder decision: Co-create is an org action, not just a standalone destination,
    // so the embedded list keeps it alongside Host Event. Both are gated on being
    // logged in — a logged-out visitor gets "Sign Up to Host" instead, which is why
    // this needs a session and cannot be checked by browsing /org/cm signed out.
    await setTestSession(page, joiner.email);
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Events' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('link', { name: /co-create/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /host event/i })).toBeVisible();
  });

  test('roster is scoped per org: joiner (member of champions) does not appear on cm\'s roster', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /members/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'P1010 E2E Joiner' })).not.toBeVisible();
  });

  test('Leave flow: menu item opens a confirm dialog; Stay keeps the row, Leave removes it', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto('/org/champions');
    await page.waitForLoadState('networkidle');

    const membershipRow = async () => {
      const { data } = await supabaseAdmin
        .from('membership')
        .select('id')
        .eq('user_id', joiner.user.id)
        .maybeSingle();
      return data;
    };

    // Leaving deletes the membership row, which IS the COA acceptance record — so the
    // menu item must only OPEN the shared ConfirmDialog, never delete on its own.
    // Asserting the row survives is what makes this test fail against a one-click
    // Leave; without it, it would pass either way.
    await page.getByRole('button', { name: 'Manage membership' }).click();
    await page.getByRole('menuitem', { name: 'Leave' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await membershipRow(), 'opening the dialog must not delete the row').not.toBeNull();

    // Cancel must be a real escape hatch, not decoration.
    await dialog.getByRole('button', { name: 'Stay' }).click();
    await expect(dialog).not.toBeVisible();
    expect(await membershipRow(), 'cancelling must not delete the row').not.toBeNull();
    await expect(page.getByRole('button', { name: 'Manage membership' })).toBeVisible();

    await page.getByRole('button', { name: 'Manage membership' }).click();
    await page.getByRole('menuitem', { name: 'Leave' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Scoped to the dialog: "Leave" is also the menu item's name, so an unscoped
    // lookup could resolve to the wrong element and silently pass.
    await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();

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

    const joinBtn = page.getByRole('button', { name: 'Join as member' });
    await expect(joinBtn).toBeVisible({ timeout: 10000 });

    // Visibility alone is not enough. Closing a Radix dialog restores
    // document.body's pointer-events; if that cleanup is skipped the page renders
    // perfectly and accepts no clicks at all — and a visibility-only assertion goes
    // green on a frozen page. Assert the page is actually INTERACTIVE after leaving.
    // Polled, not read once: the cleanup runs in the dialog's unmount effect, which
    // is not guaranteed to have flushed the instant the Join button becomes visible.
    // A one-shot read goes red on correct code on a slow worker.
    await expect
      .poll(() => page.evaluate(() => document.body.style.pointerEvents), {
        timeout: 5000,
        message: 'body pointer-events must be released after the dialog closes',
      })
      .not.toBe('none');
    await joinBtn.click();
    await expect(page).toHaveURL(/\/org\/champions\/join$/);
  });

  test('Events tab: /org/cm embeds the events LIST (not the calendar); /org/champions has no Events tab', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    // The production /events/list surface, embedded — its Upcoming/Past filter tablist.
    await expect(page.getByRole('tablist', { name: 'Event filters' })).toBeVisible({ timeout: 10000 });
    // The Google Calendar embed belongs to /cm ONLY — it must never appear here.
    await expect(page.locator('iframe[src*="calendar.google.com"]')).toHaveCount(0);

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
    await expect(page.getByRole('button', { name: 'Join as member' })).not.toBeVisible();
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
