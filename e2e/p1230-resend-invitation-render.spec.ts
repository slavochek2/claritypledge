/**
 * @file p1230-resend-invitation-render.spec.ts
 * @description The one gap P1230's spec left open: the resend button was moved off a table
 * PATCH onto `rotate_invitation_token` (20260902001500) and verified at the service level
 * only. This drives it from the browser.
 *
 * Part B closed a five-step takeover by making `invitation_token` unwritable from a table
 * PATCH for anon/authenticated (20260902001600). The resend button is the ONE legitimate
 * caller that used to make that exact write, so it is the path most likely to have been
 * broken by the fix — and the integration suite exercises the RPC, never the button.
 *
 * Asserted here:
 *   - the creator clicks Resend Invitation, gets the success toast, and the row's
 *     `invitation_token` and `invitation_expires_at` really changed (read back as
 *     service_role — the DOM cannot show a rotated token, so the ground truth is the row);
 *   - control: the invitee, on the same agreement, is offered no resend at all;
 *   - control: the token does not change when nobody clicks — so the rotation above is the
 *     click and not fixture churn.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from './helpers/test-agreement';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function readInvitation(id: string): Promise<{ token: string; expiresAt: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('clarity_agreements')
    .select('invitation_token, invitation_expires_at')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`read failed: ${error?.message}`);
  return { token: data.invitation_token as string, expiresAt: data.invitation_expires_at as string | null };
}

test.describe('P1230: the creator can still resend, now through the RPC', () => {
  let creator: TestUser;
  let invitee: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: `P1230 Creator ${RUN}` });
    invitee = await createTestUser({ name: `P1230 Invitee ${RUN}` });

    const pending = await createTestAgreement(creator.user.id, invitee.email, {
      partnerProfileId: invitee.user.id,
      status: 'pending',
      invitationExpiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
    });
    agreementId = pending.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    for (const u of [creator, invitee]) {
      if (u?.user?.id) await supabaseAdmin.auth.admin.deleteUser(u.user.id);
    }
  });

  test('control — the invitee is offered no resend on the same pending agreement', async ({ page }) => {
    await setTestSession(page, invitee.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    // The invitee's branch is Review & Sign; resend is creator-only.
    await expect(page.getByRole('link', { name: /review\s*&?\s*sign/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /resend invitation/i })).toHaveCount(0);
  });

  test('control — the token does not rotate on its own', async () => {
    const first = await readInvitation(agreementId);
    await new Promise((r) => setTimeout(r, 1500));
    const second = await readInvitation(agreementId);
    expect(second.token).toBe(first.token);
  });

  test('the creator resends from the UI and the row is really rotated', async ({ page }) => {
    const before = await readInvitation(agreementId);

    await setTestSession(page, creator.email);
    await page.goto(`/agreements/${agreementId}`);
    await page.waitForLoadState('networkidle');

    const resend = page.getByRole('button', { name: /resend invitation/i });
    await expect(resend).toBeVisible({ timeout: 15000 });
    await resend.click();

    await expect(page.getByText(/invitation resent/i)).toBeVisible({ timeout: 15000 });

    // Ground truth: the DOM cannot show a token. If the RPC had been refused the toast
    // would have been the failure copy and this row would be unchanged.
    await expect.poll(async () => (await readInvitation(agreementId)).token, { timeout: 10000 })
      .not.toBe(before.token);

    const after = await readInvitation(agreementId);
    expect(after.expiresAt).not.toBe(before.expiresAt);
    expect(new Date(after.expiresAt!).getTime()).toBeGreaterThan(new Date(before.expiresAt!).getTime());
  });
});
