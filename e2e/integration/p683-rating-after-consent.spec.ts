/**
 * @file p683-rating-after-consent.spec.ts
 * @description P683 Canary — engagement RPCs must succeed after TOS consent
 *
 * Root cause: commit c77be9bd added token replay protection to create-and-open-letter
 * by setting invitation_expires_at = now() on link. All four P642 engagement RPCs
 * validated the same column with `invitation_expires_at > now()`, so every downstream
 * engagement call failed immediately after TOS consent.
 *
 * Fix: drop the expiry predicate from all four engagement RPCs. Keep it in
 * create-and-open-letter (the replay-attack surface).
 *
 * Canary contract:
 *   BEFORE migration: submit_rating_by_token returns false → test fails at assertion
 *   AFTER migration:  submit_rating_by_token returns true  → test passes
 *
 * Replay defense assertion (separate): second call to create-and-open-letter with
 * the same token must still return a non-200 error, confirming the expiry gate on
 * session minting remains intact after the migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-and-open-letter`;

// Password used by createTestUser for all test users
const TEST_PASSWORD = 'test-password-12345';

async function callCreateAndOpenLetter(params: {
  token: string;
  termsAccepted?: unknown;
  termsVersion?: unknown;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test.describe('P683 Canary — submit_rating_by_token after TOS consent', () => {
  // Serial: canary test runs first and uses the token (sets invitation_expires_at),
  // then replay defense verifies the used token is rejected. Shared beforeAll state.
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let versionId: string;
  let letterId: string;
  let token: string;

  test.beforeAll(async () => {
    // 1. Create sender + receiver with real profiles (receiver has known TEST_PASSWORD)
    sender = await createTestUser({ name: 'P683 Rating Sender' });
    receiver = await createTestUser({ name: 'P683 Rating Receiver' });

    // 2. Create a clarity_doc (required by createTestLetter)
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P683 Canary Doc' })
      .select('id')
      .single();
    if (docErr || !doc) throw new Error(`Doc creation failed: ${docErr?.message}`);
    docId = doc.id;

    // 3. Create story — triggers auto-create story_version (trg_story_initial_version)
    const story = await createTestStory(sender.user.id, {
      title: 'P683 Canary Story',
      content: 'Canary story for engagement RPC regression test.',
    });
    storyId = story.id;

    // 4. Get the auto-created version_id (needed for letter_story_snapshots → story_verifications FK)
    const { data: versionRow, error: verErr } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .single();
    if (verErr || !versionRow) throw new Error(`Version lookup failed: ${verErr?.message}`);
    versionId = versionRow.id;

    // 5. Create letter + snapshot + delivery + seal
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    await createTestStorySnapshot(letterId, storyId, versionId, { position: 0 });

    // Delivery: receiver_email set, receiver_profile_id IS NULL (required by edge fn)
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
    });
    token = delivery.invitationToken;

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    // Clean up terms_acceptances rows that may have been created by the edge function
    await supabaseAdmin
      .from('terms_acceptances')
      .delete()
      .eq('user_id', receiver.user.id);

    if (letterId) await deleteTestLetter(letterId);

    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }

    if (storyId) await deleteTestStory(storyId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ===========================================================================
  // CANARY: submit_rating_by_token must return true after TOS consent
  // ===========================================================================

  test('canary: submit_rating_by_token returns true immediately after create-and-open-letter', async () => {
    // Step 1: Call create-and-open-letter.
    // The existing-user path: finds receiver by email, links the delivery,
    // and sets invitation_expires_at = now() (the bug trigger).
    const { status: efStatus, body: efBody } = await callCreateAndOpenLetter({
      token,
      termsAccepted: true,
      termsVersion: 'v1.2',
    });

    expect(
      efStatus,
      `create-and-open-letter must return 200. Got: ${efStatus}, body: ${JSON.stringify(efBody)}`
    ).toBe(200);
    expect(efBody.ok, 'Response must include ok: true').toBe(true);

    // Step 2: Sign in as receiver with password (receiver was created via createTestUser
    // which sets TEST_PASSWORD). This gives us an authenticated JWT so auth.uid() is
    // the receiver's profile ID — satisfying the listener_id NOT NULL FK in story_verifications.
    const receiverClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await receiverClient.auth.signInWithPassword({
      email: receiver.email,
      password: TEST_PASSWORD,
    });
    expect(signInErr, `Receiver sign-in failed: ${signInErr?.message}`).toBeNull();

    // Step 3 — CANARY ASSERTION.
    // At this point invitation_expires_at = now() (set by create-and-open-letter).
    // BEFORE the migration: the RPC WHERE clause includes
    //   `AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())`
    //   → predicate is FALSE → RPC returns false → THIS ASSERTION FAILS (proves the bug).
    // AFTER the migration: expiry predicate removed → RPC returns true → passes.
    const { data: ratingResult, error: ratingErr } = await receiverClient.rpc(
      'submit_rating_by_token',
      { p_token: token, p_story_id: storyId, p_rating: 5 },
    );

    expect(
      ratingErr,
      `submit_rating_by_token threw an error: ${ratingErr?.message ?? ratingErr}`
    ).toBeNull();

    expect(
      ratingResult,
      'submit_rating_by_token must return true — failed because invitation_expires_at ' +
      'was set by create-and-open-letter and the expiry predicate blocks engagement RPCs'
    ).toBe(true);

    // Step 4: Verify the story_verifications row was actually written.
    const { data: verRow, error: verQueryErr } = await supabaseAdmin
      .from('story_verifications')
      .select('listener_rating')
      .eq('story_id', storyId)
      .eq('source', 'letter')
      .single();

    expect(verQueryErr, `story_verifications lookup failed: ${verQueryErr?.message}`).toBeNull();
    expect(verRow?.listener_rating, 'listener_rating must be 5').toBe(5);
  });

  // ===========================================================================
  // Replay defense: second create-and-open-letter call must still fail
  // (runs AFTER canary, which already consumed the token)
  // ===========================================================================

  test('replay defense: second create-and-open-letter call with same token is rejected', async () => {
    // The same token was already used in the canary test above.
    // invitation_expires_at is already set to a past timestamp.
    // create-and-open-letter checks this and must reject the replay attempt.
    const { status } = await callCreateAndOpenLetter({
      token,
      termsAccepted: true,
      termsVersion: 'v1.2',
    });

    expect(
      status,
      'Replay of a used token must be rejected with a 4xx error — session-minting replay defense must remain intact'
    ).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});
