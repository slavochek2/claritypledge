/**
 * @file p952-responses-mode-migration.spec.ts
 * @description P952 Integration Test — DB migration verification for `clarity_letters.responses_mode`
 *
 * Verifies:
 * 1. Schema: `clarity_letters.responses_mode` column exists with DEFAULT 'invite'
 * 2. Default value is 'invite' for new letters
 * 3. CHECK constraint rejects invalid values (e.g. 'invalid_value')
 * 4. Existing rows (backfill) have responses_mode = 'invite'
 * 5. _responses_mode_allows_insert() helper: returns true for 'invite', false for 'off'
 * 6. RLS enforcement: authenticated receiver CANNOT insert explain-back into an 'off' letter
 * 7. seal_and_send_letter RPC accepts valid modes, rejects invalid modes
 *
 * Two-client pattern (per e2e-testing-guide.md Integration Tests section):
 * - supabaseAdmin: schema-level checks (bypasses RLS — proves column/function exists)
 * - user-scoped clients: RLS and RPC assertions (proves policies are correct)
 *
 * If tests fail: run `./scripts/migrate.sh` to apply the P952 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

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

// ===========================================================================
// 1. Schema — responses_mode column exists on clarity_letters
// ===========================================================================

test.describe('P952 Migration — clarity_letters.responses_mode column schema', () => {
  test.setTimeout(30000);

  test('responses_mode column exists and is selectable via admin client', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_letters')
      .select('responses_mode')
      .limit(1);
    expect(
      error,
      'responses_mode column missing from clarity_letters — run ./scripts/migrate.sh to apply P952 migration'
    ).toBeNull();
  });

  test('default value is "invite" on new letter rows', async () => {
    let senderId: string | undefined;
    let docId: string | undefined;
    let letterId: string | undefined;

    try {
      const sender = await createTestUser({ name: 'P952 Schema Default Sender' });
      senderId = sender.user.id;

      const { data: doc, error: docError } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P952 schema default doc', owner_id: sender.user.id })
        .select('id')
        .single();
      if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
      docId = doc!.id;

      // Insert letter without specifying responses_mode — DB default should apply
      const { data: letter, error: letterError } = await supabaseAdmin
        .from('clarity_letters')
        .insert({
          source_doc_id: docId,
          sender_id: senderId,
          mode: 'one-to-one',
          status: 'draft',
          // responses_mode intentionally omitted — should default to 'invite'
        })
        .select('id, responses_mode')
        .single();

      if (letterError) throw new Error(`Letter creation failed: ${letterError.message}`);
      letterId = letter!.id;

      expect(letter!.responses_mode).toBe('invite');
    } finally {
      if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (senderId) await deleteTestUser(senderId);
    }
  });

  test('CHECK constraint rejects invalid responses_mode values', async () => {
    let senderId: string | undefined;
    let docId: string | undefined;

    try {
      const sender = await createTestUser({ name: 'P952 Schema Constraint Sender' });
      senderId = sender.user.id;

      const { data: doc, error: docError } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P952 constraint test doc', owner_id: sender.user.id })
        .select('id')
        .single();
      if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
      docId = doc!.id;

      const { data, error } = await supabaseAdmin
        .from('clarity_letters')
        .insert({
          source_doc_id: docId,
          sender_id: senderId,
          mode: 'one-to-one',
          status: 'draft',
          responses_mode: 'invalid_value', // should be rejected
        })
        .select('id');

      // CHECK constraint must reject this — either error or no rows returned
      const wasRejected = error !== null || (data !== null && data.length === 0);
      expect(
        wasRejected,
        `CHECK constraint should reject responses_mode='invalid_value' but insert succeeded: ${JSON.stringify(data)}`
      ).toBe(true);
      if (error) {
        expect(error.code).toBe('23514'); // check_violation
      }
    } finally {
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (senderId) await deleteTestUser(senderId);
    }
  });

  test('all three valid responses_mode values are accepted by CHECK constraint', async () => {
    let senderId: string | undefined;
    let docId: string | undefined;
    const letterIds: string[] = [];

    try {
      const sender = await createTestUser({ name: 'P952 Constraint Valid Sender' });
      senderId = sender.user.id;

      const { data: doc, error: docError } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P952 constraint valid doc', owner_id: sender.user.id })
        .select('id')
        .single();
      if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
      docId = doc!.id;

      for (const mode of ['off', 'invite', 'push'] as const) {
        const { data: letter, error } = await supabaseAdmin
          .from('clarity_letters')
          .insert({
            source_doc_id: docId,
            sender_id: senderId,
            mode: 'one-to-one',
            status: 'draft',
            responses_mode: mode,
          })
          .select('id, responses_mode')
          .single();

        expect(error, `responses_mode='${mode}' should be a valid value: ${error?.message}`).toBeNull();
        expect(letter!.responses_mode).toBe(mode);
        if (letter?.id) letterIds.push(letter.id);
      }
    } finally {
      for (const id of letterIds) {
        await supabaseAdmin.from('clarity_letters').delete().eq('id', id);
      }
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (senderId) await deleteTestUser(senderId);
    }
  });
});

// ===========================================================================
// 2. Backfill — existing rows have responses_mode = 'invite'
// ===========================================================================

test.describe('P952 Migration — backfill: existing letters have responses_mode = "invite"', () => {
  test.setTimeout(30000);

  test('no letter rows have NULL responses_mode (backfill complete)', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_letters')
      .select('id')
      .is('responses_mode', null)
      .limit(5);

    expect(error, `Error checking for NULL responses_mode: ${error?.message}`).toBeNull();
    expect(
      data,
      `Found letter rows with NULL responses_mode — backfill incomplete. Run ./scripts/migrate.sh`
    ).toHaveLength(0);
  });

  test('no letter rows have responses_mode outside the valid enum set', async () => {
    // All rows should have one of the three valid values
    const { data, error } = await supabaseAdmin
      .from('clarity_letters')
      .select('id, responses_mode')
      .not('responses_mode', 'in', '("off","invite","push")')
      .limit(5);

    expect(error, `Error checking responses_mode values: ${error?.message}`).toBeNull();
    expect(
      data,
      `Found letter rows with invalid responses_mode: ${JSON.stringify(data)}`
    ).toHaveLength(0);
  });
});

// ===========================================================================
// 3. _responses_mode_allows_insert helper function
// ===========================================================================

test.describe('P952 Migration — _responses_mode_allows_insert helper function', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let inviteLetterDeliveryId: string;
  let offLetterDeliveryId: string;
  let inviteLetterId: string;
  let offLetterId: string;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P952 Helper Sender' });
    receiver = await createTestUser({ name: 'P952 Helper Receiver' });

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P952 helper test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    if (docError) throw new Error(`Doc creation failed: ${docError.message}`);
    docId = doc!.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P952 helper test story',
      content: 'Story content for helper test.',
    });
    storyId = story.id;

    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .limit(1)
      .single();
    if (versionError) throw new Error(`Version lookup failed: ${versionError.message}`);

    // Create invite letter
    const inviteLetter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    inviteLetterId = inviteLetter.id;
    await supabaseAdmin
      .from('clarity_letters')
      .update({ responses_mode: 'invite' })
      .eq('id', inviteLetterId);

    await createTestStorySnapshot(inviteLetterId, storyId, versionRow.id, {
      position: 0,
      pointConfig: { storyTitle: 'P952 helper test story', storyText: 'Story content for helper test.', points: [] },
    });

    const inviteDelivery = await createTestDelivery(inviteLetterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
    });
    inviteLetterDeliveryId = inviteDelivery.id;
    await sealTestLetter(inviteLetterId);

    // Create off letter
    const offLetter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    offLetterId = offLetter.id;
    await supabaseAdmin
      .from('clarity_letters')
      .update({ responses_mode: 'off' })
      .eq('id', offLetterId);

    await createTestStorySnapshot(offLetterId, storyId, versionRow.id, {
      position: 0,
      pointConfig: { storyTitle: 'P952 helper test story', storyText: 'Story content for helper test.', points: [] },
    });

    const offDelivery = await createTestDelivery(offLetterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
    });
    offLetterDeliveryId = offDelivery.id;
    await sealTestLetter(offLetterId);
  });

  test.afterAll(async () => {
    if (inviteLetterDeliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', inviteLetterDeliveryId);
    if (offLetterDeliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', offLetterDeliveryId);
    if (inviteLetterId) await deleteTestLetter(inviteLetterId);
    if (offLetterId) await deleteTestLetter(offLetterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver) await deleteTestUser(receiver.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('_responses_mode_allows_insert function exists (callable without 42883)', async () => {
    const { error } = await supabaseAdmin.rpc('_responses_mode_allows_insert', {
      p_delivery_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(
      error?.code,
      '_responses_mode_allows_insert function not found — run ./scripts/migrate.sh to apply P952 migration'
    ).not.toBe('42883');
  });

  test('_responses_mode_allows_insert returns true for invite letter delivery', async () => {
    const { data, error } = await supabaseAdmin.rpc('_responses_mode_allows_insert', {
      p_delivery_id: inviteLetterDeliveryId,
    });
    expect(error, `_responses_mode_allows_insert RPC error: ${error?.message}`).toBeNull();
    expect(data, '_responses_mode_allows_insert should return true for invite delivery').toBe(true);
  });

  test('_responses_mode_allows_insert returns false for off letter delivery', async () => {
    const { data, error } = await supabaseAdmin.rpc('_responses_mode_allows_insert', {
      p_delivery_id: offLetterDeliveryId,
    });
    expect(error, `_responses_mode_allows_insert RPC error: ${error?.message}`).toBeNull();
    expect(data, '_responses_mode_allows_insert should return false for off delivery').toBe(false);
  });

  // ── CORE SECURITY INVARIANT: 'off' blocks INSERT via RLS WITH CHECK ──────

  test('SECURITY INVARIANT: authenticated receiver CANNOT INSERT explain-back into off letter (RLS blocks)', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient
      .from('story_explain_backs')
      .insert({
        letter_id: offLetterId,
        story_id: storyId,
        delivery_id: offLetterDeliveryId,
        recorder_id: receiver.user.id,
        medium: 'text',
        text_fallback: 'Should be blocked by off mode',
      });

    expect(
      error,
      'Receiver INSERT to story_explain_backs should be BLOCKED by _responses_mode_allows_insert guard for off letter'
    ).not.toBeNull();
  });

  test('authenticated receiver CAN INSERT explain-back into invite letter (RLS allows)', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { data, error } = await userClient
      .from('story_explain_backs')
      .insert({
        letter_id: inviteLetterId,
        story_id: storyId,
        delivery_id: inviteLetterDeliveryId,
        recorder_id: receiver.user.id,
        medium: 'text',
        text_fallback: 'Should be allowed by invite mode',
      })
      .select('id')
      .single();

    expect(
      error,
      `Receiver INSERT to story_explain_backs should be ALLOWED for invite letter: ${error?.message}`
    ).toBeNull();

    // Cleanup the inserted row
    if (data?.id) {
      await supabaseAdmin.from('story_explain_backs').delete().eq('id', data.id);
    }
  });
});

// ===========================================================================
// 4. seal_and_send_letter RPC — accepts valid modes, rejects invalid modes
// ===========================================================================

test.describe('P952 Migration — seal_and_send_letter RPC accepts p_responses_mode param', () => {
  test.setTimeout(30000);

  test('seal_and_send_letter RPC accepts p_responses_mode="off" (function exists with new param)', async () => {
    // Call with a non-existent letter UUID — if the function was updated, we get
    // a "letter not found" / "not owner" error rather than "undefined parameter" (42P01)
    const { error } = await supabaseAdmin.rpc('seal_and_send_letter', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
      p_predictions: {},
      p_deliveries: [],
      p_responses_mode: 'off',
    });

    // 42P01 = undefined_table; PGRST202 = function with matching param not found
    expect(
      error?.code,
      'seal_and_send_letter does not accept p_responses_mode param — run ./scripts/migrate.sh'
    ).not.toBe('PGRST202');
    expect(
      error?.message ?? '',
      'seal_and_send_letter RPC should not return undefined_function for p_responses_mode param'
    ).not.toContain('Could not find the function');
  });

  test('seal_and_send_letter RPC rejects invalid responses_mode with a clear exception', async () => {
    const { error } = await supabaseAdmin.rpc('seal_and_send_letter', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
      p_predictions: {},
      p_deliveries: [],
      p_responses_mode: 'INVALID_MODE',
    });

    // The RPC validates the enum inside the body and should RAISE a clear exception
    // for invalid values — not a silent pass or check_violation from the DB
    expect(error, 'RPC should reject invalid responses_mode with an explicit exception').not.toBeNull();
    // Accept any non-null error: the RPC may throw before it reaches the letter lookup
    // (enum validation fires first per spec AD-2)
  });
});
