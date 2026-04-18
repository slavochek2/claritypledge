/**
 * P270 mandatory integration test for P745: Letter pause state schema + RLS hardening.
 *
 * Verifies the THREE operations in 20260418190000_p745_letter_pause_state.sql:
 * 1. letter_deliveries.saved_story_index column exists (nullable INTEGER)
 * 2. CHECK constraint letter_deliveries_saved_story_index_range enforced
 * 3. clarity_live_invites UPDATE RLS hardening: WITH CHECK (closed_at IS NOT NULL)
 *
 * TWO-CLIENT PATTERN (mandatory per P270):
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 *
 * If any test fails, run: ./scripts/migrate.sh
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  generateTestEmail,
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
  if (error || !data.session) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function seedDocAndLetter(senderId: string): Promise<{ docId: string; letterId: string }> {
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P745 Migration Test Doc ${Date.now()}`, owner_id: senderId })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);

  const letter = await createTestLetter(senderId, doc.id, { mode: 'one-to-one' });
  await sealTestLetter(letter.id);

  return { docId: doc.id, letterId: letter.id };
}

async function seedSession(creatorProfileId: string, targetListenerId: string): Promise<{ id: string }> {
  const code = `P745M${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_name: 'P745 Migration Test',
      creator_profile_id: creatorProfileId,
      target_listener_id: targetListenerId,
      live_state: { checksCount: 0 },
      last_activity_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Session seed failed: ${error?.message}`);
  return { id: data.id };
}

// =============================================================================
// 1. Schema existence: saved_story_index column
// =============================================================================

test.describe('P745 Migration — saved_story_index column exists on letter_deliveries', () => {
  test.setTimeout(30000);

  test('saved_story_index column exists in letter_deliveries (service_role read)', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('saved_story_index')
      .limit(1);

    expect(
      error,
      'Migration not applied: "saved_story_index" missing from "letter_deliveries". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  test('saved_story_index is nullable — new rows default to NULL', async () => {
    let testUserId: string | undefined;
    let deliveryId: string | undefined;
    let letterId: string | undefined;
    let docId: string | undefined;

    try {
      const testEmail = generateTestEmail();
      const { user } = await createTestUser({ email: testEmail });
      testUserId = user.id;

      const seeded = await seedDocAndLetter(user.id);
      docId = seeded.docId;
      letterId = seeded.letterId;

      const delivery = await createTestDelivery(letterId, {
        receiverEmail: `receiver-p745-${Date.now()}@test.com`,
        status: 'sent',
      });
      deliveryId = delivery.id;

      const { data, error } = await supabaseAdmin
        .from('letter_deliveries')
        .select('saved_story_index')
        .eq('id', deliveryId)
        .single();

      expect(error).toBeNull();
      expect(data?.saved_story_index).toBeNull();
    } finally {
      if (letterId) await deleteTestLetter(letterId);
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (testUserId) await deleteTestUser(testUserId);
    }
  });
});

// =============================================================================
// 2. CHECK constraint: saved_story_index_range (bounds validation)
// =============================================================================

test.describe('P745 Migration — saved_story_index CHECK constraint enforced', () => {
  test.setTimeout(30000);

  let sender: TestUser;
  let letterId: string | undefined;
  let docId: string | undefined;
  let deliveryId: string | undefined;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P745 Constraint Sender' });
    const seeded = await seedDocAndLetter(sender.user.id);
    letterId = seeded.letterId;
    docId = seeded.docId;

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `receiver-p745-check-${Date.now()}@test.com`,
      status: 'sent',
    });
    deliveryId = delivery.id;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(sender.user.id);
  });

  test('saved_story_index=0 (lower bound) is accepted', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: 0 })
      .eq('id', deliveryId!);

    expect(error, `Lower bound 0 should be accepted: ${error?.message}`).toBeNull();

    await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: null })
      .eq('id', deliveryId!);
  });

  test('saved_story_index=999 (upper bound) is accepted', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: 999 })
      .eq('id', deliveryId!);

    expect(error, `Upper bound 999 should be accepted: ${error?.message}`).toBeNull();

    await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: null })
      .eq('id', deliveryId!);
  });

  test('saved_story_index=-1 (out-of-bounds) is rejected by CHECK constraint', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: -1 })
      .eq('id', deliveryId!);

    expect(
      error,
      'CHECK constraint letter_deliveries_saved_story_index_range missing — ' +
      'migration not applied. Run: ./scripts/migrate.sh'
    ).not.toBeNull();
    // Postgres CHECK violation = 23514
    expect(error?.code).toBe('23514');
  });

  test('saved_story_index=1000 (over upper bound) is rejected by CHECK constraint', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .update({ saved_story_index: 1000 })
      .eq('id', deliveryId!);

    expect(
      error,
      'CHECK constraint not enforced for value > 999. Run: ./scripts/migrate.sh'
    ).not.toBeNull();
    expect(error?.code).toBe('23514');
  });
});

// =============================================================================
// 3. RLS hardening: live_invites_participant_update WITH CHECK (closed_at IS NOT NULL)
// =============================================================================

test.describe('P745 Migration — live_invites_participant_update RLS hardening', () => {
  test.setTimeout(30000);

  let author: TestUser;
  let listener: TestUser;
  let sessionId: string | undefined;
  let inviteId: string | undefined;

  test.beforeAll(async () => {
    [author, listener] = await Promise.all([
      createTestUser({ name: 'P745 RLS Author' }),
      createTestUser({ name: 'P745 RLS Listener' }),
    ]);

    const s = await seedSession(author.user.id, listener.user.id);
    sessionId = s.id;

    const { data: inviteData, error: inviteError } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({
        session_id: sessionId,
        target_user_id: listener.user.id,
        closed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (inviteError || !inviteData) throw new Error(`Invite seed failed: ${inviteError?.message}`);
    inviteId = inviteData.id;
  });

  test.afterAll(async () => {
    if (inviteId) {
      await supabaseAdmin.from('clarity_live_invites').delete().eq('id', inviteId);
    }
    if (sessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(listener.user.id)]);
  });

  test('participant cannot re-open a closed invite (WITH CHECK prevents closed_at=NULL update)', async () => {
    const token = await signIn(listener.email);
    const listenerClient = makeUserClient(token);

    const { error } = await listenerClient
      .from('clarity_live_invites')
      .update({ closed_at: null })
      .eq('id', inviteId!);

    // P745 hardening: WITH CHECK (closed_at IS NOT NULL) blocks this
    expect(
      error,
      'RLS hardening not applied: participant re-opened a closed invite. ' +
      'live_invites_participant_update WITH CHECK should reject closed_at=NULL updates. ' +
      'Run: ./scripts/migrate.sh'
    ).not.toBeNull();
  });
});
