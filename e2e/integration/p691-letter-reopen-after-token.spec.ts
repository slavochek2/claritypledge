/**
 * @file p691-letter-reopen-after-token.spec.ts
 * @description P691: Letter re-open blocked after token consumed.
 *
 * Verifies that an authenticated receiver can read their letter even when
 * the `invitation_token` has been expired (simulating a first-open that
 * burned the token via `invitation_expires_at = now()`).
 *
 * The fix is in the `letter-reading-page.tsx` load effect, not in the service.
 * This test validates the service layer that the fix relies on:
 *
 * 1. `get_letter_for_reading(expired_token)` returns NULL (token path fails — bug side)
 * 2. `letter_deliveries` + `clarity_letters` RLS allows authed receiver to read
 *    their delivery and letter directly (authed-first path works)
 *
 * Canary: test 2 is the gate — it proves the authed path is viable for the fix.
 * The page-level behavior (load effect restructure) is confirmed via the reproducer
 * URL manual check in the verification plan.
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

// ===========================================================================
// Fixture — sealed letter with expired token, receiver already claimed
// ===========================================================================

let sender: TestUser;
let receiver: TestUser;
let privateDocId: string;
let letterId: string;
let deliveryId: string;
const expiredToken = '00000000-0000-0000-0000-000000000691'; // deterministic for this spec

test.beforeAll(async () => {
  sender = await createTestUser({ name: 'P691 sender' });
  receiver = await createTestUser({ name: 'P691 receiver' });

  // Create private doc (owned by sender)
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: 'P691 test doc', owner_id: sender.user.id })
    .select('id')
    .single();
  expect(docErr, `Doc create failed: ${docErr?.message}`).toBeNull();
  privateDocId = doc!.id;

  // Create sealed letter
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('clarity_letters')
    .insert({
      source_doc_id: privateDocId,
      sender_id: sender.user.id,
      mode: 'one-to-one',
      status: 'sealed',
      sealed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(letterErr, `Letter create failed: ${letterErr?.message}`).toBeNull();
  letterId = letter!.id;

  // Create delivery with EXPIRED invitation_token (simulating post-first-open state)
  const { data: delivery, error: deliveryErr } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letterId,
      receiver_email: receiver.email,
      receiver_profile_id: receiver.user.id,    // claimed after first open
      invitation_token: expiredToken,
      invitation_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(deliveryErr, `Delivery create failed: ${deliveryErr?.message}`).toBeNull();
  deliveryId = delivery!.id;
});

test.afterAll(async () => {
  if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
  if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
  if (privateDocId) await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDocId);
  if (receiver) await deleteTestUser(receiver.user.id);
  if (sender) await deleteTestUser(sender.user.id);
});

test.setTimeout(60000);

// ===========================================================================
// 1. Token path fails for expired token (confirms bug exists on token path)
// ===========================================================================

test.describe('P691 Token path — expired token is rejected', () => {
  test('get_letter_for_reading RPC returns null for expired token', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    // This is the token RPC — should return null for expired token
    const { data, error } = await userClient.rpc('get_letter_for_reading', {
      p_token: expiredToken,
    });

    // RPC should return null (token expired) — not an error, just null
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

// ===========================================================================
// 2. Authed path works — receiver can read delivery + letter directly via RLS
// ===========================================================================

test.describe('P691 Authed path — receiver reads via RLS after token expiry', () => {
  test('authed receiver can read their letter_delivery row', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { data, error } = await userClient
      .from('letter_deliveries')
      .select('id, letter_id, receiver_profile_id, status')
      .eq('id', deliveryId)
      .single();

    expect(error, `Delivery fetch failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(deliveryId);
    expect(data!.letter_id).toBe(letterId);
  });

  test('authed receiver can read their clarity_letters row via RLS', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { data, error } = await userClient
      .from('clarity_letters')
      .select('id, status, sender_id')
      .eq('id', letterId)
      .single();

    expect(error, `Letter fetch failed: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBe(letterId);
    expect(data!.status).toBe('sealed');
  });

  test('third party cannot read receiver\'s delivery row (RLS scoping)', async () => {
    // Create a third party to verify RLS scoping
    const thirdParty = await createTestUser({ name: 'P691 third party' });

    try {
      const tpToken = await signIn(thirdParty.email);
      const userClient = makeUserClient(tpToken);

      const { data, error: _error } = await userClient
        .from('letter_deliveries')
        .select('id')
        .eq('id', deliveryId)
        .maybeSingle();

      // Third party should get no row (RLS returns empty)
      expect(data).toBeNull();
      // Some RLS configurations return an error, others return null — either is acceptable
      // as long as data is null
    } finally {
      await deleteTestUser(thirdParty.user.id);
    }
  });
});
