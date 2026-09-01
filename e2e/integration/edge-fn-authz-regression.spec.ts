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
 *   5. send-agreement-emails    — 401 / 403 on the P1178 internal-caller branch
 *        Guard: isInternal = INTERNAL_FN_SECRET !== '' && header === secret,
 *        plus the action allowlist (internal callers may only fire 'accepted')
 *        and the agreement-status guard (only an 'active' agreement was co-signed).
 *        The party check is skipped for internal callers, so BOTH halves of that
 *        branch need failure-path coverage or the bypass becomes a hole.
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
import { createTestEvent, deleteTestEvent } from '../helpers/test-event';

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
 * Invoke a deployed edge function the way ANOTHER EDGE FUNCTION does (P1178):
 * the anon key clears the gateway's verify_jwt check, and `x-internal-secret`
 * carries the caller's actual identity. Pass `secret: null` to omit the header
 * entirely — that is the pre-fix shape and must still be rejected.
 */
async function callFnInternal(
  name: string,
  secret: string | null,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (secret !== null) headers['x-internal-secret'] = secret;
  const res = await fetch(fnUrl(name), { method: 'POST', headers, body: JSON.stringify(body) });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
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
// 5. send-agreement-emails — P1178 internal service-to-service caller branch
// ===========================================================================

/**
 * P1178 replaced a broken credential (the service-role key sent where a user
 * login token was expected, which 401'd silently) with a shared-secret bypass of
 * the JWT + party checks. A bypass is only as good as the cases it REFUSES, so
 * every refusal below is asserted directly: no secret, wrong secret, and a
 * correct secret used for an action internal callers may not fire.
 */
test.describe('Edge-fn authz regression — send-agreement-emails internal-caller guard (P1178)', () => {
  test.describe.configure({ timeout: 90000 });

  const INTERNAL_FN_SECRET = process.env.INTERNAL_FN_SECRET;

  test.skip(
    !INTERNAL_FN_SECRET,
    'INTERNAL_FN_SECRET missing from .env.test.local — cannot exercise the P1178 internal-caller branch',
  );

  let creator: TestUser;
  let partner: TestUser;
  let agreementId: string;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1178 Internal Creator' });
    partner = await createTestUser({ name: 'P1178 Internal Partner' });
    const agreement = await createTestAgreement(creator.user.id, partner.email, {
      status: 'active',
      partnerProfileId: partner.user.id,
      partnerSignedAt: new Date().toISOString(),
    });
    agreementId = agreement.id;
  });

  test.afterAll(async () => {
    if (agreementId) await deleteTestAgreement(agreementId);
    if (partner?.user?.id) await deleteTestUser(partner.user.id);
    if (creator?.user?.id) await deleteTestUser(creator.user.id);
  });

  test('rejects an internal-shaped call with NO secret header (401)', async () => {
    // The anon key clears the gateway, so this 401 is the function's own guard:
    // no internal secret means the JWT path runs, and the anon key resolves to
    // no user. This is the exact pre-fix outcome, now asserted deliberately.
    const { status, body } = await callFnInternal('send-agreement-emails', null, {
      action: 'accepted',
      agreementId,
    });
    expect(status, 'A call with no internal secret must not be treated as internal').toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  test('rejects a WRONG internal secret (401)', async () => {
    const { status, body } = await callFnInternal('send-agreement-emails', 'not-the-secret', {
      action: 'accepted',
      agreementId,
    });
    expect(status, 'A wrong secret must not open the internal branch').toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  test('rejects a valid internal secret used for a non-accepted action (403)', async () => {
    // Least privilege: 'accepted' is the only notification any internal caller
    // fires, so a leaked secret cannot blast invitations at arbitrary agreements.
    const { status, body } = await callFnInternal('send-agreement-emails', INTERNAL_FN_SECRET!, {
      action: 'invitation',
      agreementId,
    });
    expect(status, "Internal callers must be confined to action 'accepted'").toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  test('rejects a valid internal secret for an agreement that does not exist (404)', async () => {
    const { status, body } = await callFnInternal('send-agreement-emails', INTERNAL_FN_SECRET!, {
      action: 'accepted',
      agreementId: '00000000-0000-0000-0000-000000000000',
    });
    expect(status, 'Agreement existence is still checked for internal callers').toBe(404);
    expect(body.error).toBe('Agreement not found');
  });

  test('rejects a valid internal secret firing accepted for a non-active agreement (403)', async () => {
    // accept_agreement sets status = 'active'. A pending agreement was never
    // co-signed, so an internal 'accepted' notification for it is always spurious —
    // without this guard a leaked secret could tell any creator their agreement is
    // active when it is not.
    const pending = await createTestAgreement(
      creator.user.id,
      `p1178-pending-${Date.now()}@example.com`,
    );
    try {
      const { status, body } = await callFnInternal('send-agreement-emails', INTERNAL_FN_SECRET!, {
        action: 'accepted',
        agreementId: pending.id,
      });
      expect(status, 'Internal accepted must require an active agreement').toBe(403);
      expect(body.error).toBe('Forbidden');
    } finally {
      await deleteTestAgreement(pending.id);
    }
  });

  test('accepts a valid internal secret firing the accepted notification (200)', async () => {
    // The allow half of the branch. The canary
    // (e2e/integration/p1178-reproduce.spec.ts) proves the email actually sends;
    // this asserts the authorization decision itself, without a 90s Mailgun wait.
    const { status, body } = await callFnInternal('send-agreement-emails', INTERNAL_FN_SECRET!, {
      action: 'accepted',
      agreementId,
    });
    expect(status, 'The internal caller must be authorized (P1178 fix)').toBe(200);
    expect(body.ok).toBe(true);
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
      termsVersion: 'v1.4', // must be in ACCEPTED_TERMS_VERSIONS or a 400 fires first
    });

    // Guard: agreement.status !== 'pending' → 409 ALREADY_PROCESSED. This is the
    // idempotency gate that stops a replayed invitation token from re-signing.
    expect(status, 'Replayed token on non-pending agreement must return 409').toBe(409);
    expect(body.error).toBe('ALREADY_PROCESSED');
  });
});

// ===========================================================================
// 5. generate-event-banner — non-host ownership guard
// ===========================================================================

test.describe('Edge-fn authz regression — generate-event-banner host guard', () => {
  test.describe.configure({ timeout: 60000 });

  let host: TestUser;
  let outsider: TestUser;
  let eventId: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'AuthzReg EvtBanner Host' });
    outsider = await createTestUser({ name: 'AuthzReg EvtBanner Outsider' });
    const event = await createTestEvent(host.user.id, undefined, {
      title: 'AuthzReg banner event',
    });
    eventId = event.id;
  });

  test.afterAll(async () => {
    if (eventId) await deleteTestEvent(eventId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('rejects banner request from a user who is not the event host (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-event-banner', token, {
      eventId,
      title: 'AuthzReg Test Event',
      location: 'Nowhere',
    });

    // Guard: .eq('id', eventId).eq('host_id', userId).single() → no row for non-host
    // → 403 "Event not found or you are not the host" (index.ts ~336-348)
    expect(status, 'Non-host must be rejected with 403').toBe(403);
    expect(body.error).toBe('Event not found or you are not the host');
  });
});

// ===========================================================================
// 6. generate-banner — entity ownership / service-key guards
// ===========================================================================

test.describe('Edge-fn authz regression — generate-banner entity ownership guards', () => {
  test.describe.configure({ timeout: 60000 });

  let owner: TestUser;
  let outsider: TestUser;
  let eventId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'AuthzReg Banner Owner' });
    outsider = await createTestUser({ name: 'AuthzReg Banner Outsider' });
    const event = await createTestEvent(owner.user.id, undefined, {
      title: 'AuthzReg Banner event',
    });
    eventId = event.id;
    const story = await createTestStory(owner.user.id, {
      title: 'AuthzReg Banner story',
      content: 'Content for authz banner test.',
    });
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (eventId) await deleteTestEvent(eventId);
    if (storyId) await deleteTestStory(storyId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('event: rejects banner request from a user who is not the host (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-banner', token, {
      entityType: 'event',
      entityId: eventId,
    });

    // Guard: fetchEventData → .eq('host_id', userId) returns no row for non-host
    // → 403 "Event not found or you are not the host" (index.ts fetchEventData ~178-183)
    expect(status, 'Non-host must be rejected with 403').toBe(403);
    expect(body.error).toBe('Event not found or you are not the host');
  });

  test('story: rejects banner request from a user who is not the author (403)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-banner', token, {
      entityType: 'story',
      entityId: storyId,
    });

    // Guard: fetchStoryData → .eq('author_id', userId) returns no row for non-author
    // → 403 "Story not found or you are not the author" (index.ts fetchStoryData ~205-210)
    expect(status, 'Non-author must be rejected with 403').toBe(403);
    expect(body.error).toBe('Story not found or you are not the author');
  });

  test("profile: rejects banner request targeting another user's profile (403)", async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-banner', token, {
      entityType: 'profile',
      entityId: owner.user.id, // outsider targets the owner's profile ID
    });

    // Guard: fetchProfileData → .eq('id', entityId).eq('id', userId) — second .eq
    // ensures own-profile-only; outsider's userId ≠ owner's profileId → no row
    // → 403 "Profile not found or not your profile" (index.ts fetchProfileData ~252-258)
    expect(status, 'Wrong-profile caller must be rejected with 403').toBe(403);
    expect(body.error).toBe('Profile not found or not your profile');
  });

  test('point: is not a client entity type (400)', async () => {
    // P1189: point banners were removed by P519 (2026-03-14) and the point-only
    // service-key branch (formerly index.ts ~413-457) was deleted under P1189 —
    // no caller anywhere in this repo, its history, .private, pp, or the deployed
    // gcloud Cloud Run/Scheduler jobs ever sent x-service-key. 'point' is no
    // longer in VALID_ENTITY_TYPES, so validateInput now rejects it before auth
    // is even checked.
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('generate-banner', token, {
      entityType: 'point',
      entityId: 'aaaaaaaa-0000-0000-0000-000000000000',
    });

    // Guard: validateInput() → entityType not in VALID_ENTITY_TYPES → 400
    // (index.ts ~59-62 — fires before JWT auth, before any DB lookup)
    expect(status, "'point' must be rejected as an invalid entityType").toBe(400);
    expect(body.error).toBe('entityType must be one of: event, story, profile');
  });
});

// ===========================================================================
// 7. send-event-emails — non-host cancel guard
// ===========================================================================

test.describe('Edge-fn authz regression — send-event-emails host guard (cancel action)', () => {
  test.describe.configure({ timeout: 60000 });

  let host: TestUser;
  let nonHost: TestUser;
  let eventId: string;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'AuthzReg SendEvt Host' });
    nonHost = await createTestUser({ name: 'AuthzReg SendEvt NonHost' });
    const event = await createTestEvent(host.user.id, undefined, {
      title: 'AuthzReg cancel-guard event',
    });
    eventId = event.id;
  });

  test.afterAll(async () => {
    if (eventId) await deleteTestEvent(eventId);
    if (nonHost?.user?.id) await deleteTestUser(nonHost.user.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('rejects cancel action from a user who is not the event host (403)', async () => {
    const token = await getAccessToken(nonHost.email);

    const { status, body } = await callFn('send-event-emails', token, {
      action: 'cancel',
      eventId,
    });

    // Guard: eventCheck.host_id !== authenticatedUserId → 403 "Forbidden"
    // (index.ts ~291-303 — checked for cancel, uncancel, update before dispatching)
    expect(status, 'Non-host cancel must be rejected with 403').toBe(403);
    expect(body.error).toBe('Forbidden');
  });
});

// ===========================================================================
// 8. send-letter-emails — non-sender ownership guard
// ===========================================================================

test.describe('Edge-fn authz regression — send-letter-emails sender guard', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let outsider: TestUser;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'AuthzReg SLE Sender' });
    outsider = await createTestUser({ name: 'AuthzReg SLE Outsider' });

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'AuthzReg SLE doc', owner_id: sender.user.id })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`Doc creation failed: ${docError?.message}`);
    docId = doc.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('rejects email trigger from a user who is not the letter sender (404)', async () => {
    const token = await getAccessToken(outsider.email);

    const { status, body } = await callFn('send-letter-emails', token, { letterId });

    // Guard: callerData.user.id !== letter.sender_id → 404 "Letter not found"
    // Intentional: distinct 403 would let callers enumerate valid letter IDs (P884).
    // (index.ts ~188-190)
    expect(status, 'Non-sender must be rejected with 404').toBe(404);
    expect(body.error).toBe('Letter not found');
  });
});

// ===========================================================================
// 9. dispatch-event-emails — CRON_SECRET guard
// ===========================================================================

test.describe('Edge-fn authz regression — dispatch-event-emails CRON_SECRET guard', () => {
  test.describe.configure({ timeout: 30000 });

  test('rejects request with wrong Authorization header (401)', async () => {
    // dispatch-event-emails checks Authorization === `Bearer ${CRON_SECRET}`.
    // Passing any other value → 401 {"error":"Unauthorized"}.
    // Body is irrelevant — the secret check fires before body parsing.
    const { status, body } = await callFn('dispatch-event-emails', 'wrong-cron-secret-value', {});

    // Guard: authHeader !== expectedAuth → 401 (index.ts ~252-258)
    expect(status, 'Wrong CRON_SECRET must be rejected with 401').toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// 10. enqueue-transcription — WEBHOOK_SECRET guard
// ===========================================================================

test.describe('Edge-fn authz regression — enqueue-transcription WEBHOOK_SECRET guard', () => {
  test.describe.configure({ timeout: 30000 });

  test('rejects request with wrong x-webhook-secret header (401)', async () => {
    // enqueue-transcription checks x-webhook-secret header (not Authorization).
    // Wrong header → 401 plain text "unauthorized" (not JSON — raw Response).
    // callFn is not used here because it sends Authorization not x-webhook-secret.
    const res = await fetch(fnUrl('enqueue-transcription'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        'x-webhook-secret': 'wrong-secret-not-matching-env',
      },
      body: JSON.stringify({
        type: 'INSERT',
        table: 'transcription_jobs',
        record: { id: 'aaaaaaaa-0000-0000-0000-000000000000' },
      }),
    });

    // Guard: req.headers.get('x-webhook-secret') !== secret → 401 plain "unauthorized"
    // (index.ts ~55-58 — raw Response, not JSON)
    expect(res.status, 'Wrong WEBHOOK_SECRET must be rejected with 401').toBe(401);
    const text = await res.text();
    expect(text).toBe('unauthorized');
  });
});
