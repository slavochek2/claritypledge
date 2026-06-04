/**
 * @file p884-reproduce.spec.ts
 * @description P884 canary: adding a recipient to a sealed letter re-sends
 * invitation emails to ALL prior recipients.
 *
 * Root cause: send-letter-emails fetches every letter_deliveries row with a
 * receiver_email (no already-notified scoping), and the add-recipient modal
 * invokes it letter-wide ({ letterId } only — src/lib/letter-emails.ts).
 *
 * Contract this canary encodes (FAILS until the fix lands):
 *   Invoke #1 (initial send, 1 delivery)       → sent: 1   (passes today)
 *   Add delivery B, invoke #2 (add-recipient)  → sent: 1   (bug today: sent: 2 — A re-emailed)
 *   Invoke #3 (retry, no new deliveries)       → sent: 0   (bug today: sent: 2 — everyone re-emailed)
 *
 * Calls the DEPLOYED test-env edge function with the exact request body the
 * client sends. Recipient addresses are @example.com (reserved, no MX) — the
 * Mailgun attempt fails inside Mailgun without reaching any external ISP.
 *
 * Run: npx playwright test --project=integration e2e/integration/p884-reproduce.spec.ts
 */

import { test, expect } from '@playwright/test';
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

/**
 * Invokes send-letter-emails exactly as the client does
 * (see invokeLetterEmails in src/lib/letter-emails.ts: body = { letterId }).
 */
async function invokeSendLetterEmails(
  letterId: string
): Promise<{ status: number; sent: number | null }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ letterId }),
  });
  const body = (await res.json().catch(() => ({}))) as { sent?: unknown };
  return {
    status: res.status,
    sent: typeof body.sent === 'number' ? body.sent : null,
  };
}

test.describe('P884 — add-recipient must not re-email prior recipients', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P884 Sender' });

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
    await createTestDelivery(letterId, {
      receiverEmail: `p884-a-${Date.now()}@example.com`,
    });
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('emails only newly added recipients; letter-wide invoke is idempotent', async () => {
    // Invoke #1 — initial send after seal (letter-compose-page.tsx path).
    // One delivery (A) → exactly one email.
    const first = await invokeSendLetterEmails(letterId);
    expect(first.status, 'initial send must succeed').toBe(200);
    expect(first.sent, 'initial send: exactly one email (recipient A)').toBe(1);

    // Add recipient B — same row shape add_recipient_to_sealed_letter inserts.
    await createTestDelivery(letterId, {
      receiverEmail: `p884-b-${Date.now()}@example.com`,
    });

    // Invoke #2 — what letter-receiver-modal.tsx fires after a successful add.
    // Must email ONLY the new recipient (B). Bug: re-emails A too (sent: 2).
    const second = await invokeSendLetterEmails(letterId);
    expect(second.status).toBe(200);
    expect(
      second.sent,
      'add-recipient invoke must email only the NEW recipient (B), not re-email A'
    ).toBe(1);

    // Invoke #3 — duplicate letter-wide invoke, no new deliveries
    // (double-click seal / network retry). Must email nobody.
    // Bug: re-emails everyone (sent: 2).
    const third = await invokeSendLetterEmails(letterId);
    expect(third.status).toBe(200);
    expect(
      third.sent,
      'repeat invoke with no new deliveries must send zero emails'
    ).toBe(0);
  });
});
