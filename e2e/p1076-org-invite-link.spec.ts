/**
 * @file p1076-org-invite-link.spec.ts
 * @description E2E coverage for P1076 — Org invite link (share to join).
 * Extends P1010's OrgPage/OrgJoinPage: an Invite entry point for members, an
 * unauthenticated-visitor auto-join path through AuthCallbackPage, and a
 * dismissible post-join prompt. Routes: /org/:slug (OrgPage), /org/:slug/join
 * (OrgJoinPage), /auth/callback (AuthCallbackPage).
 *
 * UI Contract strings asserted verbatim: "Invite", "Invite new members",
 * "Welcome! Know someone who might want to join too?".
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  generateTestEmail,
  generateMagicLinkUrl,
  type TestUser,
} from './helpers/test-user';
import {
  createTestOrganization,
  deleteTestOrganization,
  type TestOrganization,
} from './helpers/test-organization';

test.describe('P1076: Org invite link — /org/:slug', () => {
  test.describe.configure({ mode: 'serial' });

  let member: TestUser;
  let org: TestOrganization;

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1076 E2E Member' });
    org = await createTestOrganization({ name: 'P1076 Invite Link Org', visibility: 'public' });
    await supabaseAdmin.from('membership').insert({ org_id: org.id, user_id: member.user.id });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('membership').delete().eq('org_id', org.id);
    await deleteTestOrganization(org.id);
    await deleteTestUser(member.user.id);
  });

  test('smoke: member sees an Invite button beside Manage membership, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(err.message));

    await setTestSession(page, member.email);
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Invite' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Manage membership' })).toBeVisible();
    expect(errors, `Console errors on /org/${org.slug}: ${errors.join(', ')}`).toEqual([]);
  });

  test('Invite dialog: correct title, and the link carries ?from=<member id>', async ({ page }) => {
    await setTestSession(page, member.email);
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Invite new members')).toBeVisible();

    const linkText = await page.locator('pre.whitespace-pre-wrap').first().textContent();
    expect(linkText, 'invite link must point at the join page').toContain(`/org/${org.slug}/join`);
    expect(linkText, 'invite link must carry the sharer\'s attribution').toContain(`from=${member.user.id}`);

    // No embed section for an org share — Non-Goal: "Do NOT add an embed-code
    // section to the org share dialog." ShareDialog already gates this on type.
    await expect(page.getByText('</>')).not.toBeVisible();
  });

  test('Invite dialog usable at 320px, 375px, and desktop', async ({ page }) => {
    await setTestSession(page, member.email);
    await page.goto(`/org/${org.slug}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole('dialog')).toBeVisible();
      // The dialog must stay within the viewport — no horizontal page scroll.
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflowX, `dialog must not cause horizontal overflow at ${width}px`).toBe(false);
    }
  });

  test('signed out: opening the join page with ?from= and tapping Accept carries it through login', async ({ page }) => {
    await page.goto(`/org/${org.slug}/join?from=${member.user.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Clarity Organization Terms')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Accept terms & join' }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });

    const redirectParam = decodeURIComponent(new URL(page.url()).searchParams.get('redirect') ?? '');
    expect(redirectParam, 'redirect must carry the join path with attribution').toBe(
      `/org/${org.slug}/join?from=${member.user.id}`,
    );
    expect(
      new URL(page.url()).searchParams.get('action'),
      'action=join-org is the explicit signal that gates auto-join — never a bare /org redirect',
    ).toBe('join-org');
  });

  test('existing member opening the invite link lands on the org page, not the terms page', async ({ page }) => {
    await setTestSession(page, member.email);
    await page.goto(`/org/${org.slug}/join`);
    await expect(page).toHaveURL(new RegExp(`/org/${org.slug}$`), { timeout: 10000 });
    // The About tab legitimately links to "Clarity Organization Terms" (org-page.tsx),
    // so that text is not a safe negative-assertion anchor here — the certificate's
    // Accept button is unambiguous: it only ever renders on the join page itself.
    await expect(page.getByRole('button', { name: 'Accept terms & join' })).not.toBeVisible();
  });

  test('auto-join: signed-out visitor completes signup via magic link and is already a member, no second tap', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('baseURL fixture is not set — check playwright.config.ts');
    const visitor = await createTestUser({ name: 'P1076 Auto-Join Visitor', email: generateTestEmail() });

    try {
      const joinPath = `/org/${org.slug}/join?from=${member.user.id}`;
      const callbackUrl = `${baseURL}/auth/callback?action=join-org&redirect=${encodeURIComponent(joinPath)}`;
      const magicLinkUrl = await generateMagicLinkUrl(visitor.email, callbackUrl);

      await page.goto(magicLinkUrl);
      await page.waitForURL(new RegExp(`/org/${org.slug}$`), { timeout: 30000 });

      // Already a member — no second "Accept terms & join" tap, straight to the
      // member state and the post-join prompt (Done-When: "no second tap").
      await expect(page.getByRole('button', { name: 'Manage membership' })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Welcome! Know someone who might want to join too?')).toBeVisible();

      const { data: row } = await supabaseAdmin
        .from('membership')
        .select('invited_by')
        .eq('org_id', org.id)
        .eq('user_id', visitor.user.id)
        .single();
      expect(row?.invited_by, 'attribution must be recorded on auto-join too').toBe(member.user.id);
    } finally {
      await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', visitor.user.id);
      await deleteTestUser(visitor.user.id);
    }
  });
});

// Separate describe block — not serial-chained after the auto-join test above.
// That test depends on a shared test-Supabase OTP/magic-link environment issue
// (also breaks e2e/integration/p458-auth-callback-position.spec.ts, unrelated
// to P1076 code) and can time out. Under `mode: 'serial'`, a timeout there
// skips every later test in the same block, then Playwright's retry re-runs
// the whole block from the top — so these two tests never got a chance to
// pass or fail on their own. They only need `org`/`member`, not any state
// left behind by the tests above, so they get their own fixtures here.
test.describe('P1076: Org invite link — post-join banner', () => {
  test.describe.configure({ mode: 'serial' });

  let member: TestUser;
  let org: TestOrganization;

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1076 E2E Member (banner)' });
    org = await createTestOrganization({ name: 'P1076 Invite Link Org (banner)', visibility: 'public' });
    await supabaseAdmin.from('membership').insert({ org_id: org.id, user_id: member.user.id });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('membership').delete().eq('org_id', org.id);
    await deleteTestOrganization(org.id);
    await deleteTestUser(member.user.id);
  });

  test('post-join banner appears on a real join and is dismissible', async ({ page }) => {
    const joiner = await createTestUser({ name: 'P1076 Banner Join User' });
    try {
      await setTestSession(page, joiner.email);
      await page.goto(`/org/${org.slug}/join`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Accept terms & join' }).click();
      await expect(page).toHaveURL(new RegExp(`/org/${org.slug}$`), { timeout: 10000 });

      const banner = page.getByText('Welcome! Know someone who might want to join too?');
      await expect(banner).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(banner).not.toBeVisible();
    } finally {
      await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', joiner.user.id);
      await deleteTestUser(joiner.user.id);
    }
  });

  test('an existing member opening the invite link does NOT see the just-joined banner', async ({ page }) => {
    const alreadyMember = await createTestUser({ name: 'P1076 Already Member' });
    try {
      await supabaseAdmin.from('membership').insert({ org_id: org.id, user_id: alreadyMember.user.id });
      await setTestSession(page, alreadyMember.email);
      await page.goto(`/org/${org.slug}/join`);
      await expect(page).toHaveURL(new RegExp(`/org/${org.slug}$`), { timeout: 10000 });

      // The join-page's already-member guard redirects without justJoined state —
      // distinct from a real join (Done-When: "not an error", not a re-celebration).
      await expect(page.getByText('Welcome! Know someone who might want to join too?')).not.toBeVisible();
    } finally {
      await supabaseAdmin.from('membership').delete().eq('org_id', org.id).eq('user_id', alreadyMember.user.id);
      await deleteTestUser(alreadyMember.user.id);
    }
  });
});
