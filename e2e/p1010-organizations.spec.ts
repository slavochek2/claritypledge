/**
 * @file p1010-organizations.spec.ts
 * @description E2E coverage for P1010 — Clarity Organizations community container.
 * Routes: /org/:slug (OrgPage). ONE seeded org exists — `cm`. Every test needing a
 * no-events org builds a disposable `noEventsOrg` fixture instead. That used to be the
 * seeded `champions`, cut before it ever reached prod (founder decision, 2026-07-29);
 * depending on a second seeded org was the weaker pattern anyway, since it coupled the
 * suite's mutation target to whatever the migration happened to seed.
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
  test.describe.configure({ mode: 'serial' }); // shared orgs mutated by join/leave

  let joiner: TestUser;
  let noEventsOrg: TestOrganization;
  let emptyOrg: TestOrganization;
  let privateOrg: TestOrganization;

  test.beforeAll(async () => {
    joiner = await createTestUser({ name: 'P1010 E2E Joiner' });
    // The join/leave mutation target and the has_events=false case. A blurb is set
    // because the empty-roster branch renders it, and the About tab asserts a heading
    // of the form "About <name>" — both come from this row, not from a seeded org.
    noEventsOrg = await createTestOrganization({
      name: 'P1010 No Events Org',
      visibility: 'public',
      hasEvents: false,
    });
    emptyOrg = await createTestOrganization({ name: 'P1010 Empty Roster Org', visibility: 'public' });
    privateOrg = await createTestOrganization({ name: 'P1010 Private Org', visibility: 'private' });
  });

  test.afterAll(async () => {
    // Belt-and-suspenders: drop every membership this user holds in case a mid-suite
    // failure skipped its own cleanup, before deleting the user. Runs BEFORE the org
    // deletes so no membership row outlives the org it points at.
    await supabaseAdmin.from('membership').delete().eq('user_id', joiner.user.id);
    await deleteTestOrganization(noEventsOrg.id);
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

  test('default tab: a has_events org defaults to Events, a no-events org defaults to About', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /events/i })).toHaveAttribute('aria-selected', 'true');

    await page.goto(`/org/${noEventsOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tab', { name: /about/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('non-member sees Join CTA', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto(`/org/${noEventsOrg.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Join as member' })).toBeVisible();
  });

  test('About tab: describes the org and links to the terms without rendering them', async ({ page }) => {
    // Runs before the Join-flow test (serial mode) so `joiner` is still a non-member here.
    await setTestSession(page, joiner.email);
    await page.goto(`/org/${noEventsOrg.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /about/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /^About / })).toBeVisible({ timeout: 10000 });
    // About NAMES the terms and links to the join gate — but never renders their body.
    await expect(page.getByRole('link', { name: 'Clarity Organization Terms' }))
      .toHaveAttribute('href', `/org/${noEventsOrg.slug}/join`);
    await expect(
      page.getByText('Members accept these not legally binding terms as a shared intention.'),
    ).not.toBeVisible();
  });

  test('unauthenticated: Join opens the terms page; accepting redirects to /login', async ({ page }) => {
    await page.goto(`/org/${noEventsOrg.slug}`);
    await page.waitForLoadState('networkidle');

    // Anyone may READ the terms — the account gate is on the accept action only.
    await page.getByRole('button', { name: 'Join as member' }).click();
    await expect(page).toHaveURL(new RegExp(`/org/${noEventsOrg.slug}/join`));
    await expect(page.getByText('Clarity Organization Terms')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Accept terms & join' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Join flow: COA shows verbatim intro + title, accepting inserts a membership row', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto(`/org/${noEventsOrg.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join as member' }).click();
    await expect(page).toHaveURL(new RegExp(`/org/${noEventsOrg.slug}/join`));

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
    await page.goto(`/org/${noEventsOrg.slug}`);
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

  test('roster is scoped per org: a member of one org does not appear on another org\'s roster', async ({ page }) => {
    // A POSITIVE ANCHOR is the point of this fixture. Without a member known to be on
    // cm's roster, the negative assertion below is satisfied by any failure that yields
    // an empty roster — a no-op tab click, a failed get_organization_members, an org
    // that didn't load — including the exact over-tight-RLS collapse this test exists
    // to detect. Anchored, "absent" means absent rather than "nothing rendered at all".
    const cmMember = await createTestUser({ name: 'P1010 CM Only Member' });
    const { data: cmOrg } = await supabaseAdmin
      .from('organization').select('id').eq('slug', 'cm').single();
    await supabaseAdmin.from('membership').insert({ org_id: cmOrg!.id, user_id: cmMember.user.id });

    try {
      await page.goto('/org/cm');
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: /members/i }).click();
      await page.waitForLoadState('networkidle');

      // Filtered to the visible match — PledgerGrid renders the roster twice (mobile
      // carousel + desktop grid), so an unfiltered locator is a strict-mode violation.
      await expect(
        page.getByText('P1010 CM Only Member').filter({ visible: true }),
        'cm roster must actually render — otherwise the absence check below proves nothing',
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByRole('heading', { name: 'P1010 E2E Joiner' })).not.toBeVisible();
    } finally {
      await supabaseAdmin.from('membership').delete().eq('user_id', cmMember.user.id);
      await deleteTestUser(cmMember.user.id);
    }
  });

  test('Leave flow: menu item opens a confirm dialog; Stay keeps the row, Leave removes it', async ({ page }) => {
    await setTestSession(page, joiner.email);
    await page.goto(`/org/${noEventsOrg.slug}`);
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

    // The menu carries the same hazard as the dialog below: it is modal, so it sets
    // body pointer-events to "none", and Presence will not unmount it until an
    // animationend that never arrives in a hidden tab. Preventive rather than a
    // confirmed failure — asserted so a refactor cannot silently reintroduce it.
    const closedMenuAnimation = await page.getByRole('menu').evaluate((node) => {
      const clone = node.cloneNode(false) as HTMLElement;
      clone.setAttribute('data-state', 'closed');
      document.body.appendChild(clone);
      const name = getComputedStyle(clone).animationName;
      clone.remove();
      return name;
    });
    expect(closedMenuAnimation, 'the membership menu must not animate on close').toBe('none');

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

    // The confirm dialog's CLOSED state must not animate. Radix <Presence> keeps a
    // closing node mounted until `animationend` fires, and Chrome creates no CSS
    // animation objects in a hidden tab — so an exit animation here means that a
    // close landing while the tab is hidden (OrgHeader awaits a network round trip
    // before closing, so the window is hundreds of ms) strands the node forever, its
    // DismissableLayer never restores document.body's pointer-events, and the page
    // renders perfectly while accepting no clicks until reload. Confirmed by hand in
    // Chrome: getAnimations() === [] with animation-name still "exit".
    //
    // Asserted on a detached CLONE, not by flipping data-state on the live node —
    // mutating Radix's own state attribute mid-flight would corrupt the very state
    // machine under test. The clone carries the same classes, so the computed value
    // is the same CSS contract. This cannot be caught by the interaction assertions
    // below: Playwright's page is always visible, so the animation always completes
    // and the frozen-page condition never reproduces under test.
    const closedAnimation = await page.getByRole('dialog').evaluate((node) => {
      const clone = node.cloneNode(false) as HTMLElement;
      clone.setAttribute('data-state', 'closed');
      document.body.appendChild(clone);
      const name = getComputedStyle(clone).animationName;
      clone.remove();
      return name;
    });
    expect(
      closedAnimation,
      'ConfirmDialog must not animate on close — an exit animation strands the ' +
        'dialog (and body pointer-events: none) when the tab is hidden',
    ).toBe('none');

    // The OVERLAY needs its own assertion. It is a separate <Presence> subtree with its
    // own data-[state=closed]:animate-out, so it can strand independently of the content
    // above — and being `fixed inset-0 bg-black/80`, a stranded overlay covers the whole
    // viewport and swallows every click: the same frozen-page symptom, with the content
    // assertion still green. Dropping `overlayClassName` from ConfirmDialog while keeping
    // `className` would have passed this test before this assertion existed.
    const closedOverlayAnimation = await page.getByTestId('dialog-overlay').evaluate((node) => {
      const clone = node.cloneNode(false) as HTMLElement;
      clone.setAttribute('data-state', 'closed');
      document.body.appendChild(clone);
      const name = getComputedStyle(clone).animationName;
      clone.remove();
      return name;
    });
    expect(
      closedOverlayAnimation,
      'the dialog OVERLAY must not animate on close either — a stranded overlay ' +
        'covers the viewport and eats every click',
    ).toBe('none');

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
    await expect(page).toHaveURL(new RegExp(`/org/${noEventsOrg.slug}/join$`));
  });

  test('Events tab: /org/cm embeds the events LIST (not the calendar); a no-events org has no Events tab', async ({ page }) => {
    await page.goto('/org/cm');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /events/i }).click();
    // The production /events/list surface, embedded — its Upcoming/Past filter tablist.
    await expect(page.getByRole('tablist', { name: 'Event filters' })).toBeVisible({ timeout: 10000 });
    // The Google Calendar embed belongs to /cm ONLY — it must never appear here.
    await expect(page.locator('iframe[src*="calendar.google.com"]')).toHaveCount(0);

    await page.goto(`/org/${noEventsOrg.slug}`);
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

  test('/events redirect: community browsing lands on the org page, funnel traffic on the bare list', async ({ page }) => {
    await page.goto('/events');
    await expect(page).toHaveURL(/\/org\/cm$/, { timeout: 10000 });

    // Non-funnel query strings ride along — the redirect must not eat them.
    await page.goto('/events?utm_source=test');
    await expect(page).toHaveURL(/\/org\/cm\?utm_source=test$/, { timeout: 10000 });

    // Funnel traffic is EXCLUDED from the redirect. A visitor arriving from a cold
    // webinar email must not land on a Chiang Mai community page wrapped in a
    // "Join as member" CTA and About/Members tabs. This is a conversion choice, not a
    // technical limit: the filter itself survives the redirect fine (EventsList reads
    // useSearchParams, which is route-agnostic). Before this, the landing depended on
    // which URL happened to be in the email — /events/list?series= got the clean list
    // while /events?series= got the org page, for the same visitor in the same funnel.
    await page.goto('/events?series=lost-cofounders');
    await expect(page).toHaveURL(/\/events\/list\?series=lost-cofounders$/, { timeout: 10000 });
  });

  // The two signed-out UAT scenarios. Deliberately NO setTestSession call — these
  // assert what an anonymous visitor gets, so injecting a session would test the
  // opposite of the thing. Covered here rather than left to manual UAT per the
  // Auth E2E Coverage Rule (.claude/rules/tests.md).
  test('signed out: the roster is readable — no login wall on read', async ({ page }) => {
    const { data: org } = await supabaseAdmin
      .from('organization').select('id').eq('slug', 'cm').single();
    await supabaseAdmin.from('membership').insert({ org_id: org!.id, user_id: joiner.user.id });

    try {
      await page.goto('/org/cm');
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: /members/i }).click();

      // A seeded member must be VISIBLE to an anonymous reader. Asserting only the
      // absence of a login prompt would pass against an empty roster, which is the
      // exact failure an over-tight RLS policy produces.
      //
      // Filtered to the visible match: PledgerGrid renders the roster TWICE — a mobile
      // carousel (md:hidden) and a desktop grid — so the name is in the DOM twice and
      // an unfiltered locator is a strict-mode violation. `.first()` would be worse
      // than wrong: it resolves to the carousel copy, which is CSS-hidden at the
      // default desktop viewport, so the assertion would fail on correct code.
      await expect(
        page.getByText('P1010 E2E Joiner').filter({ visible: true }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: 'Join as member' })).toBeVisible();
    } finally {
      await supabaseAdmin.from('membership').delete().eq('user_id', joiner.user.id);
    }
  });

  test('signed out: reading the terms is open; only ACCEPT routes to login, with a way back', async ({ page }) => {
    await page.goto(`/org/${noEventsOrg.slug}/join`);
    await page.waitForLoadState('networkidle');

    // Reading the terms must NOT be gated — the login redirect fires on the accept
    // action, not on mount, so an anonymous visitor can read what they'd be agreeing
    // to before being asked for an account.
    await expect(page.getByText('Clarity Organization Terms')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Accept terms & join' }).click();

    // The `redirect` param IS the "way to return afterward" the UAT asks for; a bare
    // /login would strand the visitor on the home page after signing in.
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
    expect(
      decodeURIComponent(new URL(page.url()).searchParams.get('redirect') ?? ''),
      'login must carry the visitor back to the join page',
    ).toBe(`/org/${noEventsOrg.slug}/join`);
  });
});
