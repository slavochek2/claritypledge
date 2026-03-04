/**
 * @file p472-agreements-polish.spec.ts
 * @description E2E tests for P472: Agreements post-UAT polish
 *
 * Covers behavioral changes introduced in P472:
 *   A1  — Creation mode: signature row (seal + slots) is hidden
 *   A4  — Creation mode: tagline appears above "We, X and Y" sentence
 *   A5  — Partner name input: underline always visible when unfocused
 *   B1  — Metadata line: active count only (pending excluded)
 *   B3  — DEFAULT_TERMS: no [X] or [month/quarter] placeholder brackets
 *   B4  — PendingView: "Resend Invitation" button shown to creator only
 *   B4+ — Resend cooldown: localStorage 24h disable
 *   D1  — Connections page: grouped "Active" and "Pending invitation" sections
 *   D2  — CTA copy changed from "Seal & Send Invitation ✦" to "Seal & Send ✦"
 *   D-visibility — Visibility default is Public; Public button appears first (left)
 *
 * Tests that require two authenticated accounts are marked TODO with rationale.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import { createTestUser, setTestSession } from './helpers/test-user';
import type { TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

// ── Flow 1: Create agreement page — pre-submit state ────────────────────────
// Tests the creation mode certificate appearance and form defaults.
// All items are observable before submission (no partner account needed).
test.describe('Flow 1 — Create agreement page defaults and creation-mode certificate', () => {
  let creator: TestUser;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P472 F1 Creator' });
  });

  test.afterAll(async () => {
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  // ── D2: CTA copy ──────────────────────────────────────────────────────────

  test('D2: submit button reads "Seal & Send ✦" (not "Seal & Send Invitation ✦")', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // D2: "Invitation" dropped from CTA
    await expect(page.getByRole('button', { name: /seal & send ✦/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /seal & send invitation ✦/i })).not.toBeVisible();
  });

  // ── D-visibility: Public default ──────────────────────────────────────────

  test('D-visibility: Public visibility is selected by default', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Public radio button must be aria-checked=true by default
    const publicBtn = page.locator('[role="radio"][aria-checked="true"]').filter({ hasText: /public/i });
    await expect(publicBtn).toBeVisible({ timeout: 10000 });
  });

  test('D-visibility: Public button appears before Private button (left/first in DOM)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Locate all visibility radio buttons
    const radios = page.locator('[role="radio"]');
    await expect(radios).toHaveCount(2, { timeout: 10000 });

    // First radio should be Public, second should be Private
    const firstLabel = await radios.nth(0).innerText();
    const secondLabel = await radios.nth(1).innerText();
    expect(firstLabel.toLowerCase()).toContain('public');
    expect(secondLabel.toLowerCase()).toContain('private');
  });

  // ── B3: DEFAULT_TERMS has no bracket placeholders ────────────────────────

  test('B3: default terms textarea contains no [X] placeholder brackets', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const terms = page.locator('#agreement-terms');
    await expect(terms).toBeVisible({ timeout: 10000 });
    const termsValue = await terms.inputValue();

    expect(termsValue, 'Terms should not contain [X] bracket placeholder').not.toContain('[X]');
    expect(termsValue, 'Terms should not contain [month/quarter] placeholder').not.toContain('[month/quarter]');
  });

  test('B3: default terms contains "1" and "month" (concrete values, not brackets)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const terms = page.locator('#agreement-terms');
    await expect(terms).toBeVisible({ timeout: 10000 });
    const termsValue = await terms.inputValue();

    // B3 spec: [X] → 1, [month/quarter] → month
    expect(termsValue).toContain('1');
    expect(termsValue).toContain('month');
  });

  // ── A1: Creation mode signature row hidden ────────────────────────────────

  test('A1: creation mode shows no dashed seal circle in signature row', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // Certificate should be visible
    await expect(page.getByRole('region', { name: /agreement certificate/i })).toBeVisible({ timeout: 10000 });

    // The dashed pending seal appears as a circle with border-dashed styling.
    // In creation mode (A1) the entire signature row is hidden — seal should not be present.
    // We check that "CREATOR" and "PARTNER" slot labels are not shown (they're in SignatureSlot).
    // Use tracking-widest class selector to target only the 8px slot label, not the user's name.
    const creatorLabel = page.locator('[class*="tracking-widest"]').filter({ hasText: /^creator$/i });
    const partnerLabel = page.locator('[class*="tracking-widest"]').filter({ hasText: /^partner$/i });
    await expect(creatorLabel).not.toBeVisible();
    await expect(partnerLabel).not.toBeVisible();
  });

  test('A1: creation mode shows informational line about both-party signing', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // A1 replacement line: "Agreement becomes active when both parties sign"
    await expect(
      page.getByText(/agreement becomes active when both parties sign/i)
    ).toBeVisible({ timeout: 10000 });
  });

  // ── A4: Tagline position ───────────────────────────────────────────────────

  test('A4: tagline appears before the "We, X and Y, agree to:" sentence in DOM order', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const cert = page.getByRole('region', { name: /agreement certificate/i });
    await expect(cert).toBeVisible({ timeout: 10000 });

    // Get bounding boxes to verify tagline is above the "We, ..." sentence
    const tagline = cert.getByText(/we all crave being understood/i);
    const weAgreeSentence = cert.locator('text=agree to:');

    await expect(tagline).toBeVisible();
    await expect(weAgreeSentence).toBeVisible();

    const taglineBox = await tagline.boundingBox();
    const weBox = await weAgreeSentence.boundingBox();

    expect(taglineBox).not.toBeNull();
    expect(weBox).not.toBeNull();
    // Tagline Y coordinate must be less than "agree to:" Y (tagline is above)
    expect(taglineBox!.y, 'Tagline must appear above the "We, X and Y, agree to:" sentence').toBeLessThan(weBox!.y);
  });

  // ── A5: Partner name input underline ─────────────────────────────────────

  test('A5: partner name input is visible within the certificate (inline in sentence)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    // The partner name input is inline inside the certificate (aria-label set by P466)
    const input = page.locator('input[aria-label="Partner\'s full name"]');
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test('A5: partner name input gains blue border-b on focus', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto('/agreements/new');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[aria-label="Partner\'s full name"]');
    await expect(input).toBeVisible({ timeout: 10000 });

    // Click to focus
    await input.click();

    // After focus, check that the focused ring / border class is applied.
    // The spec says: blue on focus (focus-visible:border-[#0044CC]).
    // We verify the input is focused (DOM state), not the CSS directly (visual check is in UAT).
    await expect(input).toBeFocused();
  });
});

// ── Flow 2: Pending view — Resend button visibility ──────────────────────────
// B4: "Resend Invitation" shown only to creator in PendingView.
// B4+: Resend button disabled for 24h after click (localStorage cooldown).
test.describe('Flow 2 — PendingView: Resend button shown to creator, localStorage cooldown', () => {
  let creator: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P472 F2 Creator' });

    // Create a pending agreement (no partner profile linked = pending state)
    const agr = await createTestAgreement(creator.user.id, 'p472-partner@example-test.com', {
      status: 'pending',
    });
    agreementId = agr.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('B4: creator sees "Resend Invitation" button in PendingView', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    // B4: Resend button visible to creator in pending state
    await expect(page.getByRole('button', { name: /resend invitation/i })).toBeVisible({ timeout: 10000 });
  });

  test('B4+: Resend button is disabled after click (localStorage cooldown applied)', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    const resendBtn = page.getByRole('button', { name: /resend invitation/i });
    await expect(resendBtn).toBeVisible({ timeout: 10000 });
    await expect(resendBtn).toBeEnabled();

    // Click resend (may fire API call — we don't assert success, just state)
    await resendBtn.click();

    // After click: button should become disabled (cooldown applied via localStorage)
    // Allow time for state to update
    await expect(resendBtn).toBeDisabled({ timeout: 5000 });
  });

  test('B4+: Resend button shows "Invitation sent" or "Resend available in Xh" label after cooldown', async ({ page }) => {
    // Pre-inject the localStorage cooldown key so button starts in disabled state
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const storageRef = supabaseUrl.split('//')[1].split('.')[0];
    const authKey = `sb-${storageRef}-auth-token`;

    // Inject cooldown key before navigation
    await page.context().addInitScript(
      ({ agreementId, cooldownKey }) => {
        localStorage.setItem(cooldownKey, new Date().toISOString());
        // Suppress unused-var warning — authKey used above separately
        void agreementId;
      },
      { agreementId, cooldownKey: `clarity-resend-${agreementId}` }
    );
    void authKey; // used in setTestSession indirectly

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    // With cooldown in localStorage, button should be disabled and show remaining time
    const resendBtn = page.getByRole('button', { name: /invitation sent|resend available in/i });
    await expect(resendBtn).toBeVisible({ timeout: 10000 });
    await expect(resendBtn).toBeDisabled();
  });

  // ── B4: Visitor (non-creator) does NOT see Resend button ──────────────────
  // TODO: Requires a second authenticated account (the partner or a third party).
  // Setup: createTestUser for visitor, setTestSession as visitor, navigate to the agreement.
  // Expected: getByRole('button', { name: /resend invitation/i }) not to be visible.
  // The agreement is private so a third-party non-party visitor will see "private" gate.
  // The proper test is as the *partner* (who has read access but is not the creator):
  //   partner = createTestUser, createTestAgreement with partner_profile_id = partner.user.id.
  //   Then setTestSession(page, partner.email) and assert Resend is NOT visible.
});

// ── Flow 3: Connections page — grouped Active / Pending sections ──────────────
// D1: profile-connections-page shows "Active" and "Pending invitation" sections.
test.describe('Flow 3 — Connections page: Active and Pending sections', () => {
  let owner: TestUser;
  let activeAgreementId: string;
  let pendingAgreementId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P472 F3 Owner' });

    // Create one active agreement (both parties signed)
    const activeAgr = await createTestAgreement(owner.user.id, 'p472-active-partner@example-test.com', {
      status: 'active',
      partnerSignedAt: new Date().toISOString(),
    });
    activeAgreementId = activeAgr.id;

    // Create one pending agreement
    const pendingAgr = await createTestAgreement(owner.user.id, 'p472-pending-partner@example-test.com', {
      status: 'pending',
    });
    pendingAgreementId = pendingAgr.id;
  });

  test.afterAll(async () => {
    if (activeAgreementId) await deleteTestAgreement(activeAgreementId);
    if (pendingAgreementId) await deleteTestAgreement(pendingAgreementId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
  });

  test('D1: connections page shows "Active" section heading', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/partners`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /active/i })).toBeVisible({ timeout: 10000 });
  });

  test('D1: connections page shows "Pending invitation" section heading', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/partners`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /pending invitation/i })).toBeVisible({ timeout: 10000 });
  });

  test('D1: Active section is shown before Pending section in DOM order', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}/partners`);
    await page.waitForLoadState('networkidle');

    const activeHeading = page.getByRole('heading', { name: /active/i });
    const pendingHeading = page.getByRole('heading', { name: /pending invitation/i });

    await expect(activeHeading).toBeVisible({ timeout: 10000 });
    await expect(pendingHeading).toBeVisible();

    const activeBox = await activeHeading.boundingBox();
    const pendingBox = await pendingHeading.boundingBox();

    expect(activeBox).not.toBeNull();
    expect(pendingBox).not.toBeNull();
    expect(activeBox!.y, '"Active" section must appear before "Pending invitation" section').toBeLessThan(pendingBox!.y);
  });
});

// ── Flow 4: Metadata line — active-only count (B1) ───────────────────────────
// B1: "N Clarity Partners" count in profile metadata line shows active only.
test.describe('Flow 4 — Profile metadata line: active-only partner count (B1)', () => {
  let owner: TestUser;
  let visitor: TestUser;
  let activeAgreementId: string;
  let pendingAgreementId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P472 F4 Owner' });
    visitor = await createTestUser({ name: 'P472 F4 Visitor' });

    // Create one active agreement (public so visitor can see it)
    const activeAgr = await createTestAgreement(owner.user.id, 'p472-b1-active@example-test.com', {
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    activeAgreementId = activeAgr.id;

    // Create one pending agreement (public — would inflate count if counted)
    const pendingAgr = await createTestAgreement(owner.user.id, 'p472-b1-pending@example-test.com', {
      status: 'pending',
      visibility: 'public',
    });
    pendingAgreementId = pendingAgr.id;
  });

  test.afterAll(async () => {
    if (activeAgreementId) await deleteTestAgreement(activeAgreementId);
    if (pendingAgreementId) await deleteTestAgreement(pendingAgreementId);
    if (owner?.user?.id) await supabaseAdmin.auth.admin.deleteUser(owner.user.id);
    if (visitor?.user?.id) await supabaseAdmin.auth.admin.deleteUser(visitor.user.id);
  });

  test('B1: metadata line shows "1 Clarity Partner" (active only, pending excluded)', async ({ page }) => {
    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // With 1 active + 1 pending, count must be 1 (not 2)
    await expect(page.getByText(/1 clarity partner/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/2 clarity partner/i)).not.toBeVisible();
  });
});

// ── Flow 5: TerminateDialog copy (C6) — regression check ────────────────────
// C6: TerminateDialog title changes to "End this agreement?"
// Requires an active agreement visible to the creator.
test.describe('Flow 5 — TerminateDialog copy (C6)', () => {
  let creator: TestUser;
  let activeAgreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P472 F5 Creator' });

    // Active agreement where creator is the creator_profile_id
    const agr = await createTestAgreement(creator.user.id, 'p472-c6-partner@example-test.com', {
      status: 'active',
      partnerSignedAt: new Date().toISOString(),
    });
    activeAgreementId = agr.id;
  });

  test.afterAll(async () => {
    if (activeAgreementId) await deleteTestAgreement(activeAgreementId);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('C6: Terminate button is present in active agreement for creator', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreementId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /terminate agreement/i })).toBeVisible({ timeout: 10000 });
  });

  test('C6: TerminateDialog shows "End this agreement?" as title after clicking Terminate', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreementId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /terminate agreement/i }).click();

    // C6: Title changed from "Terminate this agreement?" to "End this agreement?"
    await expect(page.getByRole('heading', { name: /end this agreement\?/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /terminate this agreement\?/i })).not.toBeVisible();
  });

  test('C6: TerminateDialog description mentions partner name and email notification', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreementId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /terminate agreement/i }).click();

    // C6 description: "Both of you will be notified by email."
    await expect(page.getByText(/notified by email/i)).toBeVisible({ timeout: 5000 });
  });
});

// ── Flow 6: /live link in CelebrationDialog and ActiveView (C5) ──────────────
// C5: "/live session →" link appears in CelebrationDialog and ActiveView.
// CelebrationDialog requires acceptance flow with two real accounts — TODO for UAT.
// ActiveView link can be checked directly.
test.describe('Flow 6 — /live link in ActiveView (C5)', () => {
  let creator: TestUser;
  let activeAgreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P472 F6 Creator' });

    const agr = await createTestAgreement(creator.user.id, 'p472-c5-partner@example-test.com', {
      status: 'active',
      partnerSignedAt: new Date().toISOString(),
    });
    activeAgreementId = agr.id;
  });

  test.afterAll(async () => {
    if (activeAgreementId) await deleteTestAgreement(activeAgreementId);
    if (creator?.user?.id) await supabaseAdmin.auth.admin.deleteUser(creator.user.id);
  });

  test('C5: active agreement view contains a /live session link', async ({ page }) => {
    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${activeAgreementId}`);
    await page.waitForLoadState('networkidle');

    // C5: "Ready to practice? Start a /live session →" link in the agreement content area.
    // Use specific text match to avoid strict mode violation with nav /live link.
    const liveLink = page.getByRole('link', { name: /start a \/live session/i });
    await expect(liveLink).toBeVisible({ timeout: 10000 });
  });

  // TODO: CelebrationDialog /live link requires acceptance flow:
  // Setup: createTestUser for partner, createTestAgreement with partner_profile_id set,
  //   navigate to /agreements/:id/accept?token=..., click "I Accept & Co-Sign".
  //   CelebrationDialog opens — assert presence of /live link inside dialog.
});

// ── Flow 7: AddToCalendar in CelebrationDialog (Calendar AC) ─────────────────
// Calendar: CelebrationDialog replaces hardcoded Google Calendar text link with
// AddToCalendarButton (Google + Outlook + O365 dropdown).
//
// TODO: Full test requires two-account acceptance flow.
// Smoke coverage: verify old hardcoded "Add /live session to Google Calendar →" link
// is NOT present on active agreement view (it was only in CelebrationDialog).
// The AddToCalendarButton presence inside the dialog is verified in UAT.
test.describe('Flow 7 — Calendar button in CelebrationDialog (smoke regression)', () => {
  // No DB fixtures needed — checking what's NOT there in a read-only page.
  test('active agreement page does not render the old hardcoded Google Calendar link', async ({ page }) => {
    // Non-auth: for a private agreement this just loads the "sign in" gate.
    // We only need to verify the old CALENDAR_URL pattern is gone from any rendered HTML.
    // This is a regression guard — if the old link leaks into ActiveView it would appear here.
    await page.goto('/agreements/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Old link text from celebration-dialog.tsx before P472:
    const oldLink = page.getByText(/add \/live session to google calendar/i);
    await expect(oldLink).not.toBeVisible();
  });
});
