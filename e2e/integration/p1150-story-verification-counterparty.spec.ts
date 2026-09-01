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
 * The only direct client writers of this table are letter-screening ratings (caller = listener,
 * speaker = the letter's sender, speaker_rating = 0 placeholder, source = 'letter'). There is no
 * live-session client write path today (grep story_verifications src/ — letters-service.ts is the
 * only inserter); every other writer is a SECURITY DEFINER RPC that RLS does not govern.
 *
 * Run: npx playwright test --project=integration e2e/integration/p1150-story-verification-counterparty.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestLetter, createTestStorySnapshot, createTestDelivery, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';

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
}

async function createLetterFixture(sender: TestUser, reader: TestUser): Promise<LetterFixture> {
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
  await sealTestLetter(letter.id);
  return { docId: doc.id, storyId: story.id, versionId, letterId: letter.id, deliveryId: delivery.id };
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

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1150 Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1150 Victim' });
    sender = await createTestUser({ email: generateTestEmail(), name: 'P1150 Sender' });
    reader = await createTestUser({ email: generateTestEmail(), name: 'P1150 Reader' });
    victimStoryId = (await createTestStory(victim.user.id, { title: `P1150 victim story ${Date.now()}` })).id;
    letter = await createLetterFixture(sender, reader);
  });

  test.afterAll(async () => {
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
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: receiver attributed speaker_rating=10 to the sender (id ${data?.id})`).not.toBeNull();
    } finally {
      await cleanupVerifications(ids);
    }
  });

  test('gap: the receiver cannot mark a letter rating verified or bind it to a session', async () => {
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
        })
        .select('id')
        .single();
      if (data?.id) ids.push(data.id);
      expect(error, `P1150 not fixed: receiver wrote a verified=true letter row (id ${data?.id})`).not.toBeNull();
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
        })
        .select('id, listener_rating, speaker_rating, accuracy_achieved, source, verified')
        .single();
      expect(error, `letter-screening rating regressed: ${error?.message}`).toBeNull();
      ids.push(data!.id);
      expect(data!.listener_rating).toBe(8);
      expect(data!.speaker_rating).toBe(0);
      expect(data!.accuracy_achieved).toBe(false);

      // Counters move exactly as the product intends: the reader (listener) gains an ear on a new
      // story and a session; the sender (speaker) gains a session.
      const readerAfter = await counters(reader.user.id);
      const senderAfter = await counters(sender.user.id);
      expect(readerAfter.ears).toBe(readerBefore.ears + 1);
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
