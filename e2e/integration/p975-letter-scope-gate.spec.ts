/**
 * @file p975-letter-scope-gate.spec.ts
 * @description P975 migration integration test — seal_and_send_letter rejects an
 * out-of-relationship-scope receiver_profile_id at runtime.
 *
 * Regression: P914 added a relationship-scope gate so a non-admin sender cannot
 * resolve an arbitrary profile's email by UUID (email-harvesting oracle —
 * receiver_profile_id is caller-supplied and the RPC is SECURITY DEFINER). P952
 * recreated the function from a pre-P914 base and silently dropped the gate on the
 * reachable 4-arg overload. P975 restored it.
 *
 * This exercises the LIVE function (not just migration source): a sender calls
 * seal with a deliveries entry pointing at an unrelated user's profile_id and must
 * get the scope exception — never a sealed letter or a resolved email.
 *
 * Run: npx playwright test --project=integration e2e/integration/p975-letter-scope-gate.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

test.describe('Migration p975: seal_and_send_letter gates receiver-email resolution by relationship scope', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let outsider: TestUser; // a profile NOT in the sender's relationship scope
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P975-Sender' });
    outsider = await createTestUser({ name: 'P975-Outsider' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P975 integration doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
  });

  test('rejects sealing to an out-of-scope receiver_profile_id (email-harvest guard)', async () => {
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });
    if (signInErr || !signIn.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

    const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // outsider.user.id is the outsider's profile id (profiles.id = auth.uid()).
    // The sender has no relationship with the outsider, so the gate must fire.
    const { error: rpcErr } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_profile_id: outsider.user.id, receiver_name: 'Outsider' }],
      p_responses_mode: 'invite',
    });

    expect(
      rpcErr,
      'seal_and_send_letter resolved an out-of-scope profile id — the P914 scope gate is missing again (P952-style revert).',
    ).not.toBeNull();
    expect(rpcErr!.message).toMatch(/relationship scope/i);

    // The letter must remain a draft — the function's transaction rolled back.
    const { data: after } = await supabaseAdmin
      .from('clarity_letters')
      .select('status')
      .eq('id', letterId)
      .single();
    expect(after?.status, 'letter was sealed despite the scope rejection').toBe('draft');

    // No delivery row should have been created for the out-of-scope target.
    const { count } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('letter_id', letterId);
    expect(count, 'a delivery row leaked despite the scope rejection').toBe(0);
  });
});
