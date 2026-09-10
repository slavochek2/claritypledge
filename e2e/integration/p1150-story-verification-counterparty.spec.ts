/**
 * @file p1150-story-verification-counterparty.spec.ts
 * @description P1150 — the story_verifications INSERT policy bound the caller to one of the two
 * actor columns and left the OTHER one (and the attributed rating) free. Through the real REST
 * path, an ordinary verified user could insert a row naming a third party as speaker on a story
 * that third party authored (or any story), with speaker_rating = 10, and the counters trigger
 * (update_profile_ears_count) would move the third party's public profile numbers.
 *
 * Reproduction + regression in one file:
 *   "gap" tests MUST FAIL before 20260901210000_p1150_bind_story_verification_counterparty.sql
 *   and pass after. "control" tests must pass before AND after — they are the two shapes the
 *   product's own client writes (letters-service.ts submitRating / submitLetterResponseAuthenticated).
 *
 * Part B (20260901220000, Codex review): delivery_id is REQUIRED and must be the caller's own
 * delivery on the letter (closes the NULL-delivery wildcard outside P1067's partial unique
 * index); the helper takes no listener argument and answers only about auth.uid() (closes an
 * enumeration oracle); listener_rating must be NOT NULL. Controls send delivery_id, as both
 * client writers now do.
 *
 * CORRECTION (P1278, 2026-09-09): this file used to state "There is no live-session client write
 * path today (grep story_verifications src/ — letters-service.ts is the only inserter)". That was
 * FALSE — clarity-live-page.tsx:2305 -> calibration-service-real.ts:246 (`recordVerification`) has
 * written a live-sourced row on every completed paraphrase exchange since P413, and the P1150
 * predicate refused all of them. There are TWO direct client writers: letter-screening ratings
 * (caller = listener, speaker = the letter's sender, speaker_rating = 0 placeholder,
 * source = 'letter') and /live calibration (caller = either participant, session_id bound,
 * source = 'live', real ratings). Every other writer is a SECURITY DEFINER RPC or service_role,
 * which RLS does not govern.
 *
 * P1278 (20260909093000) adds the live branch to the same single INSERT policy, and the controls
 * and gap tests at the end of this file are what measures its false-positive rate — the thing
 * P1150 shipped without.
 *
 * P270 coverage — this file IS the integration test for the migrations below. They all rewrite
 * the SAME two policies on story_verifications (one INSERT, one SELECT), so splitting their
 * canaries across files would test one policy in three places and hide which conjunct a failure
 * belongs to:
 *   - 20260901210000_p1150_bind_story_verification_counterparty
 *   - 20260901220000_p1150_b_bind_delivery_and_caller
 *   - 20260909093000_p1278_admit_live_calibration_insert
 *   - 20260910110000_p1278_b_live_verification_visible_to_its_participants
 *   - 20260910130000_p1278_c_live_rows_must_carry_both_ratings
 *
 * Run: npx playwright test --project=integration e2e/integration/p1150-story-verification-counterparty.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestLetter, createTestStorySnapshot, createTestDelivery, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';
import { createTestSessionInDB, type TestSessionInDB } from '../helpers/test-session';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  await supabaseAdmin.auth.signOut();
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function counters(profileId: string): Promise<{ ears: number; sessions: number }> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('ears_count, verification_session_count')
    .eq('id', profileId)
    .single();
  if (error || !data) throw new Error(`counters read failed: ${error?.message}`);
  return { ears: data.ears_count ?? 0, sessions: data.verification_session_count ?? 0 };
}

async function cleanupVerifications(ids: string[]) {
  if (ids.length === 0) return;
  // DELETE only of rows this spec created, by id.
  await supabaseAdmin.from('story_verifications').delete().in('id', ids);
}

async function storyVersionId(storyId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', storyId)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`no story_versions row for ${storyId}: ${error?.message}`);
  return data.id;
}

// ─── Letter fixture: sender → reader, one story, sealed, delivery bound to reader ─────────────
interface LetterFixture {
  docId: string;
  storyId: string;
  versionId: string;
  letterId: string;
  deliveryId: string;
  /** A second recipient's delivery on the same letter — for the "not YOUR delivery" cases. */
  otherDeliveryId: string;
}

async function createLetterFixture(sender: TestUser, reader: TestUser, otherReader: TestUser): Promise<LetterFixture> {
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P1150 doc ${Date.now()}`, owner_id: sender.user.id })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`doc create failed: ${docError?.message}`);
  const story = await createTestStory(sender.user.id, { title: `P1150 story ${Date.now()}` });
  const versionId = await storyVersionId(story.id);
  const letter = await createTestLetter(sender.user.id, doc.id, { mode: 'one-to-one' });
  await createTestStorySnapshot(letter.id, story.id, versionId, { position: 0 });
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: reader.email,
    receiverProfileId: reader.user.id,
    status: 'opened',
  });
  const otherDelivery = await createTestDelivery(letter.id, {
    receiverEmail: otherReader.email,
    receiverProfileId: otherReader.user.id,
    status: 'opened',
  });
  await sealTestLetter(letter.id);
  return { docId: doc.id, storyId: story.id, versionId, letterId: letter.id, deliveryId: delivery.id, otherDeliveryId: otherDelivery.id };
}

async function deleteLetterFixture(f: LetterFixture) {
  await supabaseAdmin.from('story_verifications').delete().eq('story_id', f.storyId);
  await deleteTestLetter(f.letterId);
  await deleteTestStory(f.storyId);
  await supabaseAdmin.from('clarity_docs').delete().eq('id', f.docId);
}

test.describe('P1150: story_verifications INSERT — counterparty and attributed rating are bound', () => {
  let attacker: TestUser;
  let victim: TestUser;
  let sender: TestUser;
  let reader: TestUser;
  let victimStoryId: string;
  let letter: LetterFixture;
  /** P1278: a real two-participant /live room — sender is the creator, reader the joiner. */
  let liveSession: TestSessionInDB;

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1150 Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1150 Victim' });
    sender = await createTestUser({ email: generateTestEmail(), name: 'P1150 Sender' });
    reader = await createTestUser({ email: generateTestEmail(), name: 'P1150 Reader' });
    victimStoryId = (await createTestStory(victim.user.id, { title: `P1150 victim story ${Date.now()}` })).id;
    letter = await createLetterFixture(sender, reader, victim);
    liveSession = await createTestSessionInDB(sender.user.id, 'P1150 Reader', {
      hostName: 'P1150 Sender',
      guestProfileId: reader.user.id,
    });
  });

  test.afterAll(async () => {
    // story_verifications.session_id has no ON DELETE, so live rows must go first.
    await supabaseAdmin.from('story_verifications').delete().eq('session_id', liveSession.sessionId);
    await liveSession.cleanup();
    await supabaseAdmin.from('story_verifications').delete().eq('story_id', victimStoryId);
    await deleteTestStory(victimStoryId);
    await deleteLetterFixture(letter);
    for (const u of [attacker, victim, sender, reader]) await deleteTestUser(u.user.id);
  });

  // ── GAP ──────────────────────────────────────────────────────────────────────────────────

  test('gap: a user cannot name a third party as speaker on that party\'s story and award them a 10', async () => {
    const ids: string[] = [];
    const before = await counters(victim.user.id);
    try {
      const attackerClient = makeUserClient(await signIn(attacker.email));
      const { data, error } = await attackerClient
        .from('story_verifications')
        .insert({
          story_id: victimStoryId,
          speaker_id: victim.user.id,   // forged counterparty
          listener_id: attacker.user.id, // satisfies the old caller-binding
          speaker_rating: 10,            // self-awarded accuracy_achieved
          listener_rating: 10,
          source: 'live',
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      const after = await counters(victim.user.id);

      // Soft on purpose: both facts are evidence, and the second (counters moved) is the
      // blast radius — it must be visible in the same failing run, not hidden behind the first.
      expect.soft(
        error,
        `P1150 not fixed: a forged verification row landed (id ${data?.id}) naming victim ${victim.user.id} as speaker`
      ).not.toBeNull();
      expect.soft(
        after,
        `victim's public counters moved through a forged insert (before ${JSON.stringify(before)}, after ${JSON.stringify(after)})`
      ).toEqual(before);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: a user cannot forge a letter-shaped row naming a third party as sender without a letter', async () => {
    const ids: string[] = [];
    const before = await counters(victim.user.id);
    try {
      const attackerClient = makeUserClient(await signIn(attacker.email));
      const { data, error } = await attackerClient
        .from('story_verifications')
        .insert({
          story_id: victimStoryId,
          speaker_id: victim.user.id,
          listener_id: attacker.user.id,
          speaker_rating: 0,
          listener_rating: 7,
          source: 'letter',
          verified: false,
          session_id: null,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: letter-shaped forgery landed (id ${data?.id}) — no letter from victim exists`).not.toBeNull();
      expect(await counters(victim.user.id)).toEqual(before);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: a stranger to a letter cannot rate it on the receiver\'s behalf', async () => {
    const ids: string[] = [];
    const before = await counters(sender.user.id);
    try {
      const attackerClient = makeUserClient(await signIn(attacker.email));
      const { data, error } = await attackerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,    // a real sender of a real letter containing this story…
          listener_id: attacker.user.id, // …but the caller holds no delivery of it
          speaker_rating: 0,
          listener_rating: 7,
          source: 'letter',
          verified: false,
          session_id: null,
          delivery_id: letter.deliveryId, // the READER's delivery, presented by a stranger
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: non-recipient rated a letter (id ${data?.id})`).not.toBeNull();
      expect(await counters(sender.user.id)).toEqual(before);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: the receiver cannot attribute a non-placeholder speaker_rating to the sender', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 10, // the sender never gave this
          listener_rating: 7,
          source: 'letter',
          verified: false,
          session_id: null,
          delivery_id: letter.deliveryId,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: receiver attributed speaker_rating=10 to the sender (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: the receiver cannot mark a letter rating verified', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 0,
          listener_rating: 7,
          source: 'letter',
          verified: true, // letter ratings are never authoritative
          session_id: null,
          delivery_id: letter.deliveryId,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: receiver wrote a verified=true letter row (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: the receiver cannot bind a letter rating to a session', async () => {
    const ids: string[] = [];
    let sessionId: string | undefined;
    try {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({ code: `P1150-${Date.now().toString(36).toUpperCase()}`, creator_name: 'P1150 session', creator_profile_id: sender.user.id, state: {} })
        .select('id')
        .single();
      expect(sessionError).toBeNull();
      sessionId = session!.id;

      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 0,
          listener_rating: 7,
          source: 'letter',
          verified: false,
          session_id: sessionId, // letter ratings never carry a session
          delivery_id: letter.deliveryId,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: receiver wrote a session-bound letter row (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
      if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });

  test('gap (B): a letter rating without a delivery_id is rejected — the NULL wildcard is closed', async () => {
    const ids: string[] = [];
    const senderBefore = await counters(sender.user.id);
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          listener_rating: 6,
          speaker_rating: 0,
          source: 'letter',
          verified: false,
          session_id: null,
          // delivery_id omitted → NULL: outside P1067's partial unique index, so unlimited rows
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 B not fixed: a delivery-less letter row landed (id ${data?.id})`).not.toBeNull();
      expect(await counters(sender.user.id)).toEqual(senderBefore);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (B): a recipient cannot rate through ANOTHER recipient\'s delivery on the same letter', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          listener_rating: 6,
          speaker_rating: 0,
          source: 'letter',
          verified: false,
          session_id: null,
          delivery_id: letter.otherDeliveryId, // a real delivery of this letter — to someone else
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 B not fixed: rating landed through another recipient's delivery (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (B): a second rating of the same story through the same delivery is rejected and moves no counter', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const payload = {
        story_id: letter.storyId,
        version_id: letter.versionId,
        speaker_id: sender.user.id,
        listener_id: reader.user.id,
        listener_rating: 6,
        speaker_rating: 0,
        source: 'letter',
        verified: false,
        session_id: null,
        delivery_id: letter.deliveryId,
      };
      const first = await readerClient.from('story_verifications').insert(payload).select('id').single();
      expect(first.error, `first rating should land: ${first.error?.message}`).toBeNull();
      ids.push(first.data!.id);

      const senderAfterFirst = await counters(sender.user.id);
      const readerAfterFirst = await counters(reader.user.id);

      const second = await readerClient.from('story_verifications').insert({ ...payload, listener_rating: 9 }).select('id').single();
      if (second.data?.id) ids.push(second.data.id);
      expect(second.error, `P1150 B not fixed: duplicate (delivery, story) rating landed (id ${second.data?.id})`).not.toBeNull();
      expect(second.error!.code).toBe('23505');

      // The unique index fires before the AFTER INSERT trigger — nothing moved.
      expect(await counters(sender.user.id)).toEqual(senderAfterFirst);
      expect(await counters(reader.user.id)).toEqual(readerAfterFirst);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (B): the helper cannot be used to probe another user\'s letter relation', async () => {
    // The reader genuinely holds this exact relation. Asked by the ATTACKER, the helper must
    // answer about the attacker (false) — it no longer accepts a listener argument at all.
    const attackerClient = makeUserClient(await signIn(attacker.email));
    const probe = await attackerClient.rpc('p1150_letter_rating_admissible', {
      p_story: letter.storyId,
      p_speaker: sender.user.id,
      p_version: letter.versionId,
      p_delivery: letter.deliveryId,
    });
    expect(probe.error, `helper should be callable by authenticated: ${probe.error?.message}`).toBeNull();
    expect(probe.data).toBe(false);

    // The old 5-argument oracle (with a listener parameter) must be gone.
    const oracle = await attackerClient.rpc('p1150_letter_rating_admissible', {
      p_story: letter.storyId,
      p_speaker: sender.user.id,
      p_listener: reader.user.id,
      p_version: letter.versionId,
      p_delivery: letter.deliveryId,
    });
    expect(oracle.data, 'P1150 B not fixed: the 5-arg helper answered about another user').not.toBe(true);
    expect(oracle.error).not.toBeNull();

    // Positive control: asked by the reader about their own relation, it is true.
    const readerClient = makeUserClient(await signIn(reader.email));
    const own = await readerClient.rpc('p1150_letter_rating_admissible', {
      p_story: letter.storyId,
      p_speaker: sender.user.id,
      p_version: letter.versionId,
      p_delivery: letter.deliveryId,
    });
    expect(own.error).toBeNull();
    expect(own.data).toBe(true);
  });

  test('gap (B): a letter rating with a NULL listener_rating is rejected', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          listener_rating: null,
          speaker_rating: 0,
          source: 'letter',
          verified: false,
          session_id: null,
          delivery_id: letter.deliveryId,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 B not fixed: a row recording no rating landed (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  // ── CONTROLS — the shapes the product writes ──────────────────────────────────────────────

  test('control: letters-service submitRating shape still submits and records (receiver rates sender\'s story)', async () => {
    const ids: string[] = [];
    const readerBefore = await counters(reader.user.id);
    const senderBefore = await counters(sender.user.id);
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      // Exact payload of letters-service.ts submitRating.
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          listener_rating: 8,
          speaker_rating: 0,
          source: 'letter',
          verified: false,
          session_id: null,
          delivery_id: letter.deliveryId,
        })
        .select('id, listener_rating, speaker_rating, accuracy_achieved, source, verified')
        .single();
      expect(error, `letter-screening rating regressed: ${error?.message}`).toBeNull();
      ids.push(data!.id);
      expect(data!.listener_rating).toBe(8);
      expect(data!.speaker_rating).toBe(0);
      expect(data!.accuracy_achieved).toBe(false);

      // Counters move exactly as the product intends: the reader's ears_count is recomputed as
      // the number of distinct stories they hold rows on (P940 definition — a plain +1 would be
      // order-dependent: an earlier test in this file may have inserted and deleted a row on the
      // same story, and the recompute only runs on INSERT); both parties gain a session.
      const readerAfter = await counters(reader.user.id);
      const senderAfter = await counters(sender.user.id);
      const { data: readerRows } = await supabaseAdmin
        .from('story_verifications')
        .select('story_id')
        .eq('listener_id', reader.user.id)
        .not('story_id', 'is', null);
      const distinctStories = new Set((readerRows ?? []).map((r) => r.story_id)).size;
      expect(readerAfter.ears).toBe(distinctStories);
      expect(readerAfter.sessions).toBe(readerBefore.sessions + 1);
      expect(senderAfter.sessions).toBe(senderBefore.sessions + 1);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('control: submitLetterResponseAuthenticated shape (batch, no version_id) still submits', async () => {
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      // Exact row shape of letters-service.ts submitLetterResponseAuthenticated (version_id omitted).
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert([
          {
            story_id: letter.storyId,
            speaker_id: sender.user.id,
            listener_id: reader.user.id,
            listener_rating: 5,
            speaker_rating: 0,
            source: 'letter',
            verified: false,
            session_id: null,
            delivery_id: letter.deliveryId,
          },
        ])
        .select('id');
      expect(error, `batch letter rating regressed: ${error?.message}`).toBeNull();
      ids.push(...(data ?? []).map((r) => r.id));
      expect(ids.length).toBe(1);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  // ── P1278 — the /live branch: controls that must be ADMITTED, gaps that must be REFUSED ────
  //
  // P1150's header claimed "Live sessions have no client write path into this table today".
  // That was false: clarity-live-page.tsx:2305 -> calibration-service-real.ts:246 has written
  // one since P413. Because this file carried only a source:'live' case that must be REJECTED
  // (the first gap test above) and no control asserting a legitimate live row is ADMITTED, the
  // predicate's false-positive rate was never measured and every /live round was refused for
  // two days on prod. See .claude/rules/epistemic.md gate 7c.

  test('control (P1278): the /live client shape is admitted for the session creator', async () => {
    const ids: string[] = [];
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      // Exact payload of calibration-service-real.ts recordVerification: no `source`
      // (the column default is 'live'), no delivery_id, real ratings on both sides.
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 7,
          listener_rating: 8,
        })
        .select('id, source')
        .single();
      if (data?.id) ids.push(data.id);
      expect(
        error,
        `P1278 not fixed: the /live calibration write is still refused (${error?.code} ${error?.message})`
      ).toBeNull();
      expect(data?.source).toBe('live');
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('control (P1278): the same exchange written by the joiner, actors swapped, is admitted', async () => {
    // Both clients fire writeVerification, and the speaker is whoever checked understanding
    // that round — so the caller may be either actor. The policy binds the caller to session
    // membership, never to one specific column.
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: reader.user.id,
          listener_id: sender.user.id,
          speaker_rating: 9,
          listener_rating: 9,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: the joiner's write was refused (${error?.code} ${error?.message})`).toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('control (P1278): a storyless exchange is admitted (P413 nullable story/version)', async () => {
    const ids: string[] = [];
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: null,
          version_id: null,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 5,
          listener_rating: 6,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: a storyless /live exchange was refused (${error?.code})`).toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('control (P1278 B): the non-author participant can write and read back a round about a PRIVATE story', async () => {
    // Production's stories.visibility default is 'private' (P424), and the /live picker only
    // offers you your OWN stories — so "a round about a private story" is the ordinary case,
    // not an edge case. Before P1278 B the SELECT policy admitted a live row only when its
    // story was public or authored by the reader, so the LISTENER's own insert failed on its
    // RETURNING clause (PostgREST always issues .select() here) even though the row was
    // admitted by the INSERT policy. That is a 42501 the writer cannot distinguish from a
    // refusal, and it would have left half of every /live round unrecorded after P1278 A.
    const ids: string[] = [];
    let privateStoryId: string | undefined;
    try {
      privateStoryId = (
        await createTestStory(sender.user.id, {
          title: `P1278B private story ${Date.now()}`,
          visibility: 'private',
        })
      ).id;

      // The reader is the listener and is NOT the story's author.
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: privateStoryId,
          version_id: null,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 9,
          listener_rating: 9,
        })
        .select('id, source')
        .single();
      if (data?.id) ids.push(data.id);
      expect(
        error,
        `P1278 B not fixed: a live round about a private story was refused for the non-author participant (${error?.code} ${error?.message})`
      ).toBeNull();
      expect(data?.source).toBe('live');
    } finally {
      await cleanupVerifications(ids);
      if (privateStoryId) await deleteTestStory(privateStoryId);
    }
  });

  test('gap (P1278 C): a participant cannot write a live row with NULL ratings', async () => {
    // Found by adversarial review of the P1278 A+B diff. Both rating columns are nullable and
    // their CHECKs are `BETWEEN 0 AND 10`, which ADMITS NULL (a CHECK passes on UNKNOWN). Both
    // counters triggers fire on every inserted row without inspecting a rating, so before
    // P1278 C two real participants could move their own public verification_session_count
    // with a row that records no calibration. The letter branch has required
    // listener_rating IS NOT NULL since P1150 B; this closes the same gap on the live branch.
    const ids: string[] = [];
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: null,
          listener_rating: null,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(
        error,
        `P1278 C: a ratingless live row was admitted (id ${data?.id}) — it moves both participants' verification_session_count with no calibration behind it`
      ).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278 B): a stranger still cannot read a live row about a private story', async () => {
    // The widening must reach the two named actors and nobody else. The attacker is a real
    // signed-in user who is neither participant nor the story's author.
    const ids: string[] = [];
    let privateStoryId: string | undefined;
    try {
      privateStoryId = (
        await createTestStory(sender.user.id, {
          title: `P1278B private story gap ${Date.now()}`,
          visibility: 'private',
        })
      ).id;

      const { data: seeded } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          story_id: privateStoryId,
          version_id: null,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 9,
          listener_rating: 9,
        })
        .select('id')
        .single();
      if (seeded?.id) ids.push(seeded.id);
      expect(seeded?.id, 'fixture seed failed').toBeTruthy();

      const attackerClient = makeUserClient(await signIn(attacker.email));
      const { data: visible } = await attackerClient
        .from('story_verifications')
        .select('id')
        .eq('id', seeded!.id);
      expect(
        visible ?? [],
        'P1278 B leaked: a non-participant can read a live calibration row about a private story'
      ).toHaveLength(0);
    } finally {
      await cleanupVerifications(ids);
      if (privateStoryId) await deleteTestStory(privateStoryId);
    }
  });

  test('gap (P1278): an outsider cannot write a live row into a session they are not in', async () => {
    const ids: string[] = [];
    try {
      const attackerClient = makeUserClient(await signIn(attacker.email));
      const { data, error } = await attackerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 10,
          listener_rating: 10,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(
        error,
        `P1278 opened a hole: a non-participant wrote ratings into someone else's session (id ${data?.id})`
      ).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a participant cannot name a third party as speaker in their own session', async () => {
    // The P1150 attack, retried through the live branch: both actor columns must be the
    // session's own participants, so there is no column left to point at a stranger.
    const ids: string[] = [];
    const before = await counters(victim.user.id);
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: victimStoryId,
          session_id: liveSession.sessionId,
          speaker_id: victim.user.id,   // forged counterparty, not in this session
          listener_id: sender.user.id,
          speaker_rating: 10,
          listener_rating: 10,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      const after = await counters(victim.user.id);
      expect.soft(
        error,
        `P1278 restored P1150: a forged live row landed (id ${data?.id}) naming victim ${victim.user.id} as speaker`
      ).not.toBeNull();
      expect.soft(
        after,
        `victim's public counters moved through a forged live insert (before ${JSON.stringify(before)}, after ${JSON.stringify(after)})`
      ).toEqual(before);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a participant cannot name a story authored by someone outside the room', async () => {
    // Codex review of P1278, finding 1. The actor binding protects `profiles` counters but
    // NOT `stories.understood_count`: update_story_understood_count recomputes it for
    // NEW.story_id, and the story's author need not be a participant. Two genuine
    // participants could otherwise move any stranger's public number. The helper now
    // requires the story's author to be one of the two participants.
    const ids: string[] = [];
    const { data: beforeRow } = await supabaseAdmin
      .from('stories').select('understood_count').eq('id', victimStoryId).single();
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: victimStoryId,          // authored by victim, who is not in this session
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,       // both actors ARE participants
          listener_id: reader.user.id,
          speaker_rating: 10,
          listener_rating: 10,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      const { data: afterRow } = await supabaseAdmin
        .from('stories').select('understood_count').eq('id', victimStoryId).single();

      expect.soft(
        error,
        `P1278: a live row landed (id ${data?.id}) naming a story authored outside the session`
      ).not.toBeNull();
      expect.soft(
        afterRow?.understood_count,
        `a stranger's stories.understood_count moved through an admitted live row (before ${beforeRow?.understood_count}, after ${afterRow?.understood_count})`
      ).toBe(beforeRow?.understood_count);
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a version_id belonging to a different story is refused', async () => {
    const ids: string[] = [];
    try {
      // A real version, but of the victim's story rather than the one named.
      const otherVersionId = await storyVersionId(victimStoryId);
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: otherVersionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 8,
          listener_rating: 8,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: a mismatched version_id landed (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a live row marked verified = false is refused', async () => {
    // `verified` is true for authoritative (live) rows and false for letter screening (P581).
    // The live client never sends it, so the column default applies; a caller that sends
    // false is not the product path.
    const ids: string[] = [];
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 8,
          listener_rating: 8,
          verified: false,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: an unverified live row landed (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a live row cannot carry a delivery_id', async () => {
    // P1067's partial unique index is (delivery_id, story_id) WHERE source='letter' AND
    // delivery_id IS NOT NULL. A live-sourced row carrying a delivery sits outside it, so it
    // could occupy a letter relation without being deduped against letter ratings.
    const ids: string[] = [];
    try {
      const readerClient = makeUserClient(await signIn(reader.email));
      const { data, error } = await readerClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 8,
          listener_rating: 8,
          delivery_id: letter.deliveryId,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: a live row carrying a delivery_id landed (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): a live row with no session_id is refused', async () => {
    // session_id is the ONLY thing binding the live branch. Without it the branch would admit
    // any pair of profile ids from any caller.
    const ids: string[] = [];
    try {
      const senderClient = makeUserClient(await signIn(sender.email));
      const { data, error } = await senderClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: null,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 8,
          listener_rating: 8,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: an unbound live row landed (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap (P1278): an ANONYMOUS caller cannot write a live row', async () => {
    // The founder's decision is that guests may record, and this policy deliberately does not
    // deliver that half: anon has no identity to bind, and clarity_sessions_select exposes
    // every target_listener_id IS NULL row — with creator_profile_id and joiner_profile_id
    // readable per P1057 — so an anon branch would let anyone enumerate real pairs and inflate
    // strangers' counters. Guest recording needs a code-bearing SECURITY DEFINER RPC; see
    // features/p1278_*.md.
    const ids: string[] = [];
    try {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await anonClient
        .from('story_verifications')
        .insert({
          story_id: letter.storyId,
          version_id: letter.versionId,
          session_id: liveSession.sessionId,
          speaker_id: sender.user.id,
          listener_id: reader.user.id,
          speaker_rating: 10,
          listener_rating: 10,
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1278: an anonymous caller wrote a live row (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('control: a SECURITY DEFINER writer (service_role fixture path) is unaffected', async () => {
    const ids: string[] = [];
    try {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          story_id: victimStoryId,
          speaker_id: victim.user.id,
          listener_id: attacker.user.id,
          speaker_rating: 10,
          listener_rating: 9,
          source: 'live',
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      ids.push(data!.id);
    } finally {
      await cleanupVerifications(ids);
    }
  });
});
