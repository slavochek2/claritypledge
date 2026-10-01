/**
 * @file 20260930120000_p1379_public_letters_no_author_prediction.spec.ts
 * @description P1379 A3: a one-to-many letter never discloses the author's prediction —
 * on the server, on every read path — while one-to-one letters are unchanged.
 *
 * Migration: 20260930120000_p1379_public_letters_no_author_prediction.sql
 *
 * Fixture: ONE reader who is the claimed receiver of two sealed letters from ONE sender.
 *   - MANY: mode 'one-to-many', SEEDED WITH a shared prediction (delivery_id NULL) —
 *     the known-bad input: an old public letter sealed before P1379.
 *   - ONE:  mode 'one-to-one', delivery-specific prediction — the CONTROL.
 * The reader has rated the story of each letter (the sealed-bid gate is open for both),
 * so the only thing that differs between the two columns of every assertion is MODE.
 *
 * Layers (each MANY assertion is paired with its ONE control, so a fix that breaks
 * every reveal cannot pass):
 *   L1 get_letter_for_public_reading (anon)          MANY → predictions [] (snapshots still returned)
 *   L2 reveal_prediction_by_token (reader)           MANY → null      | ONE → { prediction }
 *   L3 reveal_prediction (reader)                    MANY → null      | ONE → value
 *   L4 get_letter_results, receiver perspective      MANY → []        | ONE → [value]
 *   L5 get_letter_results, sender perspective        MANY → []        | ONE → [value]
 *   L6 direct SELECT on letter_predictions (reader, anon key + JWT)
 *                                                    MANY → 0 rows    | ONE → 1 row
 *   L7 sender branch of the RLS policy is unchanged  MANY → sender still reads own row
 *   L8 guards kept: anon reveal on one-to-many still refused (P684); reveal_prediction
 *      still refuses a null identity (P1066)
 *   L9 no data deleted: MANY's letter_predictions row count unchanged
 *
 * NOT COVERED BY THIS FILE (the fixture's blind spots):
 *   - What a browser renders. The UI half is covered by the unit tests
 *     (src/tests/p1379-*.test.tsx) and e2e/p1379-public-letter-no-prediction.spec.ts.
 *   - Prod. Re-verify /letter/ck's public reading response after deploy ([post-deploy]).
 *
 * If layers fail before the fix: that is the point. Run `./scripts/migrate.sh`.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createTestDoc,
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  createTestPrediction,
  getTestStoryVersionId,
  sealTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function makeUserClient(email: string): Promise<SupabaseClient> {
  const temp = makeAnonClient();
  const { data, error } = await temp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('P1379 — one-to-many letters never disclose the author prediction', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  let senderId: string;
  let senderEmail: string;
  let readerId: string;
  let readerEmail: string;
  let docId: string;

  let manyLetterId: string;
  let manyStoryId: string;
  let manyDelivery: { id: string; invitationToken: string };

  let oneLetterId: string;
  let oneStoryId: string;
  let oneDelivery: { id: string; invitationToken: string };

  const MANY_PREDICTION = 8;
  const ONE_PREDICTION = 6;

  async function rate(storyId: string, deliveryId: string, rating: number) {
    const versionId = await getTestStoryVersionId(storyId);
    const { error } = await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      version_id: versionId,
      speaker_id: senderId,
      listener_id: readerId,
      listener_rating: rating,
      speaker_rating: 0,
      source: 'letter',
      verified: false,
      delivery_id: deliveryId,
    });
    if (error) throw new Error(`rating insert failed: ${error.message}`);
  }

  test.beforeAll(async () => {
    const sender = await createTestUser({ name: 'P1379 Sender' });
    senderId = sender.user.id;
    senderEmail = sender.user.email!;
    const reader = await createTestUser({ name: 'P1379 Reader' });
    readerId = reader.user.id;
    readerEmail = reader.user.email!;

    docId = (await createTestDoc(senderId, 'P1379 fixture')).id;

    // MANY — the known-bad input: one-to-many, sealed WITH a shared prediction.
    manyLetterId = (await createTestLetter(senderId, docId, { mode: 'one-to-many' })).id;
    manyStoryId = (await createTestStory(senderId, { title: 'P1379 many', visibility: 'public' })).id;
    await createTestStorySnapshot(manyLetterId, manyStoryId, await getTestStoryVersionId(manyStoryId), { position: 0 });
    manyDelivery = await createTestDelivery(manyLetterId, { receiverProfileId: readerId, status: 'in_progress' });
    await createTestPrediction(manyLetterId, manyStoryId, MANY_PREDICTION, null);
    // "Just read" — the UAT bug: public reading omitted responses_mode and the client
    // fell back to 'invite'.
    await supabaseAdmin.from('clarity_letters').update({ responses_mode: 'off' }).eq('id', manyLetterId);
    await sealTestLetter(manyLetterId);

    // ONE — the control: one-to-one, delivery-specific prediction.
    oneLetterId = (await createTestLetter(senderId, docId, { mode: 'one-to-one' })).id;
    oneStoryId = (await createTestStory(senderId, { title: 'P1379 one', visibility: 'public' })).id;
    await createTestStorySnapshot(oneLetterId, oneStoryId, await getTestStoryVersionId(oneStoryId), { position: 0 });
    oneDelivery = await createTestDelivery(oneLetterId, {
      receiverEmail: 'p1379-one@example.com',
      receiverProfileId: readerId,
      status: 'in_progress',
    });
    await createTestPrediction(oneLetterId, oneStoryId, ONE_PREDICTION, oneDelivery.id);
    await sealTestLetter(oneLetterId);

    // The reader has rated both stories — the sealed-bid gate is open for both.
    await rate(manyStoryId, manyDelivery.id, 4);
    await rate(oneStoryId, oneDelivery.id, 7);
  });

  test.afterAll(async () => {
    for (const id of [manyLetterId, oneLetterId].filter(Boolean)) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', id);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', id);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', id);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', id);
    }
    for (const s of [manyStoryId, oneStoryId].filter(Boolean)) {
      await supabaseAdmin.from('story_verifications').delete().eq('story_id', s);
      await deleteTestStory(s);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([senderId, readerId].filter(Boolean).map((id) => deleteTestUser(id)));
  });

  test('L1: public reading RPC returns no predictions for a one-to-many letter (anon)', async () => {
    const { data, error } = await makeAnonClient().rpc('get_letter_for_public_reading', {
      p_letter_id: manyLetterId,
    });
    expect(error, error?.message).toBeNull();
    const payload = data as { letter: { mode: string; responses_mode?: string }; snapshots: unknown[]; predictions: unknown[] };
    // UAT fix: the author's response intensity is part of the public payload.
    expect(payload.letter.responses_mode).toBe('off');
    // Shape control: the RPC still serves the letter (a broken RPC returning NULL would also be "no predictions").
    expect(payload.letter.mode).toBe('one-to-many');
    expect(payload.snapshots).toHaveLength(1);
    expect(payload.predictions).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain(`"prediction":${MANY_PREDICTION}`);
  });

  test('L1b: get_letter_for_reading (token path) returns responses_mode', async () => {
    const { data: row } = await supabaseAdmin.from('clarity_letters').select('responses_mode').eq('id', oneLetterId).single();
    const { data, error } = await makeAnonClient().rpc('get_letter_for_reading', { p_token: oneDelivery.invitationToken });
    expect(error, error?.message).toBeNull();
    const letter = (data as { letter: { mode: string; responses_mode?: string } }).letter;
    expect(letter.mode).toBe('one-to-one');
    expect(letter.responses_mode).toBeDefined();
    expect(letter.responses_mode).toBe(row!.responses_mode);
  });

  test('L2: reveal_prediction_by_token — null for one-to-many, value for one-to-one', async () => {
    const reader = await makeUserClient(readerEmail);
    const many = await reader.rpc('reveal_prediction_by_token', {
      p_token: manyDelivery.invitationToken,
      p_story_id: manyStoryId,
    });
    expect(many.error, many.error?.message).toBeNull();
    expect(many.data).toBeNull();

    const one = await reader.rpc('reveal_prediction_by_token', {
      p_token: oneDelivery.invitationToken,
      p_story_id: oneStoryId,
    });
    expect(one.error, one.error?.message).toBeNull();
    expect(one.data).toEqual({ prediction: ONE_PREDICTION });
  });

  test('L3: reveal_prediction — null for one-to-many, value for one-to-one', async () => {
    const reader = await makeUserClient(readerEmail);
    const many = await reader.rpc('reveal_prediction', { p_delivery_id: manyDelivery.id, p_story_id: manyStoryId });
    expect(many.error, many.error?.message).toBeNull();
    expect(many.data).toBeNull();

    const one = await reader.rpc('reveal_prediction', { p_delivery_id: oneDelivery.id, p_story_id: oneStoryId });
    expect(one.error, one.error?.message).toBeNull();
    expect(one.data).toBe(ONE_PREDICTION);
  });

  test('L4: get_letter_results (receiver) — [] for one-to-many, the value for one-to-one', async () => {
    const reader = await makeUserClient(readerEmail);
    const many = await reader.rpc('get_letter_results', { p_letter_id: manyLetterId, p_delivery_id: manyDelivery.id });
    expect(many.error, many.error?.message).toBeNull();
    const manyRow = (many.data as Array<{ perspective: string; predictions: unknown[]; ratings: unknown[] }>)[0]!;
    expect(manyRow.perspective).toBe('receiver');
    expect(manyRow.predictions).toEqual([]);
    // Control inside the same call: the reader's own rating is still returned.
    expect(manyRow.ratings).toEqual([{ story_id: manyStoryId, listener_rating: 4 }]);

    const one = await reader.rpc('get_letter_results', { p_letter_id: oneLetterId, p_delivery_id: oneDelivery.id });
    expect(one.error, one.error?.message).toBeNull();
    const oneRow = (one.data as Array<{ predictions: unknown[] }>)[0]!;
    expect(oneRow.predictions).toEqual([{ story_id: oneStoryId, prediction: ONE_PREDICTION }]);
  });

  test('L5: get_letter_results (sender) — [] for one-to-many, the value for one-to-one', async () => {
    const sender = await makeUserClient(senderEmail);
    const many = await sender.rpc('get_letter_results', { p_letter_id: manyLetterId, p_delivery_id: manyDelivery.id });
    expect(many.error, many.error?.message).toBeNull();
    const manyRow = (many.data as Array<{ perspective: string; predictions: unknown[]; ratings: unknown[] }>)[0]!;
    expect(manyRow.perspective).toBe('sender');
    expect(manyRow.predictions).toEqual([]);
    expect(manyRow.ratings).toEqual([{ story_id: manyStoryId, listener_rating: 4 }]);

    const one = await sender.rpc('get_letter_results', { p_letter_id: oneLetterId, p_delivery_id: oneDelivery.id });
    expect(one.error, one.error?.message).toBeNull();
    const oneRow = (one.data as Array<{ predictions: unknown[] }>)[0]!;
    expect(oneRow.predictions).toEqual([{ story_id: oneStoryId, prediction: ONE_PREDICTION }]);
  });

  test('L6: direct SELECT on letter_predictions as the rated receiver — 0 rows one-to-many, 1 row one-to-one', async () => {
    const reader = await makeUserClient(readerEmail);
    const many = await reader.from('letter_predictions').select('prediction').eq('letter_id', manyLetterId);
    expect(many.error, many.error?.message).toBeNull();
    expect(many.data).toEqual([]);

    const one = await reader.from('letter_predictions').select('prediction').eq('letter_id', oneLetterId);
    expect(one.error, one.error?.message).toBeNull();
    expect(one.data).toEqual([{ prediction: ONE_PREDICTION }]);
  });

  test('L7: the RLS sender branch is unchanged — the author still reads their own one-to-many row', async () => {
    const sender = await makeUserClient(senderEmail);
    const { data, error } = await sender.from('letter_predictions').select('prediction').eq('letter_id', manyLetterId);
    expect(error, error?.message).toBeNull();
    expect(data).toEqual([{ prediction: MANY_PREDICTION }]);
  });

  test('L8: earlier guards kept — P684 anon refusal and P1066 null-identity refusal', async () => {
    const anon = makeAnonClient();
    const byToken = await anon.rpc('reveal_prediction_by_token', {
      p_token: manyDelivery.invitationToken,
      p_story_id: manyStoryId,
    });
    expect(byToken.error?.message ?? '').toMatch(/Authentication required for one-to-many/);

    const direct = await anon.rpc('reveal_prediction', { p_delivery_id: oneDelivery.id, p_story_id: oneStoryId });
    // anon holds no EXECUTE (P1066 revoke restated) — refused either by grant or by the identity check.
    expect(direct.error).not.toBeNull();
    expect(direct.data ?? null).toBeNull();
  });

  test('L9: no rows deleted — the one-to-many letter still stores its prediction', async () => {
    const { data, error } = await supabaseAdmin
      .from('letter_predictions')
      .select('prediction')
      .eq('letter_id', manyLetterId);
    expect(error, error?.message).toBeNull();
    expect(data).toEqual([{ prediction: MANY_PREDICTION }]);
  });
});
