/**
 * @file p884-reproduce.spec.ts
 * @description P884 canary: adding a recipient to a sealed letter re-sent
 * invitation emails to ALL prior recipients.
 *
 * Root cause: send-letter-emails fetched every letter_deliveries row with a
 * receiver_email (no already-notified scoping), and the add-recipient modal
 * invokes it letter-wide ({ letterId } only — src/lib/letter-emails.ts).
 *
 * Contract this test encodes (the P884 fix):
 *   - Bare anon-key invoke                        → 401 (caller auth required)
 *   - Authenticated non-sender invoke             → 403 (sender only)
 *   - Invoke #1 (initial send, 1 delivery)        → sent: 1, A.notified_at stamped
 *   - Add delivery B, invoke #2 (add-recipient)   → sent: 1 (only B), A.notified_at unchanged
 *   - Invoke #3 (retry, no new deliveries)        → sent: 0
 *
 * Calls the DEPLOYED test-env edge function with the exact request body the
 * client sends. Recipient addresses are @example.com (reserved, no MX) — the
 * Mailgun attempt fails inside Mailgun without reaching any external ISP.
 *
 * Run: npx playwright test --project=integration e2e/integration/p884-reproduce.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/send-letter-emails`;

// Matches test-user.ts — all test users are created with this password.
const TEST_PASSWORD = 'test-password-12345';

async function getAccessToken(email: string): Promise<string> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

/**
 * Invokes send-letter-emails exactly as the client does
 * (see invokeLetterEmails in src/lib/letter-emails.ts: body = { letterId }).
 * supabase.functions.invoke forwards the signed-in user's JWT; `token`
 * simulates that. Omitting it simulates an unauthenticated caller.
 */
async function invokeSendLetterEmails(
  letterId: string,
  token?: string
): Promise<{ status: number; sent: number | null }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ letterId }),
  });
  const body = (await res.json().catch(() => ({}))) as { sent?: unknown };
  return {
    status: res.status,
    sent: typeof body.sent === 'number' ? body.sent : null,
  };
}

async function getNotifiedAt(deliveryId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('notified_at')
    .eq('id', deliveryId)
    .single();
  if (error) throw new Error(`notified_at lookup failed: ${error.message}`);
  return data.notified_at as string | null;
}

test.describe('P884 — add-recipient must not re-email prior recipients', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let stranger: TestUser;
  let senderToken: string;
  let strangerToken: string;
  let docId: string;
  let letterId: string;
  let deliveryAId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P884 Sender' });
    stranger = await createTestUser({ name: 'P884 Stranger' });
    senderToken = await getAccessToken(sender.user.email!);
    strangerToken = await getAccessToken(stranger.user.email!);

    const { data: doc, error } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P884 Canary Doc' })
      .select('id')
      .single();
    if (error || !doc) throw new Error(`Doc creation failed: ${error?.message}`);
    docId = doc.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    // Recipient A — present at seal time (initial-send cohort)
    const deliveryA = await createTestDelivery(letterId, {
      receiverEmail: `p884-a-${Date.now()}@example.com`,
    });
    deliveryAId = deliveryA.id;
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (stranger?.user?.id) await deleteTestUser(stranger.user.id);
  });

  test('emails only newly added recipients; letter-wide invoke is idempotent; sender-only', async () => {
    // ── Caller authorization ─────────────────────────────────────────────────
    // Bare anon key (no user) — rejected before any email work.
    const anon = await invokeSendLetterEmails(letterId);
    expect(anon.status, 'unauthenticated invoke must be rejected with 401').toBe(401);

    // Authenticated user who is NOT the sender — rejected.
    const wrongUser = await invokeSendLetterEmails(letterId, strangerToken);
    expect(wrongUser.status, 'non-sender invoke must be rejected with 403').toBe(403);

    // Neither rejection may have stamped the delivery.
    expect(await getNotifiedAt(deliveryAId), 'rejected invokes must not stamp notified_at').toBeNull();

    // ── Invoke #1 — initial send after seal (letter-compose-page.tsx path) ──
    const first = await invokeSendLetterEmails(letterId, senderToken);
    expect(first.status, 'initial send must succeed').toBe(200);
    expect(first.sent, 'initial send: exactly one email (recipient A)').toBe(1);

    const aNotifiedAt = await getNotifiedAt(deliveryAId);
    expect(aNotifiedAt, 'delivery A must be stamped notified_at after initial send').not.toBeNull();

    // ── Add recipient B — same row shape add_recipient_to_sealed_letter inserts ──
    const deliveryB = await createTestDelivery(letterId, {
      receiverEmail: `p884-b-${Date.now()}@example.com`,
    });

    // ── Invoke #2 — what letter-receiver-modal.tsx fires after a successful add ──
    // Must email ONLY the new recipient (B). Bug was: re-emailed A too (sent: 2).
    const second = await invokeSendLetterEmails(letterId, senderToken);
    expect(second.status).toBe(200);
    expect(
      second.sent,
      'add-recipient invoke must email only the NEW recipient (B), not re-email A'
    ).toBe(1);

    // A was not re-processed: its stamp is unchanged (magic link not regenerated).
    expect(
      await getNotifiedAt(deliveryAId),
      'delivery A notified_at must be unchanged by the add-recipient invoke'
    ).toBe(aNotifiedAt);
    expect(
      await getNotifiedAt(deliveryB.id),
      'delivery B must be stamped notified_at after the add-recipient invoke'
    ).not.toBeNull();

    // ── Invoke #3 — duplicate letter-wide invoke, no new deliveries ──────────
    // (double-click seal / network retry). Must email nobody. Bug was: sent: 2.
    const third = await invokeSendLetterEmails(letterId, senderToken);
    expect(third.status).toBe(200);
    expect(
      third.sent,
      'repeat invoke with no new deliveries must send zero emails'
    ).toBe(0);
  });

  // The P884 auth gate depends on supabase-js forwarding the signed-in user's
  // JWT on functions.invoke (both call sites use it — src/lib/letter-emails.ts).
  // This locks that library behavior in: if a supabase-js upgrade stopped
  // forwarding the session token, prod sends would silently 401 (the client is
  // fire-and-forget), and this test would catch it.
  test('supabase-js functions.invoke forwards the user JWT (client call path)', async () => {
    const signedInClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await signedInClient.auth.signInWithPassword({
      email: sender.user.email!,
      password: TEST_PASSWORD,
    });
    expect(signInError, 'sign-in must succeed').toBeNull();

    // Bogus letterId: a forwarded JWT passes the 401 gate and reaches the
    // letter fetch → 404 "Letter not found". A missing JWT would 401 first.
    const { error } = await signedInClient.functions.invoke('send-letter-emails', {
      body: { letterId: '00000000-0000-0000-0000-000000000000' },
    });
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    expect(
      status,
      'signed-in functions.invoke must pass the auth gate (404 letter-not-found, not 401)'
    ).toBe(404);
  });
});
