/**
 * @file p1178-reproduce.spec.ts
 * @description P1178 canary — the "agreement accepted" notification email is
 * silent on the P527 new-user direct-sign path.
 *
 * SYMPTOM (not mechanism): a partner who signs an agreement via the direct-sign
 * flow gets their account created and the agreement sealed, but the creator
 * never receives the "co-signed your Clarity Partner Agreement" email.
 *
 * Two `accepted` triggers exist. Only one is broken:
 *   1. accept-agreement-page.tsx:203 — existing user, calls the fn with a USER JWT   → works
 *   2. create-and-sign/index.ts:261  — new user, calls the fn with the SERVICE ROLE  → 401
 * accept-agreement-page.tsx:427 deliberately does NOT fire the email on path 2
 * ("the edge function already did"), so nothing covers it.
 *
 * The observable oracle is Mailgun's `accepted` event log — independent of the
 * edge functions under test. Test 1 is a CONTROL that must PASS today: it proves
 * the oracle can see an accepted-email at all. Without it, a failing test 2 is
 * indistinguishable from a blind probe. Test 2 is the canary and must FAIL until
 * P1178 is fixed. The canary asserts only the user-visible outcome (the email is
 * sent), so it stays valid whichever fix shape is chosen — shared-secret header,
 * inlined send, or otherwise.
 *
 * Requires MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_REGION in .env.test.local
 * alongside the usual VITE_SUPABASE_* + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run: npx playwright test --project=integration e2e/integration/p1178-reproduce.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_REGION = process.env.MAILGUN_REGION ?? 'eu';

/** Subject built by handleAccepted (send-agreement-emails/index.ts:251). */
const ACCEPTED_SUBJECT_SUFFIX = 'co-signed your Clarity Partner Agreement';

/** Terms version create-and-sign accepts (index.ts ACCEPTED_TERMS_VERSIONS). */
const TERMS_VERSION = 'v1.4';

function fnUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

async function callFn(
  name: string,
  bearer: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(fnUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

async function getAccessToken(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) {
    throw new Error(`[TEST] sign-in failed for ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

/**
 * Poll Mailgun's event log for an `accepted` event to `recipient` whose subject
 * ends with the accepted-agreement suffix. `accepted` (not `delivered`) is the
 * right event: it proves the send was ATTEMPTED, which is what P1178 breaks, and
 * does not depend on the fake test recipient being deliverable.
 */
async function waitForAcceptedEmail(
  recipient: string,
  sinceEpochSeconds: number,
  timeoutMs: number,
): Promise<boolean> {
  const base = `https://api.${MAILGUN_REGION}.mailgun.net/v3/${MAILGUN_DOMAIN}/events`;
  const auth = 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = `${base}?event=accepted&limit=300&begin=${Math.floor(sinceEpochSeconds)}&ascending=yes`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.ok) {
      const page = (await res.json()) as {
        items?: Array<{
          recipient?: string;
          message?: { headers?: { subject?: string } };
        }>;
      };
      const hit = (page.items ?? []).some(
        (i) =>
          i.recipient === recipient &&
          (i.message?.headers?.subject ?? '').endsWith(ACCEPTED_SUBJECT_SUFFIX),
      );
      if (hit) return true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

test.describe('P1178 — accepted-agreement email', () => {
  test.describe.configure({ timeout: 180000 });

  test.skip(
    !MAILGUN_API_KEY || !MAILGUN_DOMAIN,
    'MAILGUN_API_KEY / MAILGUN_DOMAIN missing from .env.test.local — the email oracle is unavailable',
  );

  // Each test creates its OWN creator. The Mailgun oracle matches on recipient
  // address, and both tests produce the identical subject line — a shared creator
  // makes the canary match the control's email and pass while the bug is live
  // (observed: first run went 2/2 green against unfixed code).
  const createdAgreementIds: string[] = [];
  const createdUserIds: string[] = [];

  test.afterAll(async () => {
    for (const id of createdAgreementIds) await deleteTestAgreement(id);
    for (const id of createdUserIds) await deleteTestUser(id);
  });

  /**
   * CONTROL — the existing-user path (accept-agreement-page.tsx:203). Proves the
   * Mailgun oracle can observe an accepted-agreement email. If THIS fails, the
   * canary below proves nothing and the oracle must be fixed first.
   */
  test('control: existing-user accept path sends the accepted email (user JWT)', async () => {
    const creator = await createTestUser({ name: 'P1178 Control Creator' });
    createdUserIds.push(creator.user.id);
    const partner = await createTestUser({ name: 'P1178 Control Partner' });
    createdUserIds.push(partner.user.id);

    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'active',
      partnerProfileId: partner.user.id,
      partnerSignedAt: new Date().toISOString(),
    });
    createdAgreementIds.push(agreement.id);

    const since = Date.now() / 1000 - 60;
    const token = await getAccessToken(creator.email);
    const { status } = await callFn('send-agreement-emails', token, {
      action: 'accepted',
      agreementId: agreement.id,
    });
    expect(status, 'Party caller with a user JWT must be accepted').toBe(200);

    const sent = await waitForAcceptedEmail(creator.email, since, 90000);
    expect(sent, 'Mailgun must log an accepted-agreement email — the oracle works').toBe(true);
  });

  /**
   * CANARY — the P527 direct-sign path. create-and-sign seals the agreement and
   * fires the notification itself with the service-role key; the receiver treats
   * that header as an end-user login and returns 401, so no email is sent and the
   * bare .catch() swallows it. FAILS until P1178 is fixed.
   */
  test('new-user direct-sign path sends the accepted email to the creator', async () => {
    const creator = await createTestUser({ name: 'P1178 Canary Creator' });
    createdUserIds.push(creator.user.id);

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitationToken = crypto.randomUUID();
    const partnerEmail = `p1178-partner-${Date.now()}-${Math.floor(Math.random() * 10000)}@gmail.com`;

    const agreement = await createTestAgreement(creator.user.id, partnerEmail, {
      status: 'pending',
      invitationToken,
      invitationExpiresAt: future,
    });
    createdAgreementIds.push(agreement.id);

    const since = Date.now() / 1000 - 60;

    // Exactly what accept-agreement-page.tsx:379 (handleDirectSign) sends.
    const { status, body } = await callFn('create-and-sign', SUPABASE_ANON_KEY, {
      agreementId: agreement.id,
      token: invitationToken,
      partnerName: 'P1178 Direct Sign Partner',
      termsVersion: TERMS_VERSION,
    });
    expect(status, `create-and-sign must seal the agreement (body: ${JSON.stringify(body)})`).toBe(200);
    expect(body.ok, 'create-and-sign must report ok').toBe(true);

    // The user create-and-sign just made — registered for cleanup.
    const { data: signedRow } = await supabaseAdmin
      .from('clarity_agreements')
      .select('partner_profile_id')
      .eq('id', agreement.id)
      .single();
    const partnerProfileId = (signedRow as { partner_profile_id: string | null } | null)?.partner_profile_id;
    if (partnerProfileId) createdUserIds.push(partnerProfileId);

    const sent = await waitForAcceptedEmail(creator.email, since, 90000);
    expect(
      sent,
      'Creator must receive the co-signed email after a new-user direct sign (P1178: create-and-sign sends the service-role key where a user login token is expected, so the notification 401s silently)',
    ).toBe(true);
  });
});
