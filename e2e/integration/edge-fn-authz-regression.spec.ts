/**
 * @file edge-fn-authz-regression.spec.ts
 * @description Load-bearing regression tests — assert edge-function security
 * guards FIRE on the unhappy path.
 *
 * Each guard below is currently CORRECT but had NO failure-path test. A future
 * refactor could silently delete the guard and every happy-path test would stay
 * green (exactly what happened to a letter RPC scope gate). These tests exercise
 * the rejection branch directly: a non-owner / non-party / non-participant caller
 * (or a replayed token) MUST receive the documented status + error string. If a
 * guard is removed, the call succeeds (2xx) and the matching test fails loudly.
 *
 * Guards covered (status + exact error string asserted, read from source):
 *   1. generate-story-image-url — 403 "Story not found or you are not the author"
 *        Guard: dual filter .eq('id') + .eq('author_id', userId) (index.ts ~302-307)
 *   2. send-agreement-emails    — 403 "Forbidden"
 *        Guard: isParty = creator || partner check (index.ts ~427-443)
 *   3. explain-back-signed-url  — 403 "Not a participant of this letter" (playback)
 *        Guard: resolveMembership → !isReceiver && !isSender (index.ts ~315-330)
 *   4. create-and-sign          — 409 ALREADY_PROCESSED
 *        Guard: status !== 'pending' check (index.ts ~113-114)
 *
 * These tests invoke DEPLOYED edge functions over HTTP against the TEST Supabase
 * project, using real JWTs (same harness style as p683-edge-function.spec.ts).
 * They require VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY (loaded from .env.test.local by playwright.config.ts).
 * Without those env vars the supabase-admin import throws at collection time —
 * same constraint as every spec under e2e/integration/.
 *
 * Run: npx playwright test --project=integration e2e/integration/edge-fn-authz-regression.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  TEST_PASSWORD,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function fnUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/**
 * Sign in as a test user (temp anon client — never mutate supabaseAdmin's
 * session) and return their access_token to use as the Bearer JWT. This is the
 * established pattern in p684/p690/p716 — these guards validate the caller via
 * auth.getUser(token), so a real per-user JWT is required (not the anon key).
 */
async function getAccessToken(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`[TEST] sign-in failed for ${email}: ${error?.message}`);
  }
  return data.session.access_token;
}

/**
 * Invoke a deployed edge function over HTTP with a Bearer token.
 * Returns the parsed status + body so tests can assert on both.
 */
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

// ===========================================================================
// 1. generate-story-image-url — non-author cannot get an upload URL
// ===========================================================================

test.describe('Edge-fn authz regression — generate-story-image-url ownership guard', () => {
  test.describe.configure({ timeout: 60000 });

  let owner: TestUser;
  let outsider: TestUser;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'AuthzReg Story Owner' });
    outsider = await createTestUser({ name: 'AuthzReg Story Outsider' });
    const story = await createTestStory(owner.user.id, {
      title: 'AuthzReg owned story',
      content: 'Owned by owner, requested by outsider.',
    });
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('rejects upload-URL request from a user who is not the story author (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-story-image-url', token, {
      storyId, // valid UUID, real story — but owned by someone else
      contentType: 'image/jpeg',
      fileName: 'attack.jpg',
    });

    // Guard: serviceClient.from('stories').eq('id').eq('author_id', userId).single()
    // returns no row for a non-author → 403 with this exact string.
    expect(status, 'Non-author must be rejected with 403').toBe(403);
    expect(body.error).toBe('Story not found or you are not the author');
  });
});

// ===========================================================================
// 2. send-agreement-emails — non-party cannot trigger agreement emails
// ===========================================================================

test.describe('Edge-fn authz regression — send-agreement-emails party guard', () => {
  test.describe.configure({ timeout: 60000 });

  let creator: TestUser;
  let outsider: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'AuthzReg Agreement Creator' });
    outsider = await createTestUser({ name: 'AuthzReg Agreement Outsider' });
    const agreement = await createTestAgreement(
      creator.user.id,
      `authzreg-partner-${Date.now()}@example.com`,
    );
    agreementId = agreement.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('rejects caller who is neither creator nor partner of the agreement (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('send-agreement-emails', token, {
      action: 'invitation',
      agreementId,
    });

    // Guard: isParty = creator_profile_id === callerId || partner_profile_id === callerId.
    // Outsider matches neither → 403 "Forbidden".
    expect(status, 'Non-party caller must be rejected with 403').toBe(403);
    expect(body.error).toBe('Forbidden');
  });
});

// ===========================================================================
// 3. explain-back-signed-url (playback) — non-participant cannot get a GET URL
// ===========================================================================

test.describe('Edge-fn authz regression — explain-back-signed-url playback membership guard', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let outsider: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;
  let explainBackId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'AuthzReg EB Sender' });
    receiver = await createTestUser({ name: 'AuthzReg EB Receiver' });
    outsider = await createTestUser({ name: 'AuthzReg EB Outsider' });

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'AuthzReg EB doc', owner_id: sender.user.id })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'AuthzReg EB story',
      content: 'Story content for explain-back membership guard test.',
    });
    storyId = story.id;

    // story_explain_backs has FK (letter_id, story_id) → letter_story_snapshots,
    // which needs a real version_id. Look it up like p904 does.
    const { data: versionRow, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .limit(1)
      .single();
    if (versionError || !versionRow) {
      throw new Error(`Version lookup failed: ${versionError?.message}`);
    }

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    await createTestStorySnapshot(letterId, storyId, versionRow.id, {
      position: 0,
      pointConfig: { storyTitle: 'AuthzReg EB story', storyText: 'x', points: [] },
    });

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
    });
    deliveryId = delivery.id;

    await sealTestLetter(letterId);

    // Seed the explain-back row via service_role (bypasses RLS for setup).
    const { data: eb, error: ebError } = await supabaseAdmin
      .from('story_explain_backs')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        delivery_id: deliveryId,
        recorder_id: receiver.user.id,
        medium: 'audio',
        audio_storage_path: `gs://claritypledge-explain-backs/${deliveryId}/${storyId}.webm`,
      })
      .select('id')
      .single();
    if (ebError || !eb) throw new Error(`Explain-back seeding failed: ${ebError?.message}`);
    explainBackId = eb.id;
  });

  test.afterAll(async () => {
    if (explainBackId) {
      await supabaseAdmin.from('story_explain_backs').delete().eq('id', explainBackId);
    }
    if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('rejects playback URL for a valid-JWT user who is neither sender nor receiver (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('explain-back-signed-url', token, {
      mode: 'playback',
      explainBackId,
    });

    // Guard: resolveMembership() → { isReceiver: false, isSender: false } for the
    // outsider → 403 "Not a participant of this letter".
    expect(status, 'Non-participant must be rejected with 403').toBe(403);
    expect(body.error).toBe('Not a participant of this letter');
  });
});

// ===========================================================================
// 4. create-and-sign — replaying a token on a non-pending agreement → 409
// ===========================================================================

test.describe('Edge-fn authz regression — create-and-sign already-processed guard', () => {
  test.describe.configure({ timeout: 60000 });

  let creator: TestUser;
  let agreementId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'AuthzReg CAS Creator' });

    // Agreement whose token is KNOWN (so the token-match check at line ~108 passes)
    // but whose status is already past 'pending' — the state a replayed token hits.
    // Future expiry so the 410 EXPIRED branch (checked AFTER status) is not reached.
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const agreement = await createTestAgreement(
      creator.user.id,
      `authzreg-cas-partner-${Date.now()}@example.com`,
      {
        status: 'declined', // any non-pending state; CHECK allows pending/active/declined/expired/terminated
        invitationToken: crypto.randomUUID(),
        invitationExpiresAt: future,
      },
    );
    agreementId = agreement.id;
    invitationToken = agreement.invitationToken;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('returns 409 ALREADY_PROCESSED when the agreement status is past pending', async () => {
    // create-and-sign is a token-based flow (no user JWT); call with the anon key
    // as Bearer, like p683's create-and-sign test. The matching token clears the
    // token-match check so the status guard is the one that fires.
    const { status, body } = await callFn('create-and-sign', SUPABASE_ANON_KEY, {
      agreementId,
      token: invitationToken,
      partnerName: 'AuthzReg Partner',
      termsVersion: 'v1.3', // must be in ACCEPTED_TERMS_VERSIONS or a 400 fires first
    });

    // Guard: agreement.status !== 'pending' → 409 ALREADY_PROCESSED. This is the
    // idempotency gate that stops a replayed invitation token from re-signing.
    expect(status, 'Replayed token on non-pending agreement must return 409').toBe(409);
    expect(body.error).toBe('ALREADY_PROCESSED');
  });
});
