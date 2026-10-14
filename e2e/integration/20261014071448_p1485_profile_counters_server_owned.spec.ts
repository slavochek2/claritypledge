/**
 * @file 20261014071448_p1485_profile_counters_server_owned.spec.ts
 * @description P1485 — the two public profile counters are server-maintained: only the
 * database's own counter paths may move them, never a signed-in client writing its own row.
 *
 * Runs against the TEST project as real signed-in users over the anon key (the repo is public,
 * so nothing here relies on the client being honest). State is arranged via supabaseAdmin and
 * every assertion reads the persisted value back with the service role.
 *
 * Controls (epistemic gate 7c — the guard must not break what already works):
 *   - an ordinary own-profile edit still saves, in the same request as the refused fields;
 *   - the product's rating write (letters-service submitRating shape, as the signed-in reader)
 *     still moves both participants' counters through the database's counter trigger;
 *   - account erasure still recomputes a counterpart's counters;
 *   - the service role (admin / test seeding) can still set them.
 *
 * Run: npx playwright test --project=integration e2e/integration/20261014071448_p1485_profile_counters_server_owned.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestLetter, createTestStorySnapshot, createTestDelivery, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';

test.describe.configure({ mode: 'serial' });

const FORGED = 4242;
// Distinct, non-zero seeds: a guard that reset counters to 0 (or swapped them) must fail.
const SEED_A = { ears: 3, sessions: 11 };
const SEED_B = { ears: 5, sessions: 17 };

/** Service role (the admin path the guard leaves open) sets known values; returns them. */
async function seedCounters(profileId: string, v: { ears: number; sessions: number }) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ ears_count: v.ears, verification_session_count: v.sessions })
    .eq('id', profileId);
  if (error) throw new Error(`seed counters failed: ${error.message}`);
  return v;
}

async function signedIn(email: string): Promise<SupabaseClient> {
  // Throwaway auth client — signing in on supabaseAdmin would replace its service-role session.
  const auth = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

interface LetterFixture { docId: string; storyId: string; versionId: string; letterId: string; deliveryId: string }

/** sender → reader, one story, sealed, delivery bound to the reader (same shape as P1150's fixture). */
async function createLetterFixture(sender: TestUser, reader: TestUser): Promise<LetterFixture> {
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P1485 doc ${Date.now()}`, owner_id: sender.user.id })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`doc create failed: ${docError?.message}`);
  const story = await createTestStory(sender.user.id, { title: `P1485 story ${Date.now()}` });
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

async function deleteLetterFixture(f: LetterFixture | undefined) {
  if (!f) return;
  // Only rows this spec created: verifications on this spec's own story.
  await supabaseAdmin.from('story_verifications').delete().eq('story_id', f.storyId);
  await deleteTestLetter(f.letterId);
  await deleteTestStory(f.storyId);
  await supabaseAdmin.from('clarity_docs').delete().eq('id', f.docId);
}

/** The exact payload letters-service.ts submitRating sends. */
function ratingPayload(f: LetterFixture, sender: TestUser, reader: TestUser) {
  return {
    story_id: f.storyId,
    version_id: f.versionId,
    speaker_id: sender.user.id,
    listener_id: reader.user.id,
    listener_rating: 8,
    speaker_rating: 0,
    source: 'letter',
    verified: false,
    session_id: null,
    delivery_id: f.deliveryId,
  };
}

let member: TestUser;
let sender: TestUser;
let reader: TestUser;
let eraser: TestUser;
let letter: LetterFixture | undefined;
let eraserLetter: LetterFixture | undefined;

test.beforeAll(async () => {
  member = await createTestUser({ email: generateTestEmail(), name: 'P1485 Member' });
  sender = await createTestUser({ email: generateTestEmail(), name: 'P1485 Sender' });
  reader = await createTestUser({ email: generateTestEmail(), name: 'P1485 Reader' });
  eraser = await createTestUser({ email: generateTestEmail(), name: 'P1485 Eraser' });
  letter = await createLetterFixture(sender, reader);
  eraserLetter = await createLetterFixture(sender, eraser);
});

test.afterAll(async () => {
  await deleteLetterFixture(letter);
  await deleteLetterFixture(eraserLetter);
  for (const u of [member, sender, reader, eraser]) {
    if (u) await deleteTestUser(u.user.id).catch(() => undefined); // eraser is already gone
  }
});

test.describe('P1485: server-maintained profile counters are not client-writable', () => {
  test('a signed-in user cannot change their own counters by UPDATE; the rest of the edit saves', async () => {
    const seeded = await seedCounters(member.user.id, SEED_A);
    const c = await signedIn(member.email);
    const { error } = await c
      .from('profiles')
      .update({ ears_count: FORGED, verification_session_count: FORGED, role: 'P1485 edited role' })
      .eq('id', member.user.id);
    expect(error, `own-profile update errored: ${error?.message}`).toBeNull();

    expect(await counters(member.user.id)).toEqual(seeded);
    const { data } = await supabaseAdmin.from('profiles').select('role').eq('id', member.user.id).single();
    expect(data!.role).toBe('P1485 edited role');
  });

  test('a signed-in user cannot carry counters in through upsert', async () => {
    const seeded = await seedCounters(member.user.id, SEED_B);
    const c = await signedIn(member.email);
    // Only columns a client may read: a full-row upsert is refused outright (it would name the
    // owner-only columns in the conflict SET), which would prove nothing about the counters.
    const { data: row } = await supabaseAdmin.from('profiles').select('id, slug, name').eq('id', member.user.id).single();
    const { error } = await c
      .from('profiles')
      .upsert({ ...row, ears_count: FORGED, verification_session_count: FORGED });
    expect(error, `own-profile upsert errored: ${error?.message}`).toBeNull();
    expect(await counters(member.user.id)).toEqual(seeded);
  });

  test('control: an ordinary own-profile edit (updateProfile shape) saves and leaves the counters as stored', async () => {
    const seeded = await seedCounters(member.user.id, SEED_A);
    const c = await signedIn(member.email);
    const { error } = await c
      .from('profiles')
      .update({ name: 'P1485 Member Renamed', bio: 'P1485 bio', pledge_version: 2 })
      .eq('id', member.user.id);
    expect(error, `ordinary edit regressed: ${error?.message}`).toBeNull();
    const { data } = await supabaseAdmin.from('profiles').select('name, bio').eq('id', member.user.id).single();
    expect(data).toEqual({ name: 'P1485 Member Renamed', bio: 'P1485 bio' });
    expect(await counters(member.user.id)).toEqual(seeded);
  });

  test('a re-created profile starts its counters at 0, whatever the INSERT carries', async () => {
    await seedCounters(member.user.id, SEED_B);
    const c = await signedIn(member.email);
    const { data: before } = await supabaseAdmin.from('profiles').select('*').eq('id', member.user.id).single();
    expect(before!.ears_count).toBe(SEED_B.ears); // the row being re-inserted carries non-zero values
    const { error: delErr } = await c.from('profiles').delete().eq('id', member.user.id);
    expect(delErr, `own-profile delete errored: ${delErr?.message}`).toBeNull();
    const { error: insErr } = await c
      .from('profiles')
      .insert({ ...before, ears_count: FORGED, verification_session_count: FORGED });
    expect(insErr, `own-profile insert errored: ${insErr?.message}`).toBeNull();
    expect(await counters(member.user.id)).toEqual({ ears: 0, sessions: 0 });
  });

  // ── CONTROLS (legitimate writers) ───────────────────────────────────────────────────────

  test('control: the product rating write still moves both participants\' counters', async () => {
    const readerBefore = await counters(reader.user.id);
    const senderBefore = await counters(sender.user.id);

    const readerClient = await signedIn(reader.email);
    const { error } = await readerClient
      .from('story_verifications')
      .insert(ratingPayload(letter!, sender, reader))
      .select('id')
      .single();
    expect(error, `letter rating regressed: ${error?.message}`).toBeNull();

    const readerAfter = await counters(reader.user.id);
    const senderAfter = await counters(sender.user.id);
    expect(readerAfter.ears).toBe(readerBefore.ears + 1); // one new distinct story
    expect(readerAfter.sessions).toBe(readerBefore.sessions + 1);
    expect(senderAfter.sessions).toBe(senderBefore.sessions + 1);
  });

  test('control: the service role (admin / seeding path) can still set the counters', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ ears_count: 7, verification_session_count: 9 })
      .eq('id', member.user.id);
    expect(error).toBeNull();
    expect(await counters(member.user.id)).toEqual({ ears: 7, sessions: 9 });
  });

  test('control: account erasure still recomputes a counterpart\'s counters', async () => {
    // The eraser rates the sender's second letter → sender gains a session via the trigger.
    const eraserClient = await signedIn(eraser.email);
    const { error: rateErr } = await eraserClient
      .from('story_verifications')
      .insert(ratingPayload(eraserLetter!, sender, eraser))
      .select('id')
      .single();
    expect(rateErr, `eraser rating failed: ${rateErr?.message}`).toBeNull();

    // Put a marker value on the sender that only a server-side recompute can replace.
    const { error: markErr } = await supabaseAdmin
      .from('profiles')
      .update({ verification_session_count: 999 })
      .eq('id', sender.user.id);
    expect(markErr).toBeNull();

    const { error: eraseErr } = await eraserClient.rpc('erase_my_account');
    expect(eraseErr, `erase_my_account failed: ${eraseErr?.message}`).toBeNull();

    // Recompute = the sender's remaining rows (the reader's one rating from the earlier control).
    const { count: asListener } = await supabaseAdmin
      .from('story_verifications').select('id', { count: 'exact', head: true }).eq('listener_id', sender.user.id);
    const { data: asSpeaker } = await supabaseAdmin
      .from('story_verifications').select('speaker_id, listener_id').eq('speaker_id', sender.user.id);
    const expected = (asListener ?? 0) + (asSpeaker ?? []).filter((r) => r.listener_id !== r.speaker_id).length;
    expect((await counters(sender.user.id)).sessions).toBe(expected);
    expect(expected).not.toBe(999);
  });
});
