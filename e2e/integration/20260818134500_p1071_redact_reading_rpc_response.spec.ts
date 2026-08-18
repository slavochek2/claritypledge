/**
 * @file 20260818134500_p1071_redact_reading_rpc_response.spec.ts
 * @description P1071: get_letter_for_reading redacts the recipient's address and
 *              the invitation token, returning an in-DB comparison verdict instead.
 *
 * Migration: 20260818134500_p1071_redact_reading_rpc_response.sql
 *
 * Background — this reconciles two requirements that have contradicted each other
 * in the repo since P717:
 *   - P651 required the RPC to stop returning receiver_email (privacy).
 *   - P717 restored it, because the client's wrong-user guard compared it against
 *     the signed-in user's address (docs/decisions.md 2026-04-16).
 * Both hold once the comparison happens in-DB: the response carries the verdict,
 * never the address. P717's reasoning ("the holder already knows the address, the
 * link was emailed to them") does not cover a forwarded or logged link, which is
 * the residual exposure this migration closes.
 *
 * Verifies:
 * 1. delivery has no receiver_email        (P651's requirement, finally met)
 * 2. delivery has no invitation_token      (P1090 — no bearer capability echoed
 *                                           back inside the response it authenticates)
 * 3. is_intended_recipient === null        for a caller with no auth.uid()
 * 4. is_intended_recipient === true        for the signed-in intended recipient
 * 5. is_intended_recipient === false       for a signed-in non-recipient (P717's
 *                                           guard requirement, preserved)
 * 6. is_intended_recipient === null        when the delivery has no receiver_email
 *                                           (the one-to-many link shape) — nothing
 *                                           to compare is not a failed match
 * 7. Fields the reading page still needs are untouched.
 *
 * If tests fail: run `./scripts/migrate.sh` to apply the P1071 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

test.describe('P1071 — get_letter_for_reading response redaction', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let recipient: TestUser;
  let stranger: TestUser;
  let docId: string;
  let letterId: string;
  /** Delivery addressed to `recipient` by email. */
  let addressedToken: string;
  /** Delivery with receiver_email = null — the one-to-many link shape. */
  let anonymousToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P1071 Sender' });
    recipient = await createTestUser({ name: 'P1071 Recipient' });
    stranger = await createTestUser({ name: 'P1071 Stranger' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P1071 Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: addressed } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: recipient.user.email,
        receiver_name: 'P1071 Recipient',
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();
    if (!addressed) throw new Error('Addressed delivery creation failed');
    addressedToken = addressed.invitation_token;

    const { data: anonymous } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: null,
        receiver_profile_id: null,
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();
    if (!anonymous) throw new Error('Anonymous delivery creation failed');
    anonymousToken = anonymous.invitation_token;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (recipient?.user?.id) await deleteTestUser(recipient.user.id);
    if (stranger?.user?.id) await deleteTestUser(stranger.user.id);
  });

  test('anon caller: response carries neither receiver_email nor invitation_token', async () => {
    const { data, error } = await makeAnonClient().rpc('get_letter_for_reading', {
      p_token: addressedToken,
    });

    expect(error, `RPC failed: ${error?.message}`).toBeNull();
    expect(data?.delivery, 'delivery envelope missing').toBeTruthy();

    // The defect P651 specified and P1090 re-filed independently.
    expect(data.delivery).not.toHaveProperty('receiver_email');
    // The bearer capability must not travel inside the body it authenticates.
    expect(data.delivery).not.toHaveProperty('invitation_token');

    // Belt-and-braces: the address must not have leaked into any other key.
    expect(JSON.stringify(data)).not.toContain(recipient.user.email);
  });

  test('anon caller: verdict is null — nothing to compare, and anon reading is intended', async () => {
    const { data, error } = await makeAnonClient().rpc('get_letter_for_reading', {
      p_token: addressedToken,
    });

    expect(error).toBeNull();
    // Explicitly null, not absent and not false: the client guard distinguishes
    // "does not apply" from "failed match", and false would lock anon readers out.
    expect(data.delivery).toHaveProperty('is_intended_recipient');
    expect(data.delivery.is_intended_recipient).toBeNull();
  });

  test('intended recipient signed in: verdict is true', async () => {
    const token = await signIn(recipient.user.email!);
    const { data, error } = await makeUserClient(token).rpc('get_letter_for_reading', {
      p_token: addressedToken,
    });

    expect(error).toBeNull();
    expect(data.delivery.is_intended_recipient).toBe(true);
    // Still redacted even for the person whose address it is — the field has no
    // consumer, and returning it would reopen the forwarded-link exposure.
    expect(data.delivery).not.toHaveProperty('receiver_email');
  });

  test('wrong signed-in user: verdict is false — P717 guard requirement preserved', async () => {
    const token = await signIn(stranger.user.email!);
    const { data, error } = await makeUserClient(token).rpc('get_letter_for_reading', {
      p_token: addressedToken,
    });

    expect(error).toBeNull();
    // This is the assertion that stands in for P717's original receiver_email
    // check. If it ever returns null instead of false, the wrong-user guard has
    // silently stopped firing — the exact P717 failure mode.
    expect(data.delivery.is_intended_recipient).toBe(false);
    expect(data.delivery).not.toHaveProperty('receiver_email');
  });

  test('delivery with no receiver_email: verdict is null even for a signed-in caller', async () => {
    const token = await signIn(stranger.user.email!);
    const { data, error } = await makeUserClient(token).rpc('get_letter_for_reading', {
      p_token: anonymousToken,
    });

    expect(error).toBeNull();
    // The one-to-many link shape. There is nothing to compare against, so the
    // guard must not apply — returning false here would lock every signed-in
    // reader out of public link letters.
    expect(data.delivery.is_intended_recipient).toBeNull();
  });

  test('fields the reading page still consumes are untouched', async () => {
    const { data, error } = await makeAnonClient().rpc('get_letter_for_reading', {
      p_token: addressedToken,
    });

    expect(error).toBeNull();
    for (const key of [
      'id',
      'letter_id',
      'receiver_profile_id',
      'receiver_name',
      'invitation_expires_at',
      'access_token_expires_at',
      'status',
      'stories_rated',
      'opened_at',
      'completed_at',
      'created_at',
    ]) {
      expect(data.delivery, `delivery.${key} went missing`).toHaveProperty(key);
    }
    // P697/P725 letter-envelope fields must survive the redefinition too.
    expect(data.letter).toHaveProperty('sender_display_name');
    expect(data.letter).toHaveProperty('sender_slug');
    expect(data.letter).toHaveProperty('sender_avatar_url');
    expect(data.snapshots).toBeDefined();
  });
});
