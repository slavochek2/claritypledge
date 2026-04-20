/**
 * @file 20260420130000_p770_delete_sealed_letter_rls.spec.ts
 * @description P770: RLS policy expansion — sender can DELETE sealed letters with zero deliveries.
 *
 * Verifies:
 * 1. Sender can delete a sealed letter they own when it has zero deliveries
 * 2. Sealed letter with existing deliveries cannot be deleted (RLS blocks)
 * 3. Draft delete behavior preserved (sender can still delete drafts)
 *
 * If tests fail: run `./scripts/migrate.sh` to apply 20260420130000 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

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
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

const PLACEHOLDER_DOC_ID = '00000000-0000-0000-0000-000000000099';

test.describe('P770 Migration — delete sealed letter RLS', () => {
  test.setTimeout(30000);

  let userId: string;
  let userEmail: string;
  let token: string;

  test.beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    userEmail = user.email;
    token = await signIn(userEmail);
  });

  test.afterAll(async () => {
    // Clean up any leftover letters created by this test
    await supabaseAdmin
      .from('clarity_letters')
      .delete()
      .eq('sender_id', userId);
    await deleteTestUser(userId);
  });

  test('sender can delete a sealed letter with zero deliveries', async () => {
    const { data: letter, error: insertErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        sender_id: userId,
        source_doc_id: PLACEHOLDER_DOC_ID,
        mode: 'one-to-many',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    expect(insertErr, 'insert failed').toBeNull();
    const letterId = letter!.id;

    const userClient = makeUserClient(token);
    const { error: deleteErr } = await userClient
      .from('clarity_letters')
      .delete()
      .eq('id', letterId);

    expect(deleteErr, `delete blocked by RLS — run ./scripts/migrate.sh: ${deleteErr?.message}`).toBeNull();

    // Verify row is gone
    const { data: remaining } = await supabaseAdmin
      .from('clarity_letters')
      .select('id')
      .eq('id', letterId);
    expect(remaining, 'row should be deleted').toHaveLength(0);
  });

  test('sealed letter with deliveries cannot be deleted (RLS blocks silently)', async () => {
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        sender_id: userId,
        source_doc_id: PLACEHOLDER_DOC_ID,
        mode: 'one-to-many',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    const letterId = letter!.id;

    await supabaseAdmin.from('letter_deliveries').insert({
      letter_id: letterId,
      sender_id: userId,
      receiver_email: 'test-recipient-p770@example.com',
      status: 'sent',
      token: `p770-test-token-${Date.now()}`,
    });

    const userClient = makeUserClient(token);
    // PostgREST silently skips rows filtered by USING clause — no error, 0 rows affected
    const { error: deleteErr } = await userClient
      .from('clarity_letters')
      .delete()
      .eq('id', letterId);

    expect(deleteErr).toBeNull(); // silent no-op

    // Row must still exist
    const { data: remaining } = await supabaseAdmin
      .from('clarity_letters')
      .select('id')
      .eq('id', letterId);
    expect(remaining, 'letter with deliveries must not be deleted').toHaveLength(1);

    // Cleanup
    await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
  });

  test('sender can still delete a draft (existing policy preserved)', async () => {
    const { data: draft } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        sender_id: userId,
        source_doc_id: PLACEHOLDER_DOC_ID,
        mode: 'one-to-many',
        status: 'draft',
      })
      .select('id')
      .single();
    const draftId = draft!.id;

    const userClient = makeUserClient(token);
    const { error: deleteErr } = await userClient
      .from('clarity_letters')
      .delete()
      .eq('id', draftId);

    expect(deleteErr, `draft delete blocked: ${deleteErr?.message}`).toBeNull();

    const { data: remaining } = await supabaseAdmin
      .from('clarity_letters')
      .select('id')
      .eq('id', draftId);
    expect(remaining, 'draft should be deleted').toHaveLength(0);
  });
});
