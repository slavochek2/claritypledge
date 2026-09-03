/**
 * @file p1222-public-agreement-render.spec.ts
 * @description Browser-level render checks for P1222 — the half the integration suite
 * cannot reach.
 *
 * `e2e/integration/p1222-public-agreement-pii.spec.ts` proves the DATA contract: with the
 * parties-only policy live, a public row is invisible to the table and visible only through
 * the column-scoped readers. What it cannot prove is that the pages which used to read the
 * table still RENDER once that table stops answering them. Every assertion here is made in
 * a real browser against the app's own code path.
 *
 * Four properties, each with a control that fails differently:
 *   (1) anonymous `/agreements/:id` for a PUBLIC agreement renders the certificate
 *       — control: the same page for a PRIVATE agreement shows the locked state, so (1) is
 *         the reader admitting a public row and not a blanket allow;
 *   (2) an anonymous visitor's view of a profile still counts that public active agreement
 *       — control: a profile with no public agreement shows 0;
 *   (3) a party still gets the invitation link, token and all, on a pending agreement
 *       — control: a non-party visitor on the same page gets no such link;
 *   (4) the token-keyed accept flow still works on both sides of the policy change
 *       — control: a bad token gives the invalid state.
 *
 * (1) and (2) close the first unticked AC; (3) and (4) close the second.
 *
 * NOT asserted here, deliberately: that a signed-out invitee is recognised as an existing
 * account ("Sign In to Co-Sign"). That branch needs `lookup_party_by_email`, from which
 * P877 revoked anon EXECUTE on 2026-06-02 (`20260602160000_p877_profiles_pii_column_grants.sql:351`)
 * — so it has been unreachable for signed-out visitors since long before P1222, which does
 * not touch that function. Asserting it would have failed for a reason that has nothing to
 * do with this branch; it is recorded in the spec as a pre-existing UX consequence instead.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const TERMS_PUBLIC = `P1222 public terms ${RUN}`;
const TERMS_PRIVATE = `P1222 private terms ${RUN}`;

test.describe('P1222: pages still render once the agreements table stops answering', () => {
  let creator: TestUser;
  let partner: TestUser;
  let loner: TestUser;          // a profile with no public agreement — the (2) control
  let publicActiveId: string;
  let privateActiveId: string;
  let pendingId: string;
  let pendingToken: string;
  let strangerPendingId: string;
  let strangerPendingToken: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: `P1222 Creator ${RUN}` });
    partner = await createTestUser({ name: `P1222 Partner ${RUN}` });
    loner = await createTestUser({ name: `P1222 Loner ${RUN}` });

    const pub = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
      termsText: TERMS_PUBLIC,
    });
    publicActiveId = pub.id;

    const priv = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
      termsText: TERMS_PRIVATE,
    });
    privateActiveId = priv.id;

    // Pending, addressed to a real account — the invitation link + the email lookup.
    const pending = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'pending',
      invitationExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    pendingId = pending.id;
    pendingToken = pending.invitationToken;

    // Pending, addressed to an address with no account — the (4) control.
    const stranger = await createTestAgreement(creator.user.id, `p1222-nobody-${RUN}@gmail.com`, {
      status: 'pending',
      invitationExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    strangerPendingId = stranger.id;
    strangerPendingToken = stranger.invitationToken;
  });

  test.afterAll(async () => {
    for (const id of [publicActiveId, privateActiveId, pendingId, strangerPendingId]) {
      if (id) await deleteTestAgreement(id);
    }
    for (const u of [creator, partner, loner]) {
      if (u?.user?.id) await supabaseAdmin.auth.admin.deleteUser(u.user.id);
    }
  });

  // ── (1) anonymous public agreement page ────────────────────────────────────

  test('anonymous visitor: a public agreement still renders through the reader', async ({ page }) => {
    await page.goto(`/agreements/${publicActiveId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(TERMS_PUBLIC)).toBeVisible({ timeout: 15000 });
    // Both names appear more than once (certificate body + signature block).
    await expect(page.getByText(creator.name).first()).toBeVisible();
    await expect(page.getByText(partner.name).first()).toBeVisible();

    await expect(page.getByText(/agreement not found/i)).toHaveCount(0);
    await expect(page.getByText(/this agreement is private/i)).toHaveCount(0);

    // The whole point of the change: the party-only columns are not in the delivered page.
    const html = await page.content();
    expect(html).not.toContain(partner.email);
    expect(html).not.toContain(creator.email);
  });

  test('control — anonymous visitor: a PRIVATE agreement is still locked', async ({ page }) => {
    await page.goto(`/agreements/${privateActiveId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/this agreement is private/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TERMS_PRIVATE)).toHaveCount(0);
  });

  // ── (2) anonymous view of a profile's partners ─────────────────────────────

  test('anonymous visitor: the creator\'s profile still counts the public active agreement', async ({ page }) => {
    await page.goto(`/p/${creator.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /1 Clarity Partner$/ })).toBeVisible({ timeout: 15000 });
  });

  test('anonymous visitor: the partners list page shows the partner', async ({ page }) => {
    await page.goto(`/p/${creator.slug}/partners`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(partner.name).first()).toBeVisible({ timeout: 15000 });
    expect(await page.content()).not.toContain(partner.email);
  });

  test('control — a profile with no public agreement shows 0 partners', async ({ page }) => {
    await page.goto(`/p/${loner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/0 Clarity Partners/)).toBeVisible({ timeout: 15000 });
  });

  // ── (3) the party still gets the invitation link, token included ───────────

  test('party: the invitee still sees Review & Sign with the invitation token in the link', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${pendingId}`);
    await page.waitForLoadState('networkidle');

    const link = page.getByRole('link', { name: /review\s*&?\s*sign/i });
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toHaveAttribute('href', new RegExp(`token=${pendingToken}`));
  });

  test('control — a non-party visitor gets no Review & Sign link on the same agreement', async ({ page }) => {
    await setTestSession(page, loner.email);
    await page.goto(`/agreements/${pendingId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /review\s*&?\s*sign/i })).toHaveCount(0);
  });

  test('party: the creator still sees the party-only toolbar on the public agreement', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${publicActiveId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/your agreement/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /share/i })).toBeVisible();
  });

  // ── (4) the token-keyed accept flow still works either side of the policy ──

  test('party: the signed-in invitee reaches the co-sign state through the invitation link', async ({ page }) => {
    await setTestSession(page, partner.email);
    await page.goto(`/agreements/${pendingId}/accept?token=${pendingToken}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /i accept & co-sign/i })).toBeVisible({ timeout: 15000 });
  });

  test('anonymous invitee: the accept page still renders from the token alone', async ({ page }) => {
    await page.goto(`/agreements/${strangerPendingId}/accept?token=${strangerPendingToken}`);
    await page.waitForLoadState('networkidle');

    // get_agreement_by_token is EXECUTE-granted to anon and is untouched by P1222, so the
    // certificate renders for a signed-out invitee.
    await expect(page.getByRole('heading', { name: new RegExp(`${creator.name} invited you`) }))
      .toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel(/your name on this agreement/i)).toBeVisible();
    // The page never puts the invitee's address on screen.
    expect(await page.content()).not.toContain(`p1222-nobody-${RUN}@gmail.com`);
  });

  test('control — a bad token gives the invalid state, so the two above are the token working', async ({ page }) => {
    await page.goto(`/agreements/${pendingId}/accept?token=00000000-0000-0000-0000-000000000000`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/this invitation has expired or is invalid/i)).toBeVisible({ timeout: 15000 });
  });
});
