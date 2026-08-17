/**
 * @file 20260817120000_p1067_anon_rating_gates.spec.ts
 * @description P1067 (N2, N3): a rating must bind to the delivery it was made in.
 *
 * Migration: 20260817120000_p1067_anon_rating_gates.sql
 *
 * The properties under test:
 *   1. A sealed prediction is disclosed only to a caller who rated **in that
 *      delivery** — not to one who rated the same story in a sibling delivery.
 *   2. A rating submitted through an invitation token counts once, and only for
 *      a story that belongs to that letter.
 *
 * Findings, prod counts and the corrections behind them are deliberately NOT in
 * this file — see `.private/docs/security-log.md`.
 *
 * SIX LAYERS. Each is asserted separately, and L3 is a control on purpose.
 *
 *   L1. The unauthenticated write is refused today by a schema constraint rather
 *       than by a gate. Asserted as "refused, and nothing was written" so it holds
 *       whether the refusal stays incidental or becomes deliberate — the layer
 *       exists to pin that no anonymous caller can create a rating row at all,
 *       which is what makes L2/L4/L5 authenticated-caller tests rather than
 *       anonymous ones.
 *   L2. THE DEFECT. One identity holding two invitation tokens for the same
 *       letter rates under the first and reveals under the second, having rated
 *       nothing there. Must return nothing after the fix.
 *   L3. CONTROL — the legitimate reveal (rated in this delivery) must keep
 *       working. Without this layer, a fix that breaks every reveal passes L2.
 *   L4. Repeat submissions of the same rating must count once.
 *   L5. A story that is not part of this letter must not be ratable through this
 *       letter's token.
 *   L6. CATALOG layer. The linkage and the uniqueness that L2/L4 depend on must
 *       exist in `pg_catalog` after the migration. A migration recorded as
 *       applied is not evidence that the statement took effect.
 *
 * NOT COVERED BY THIS FILE (gate 7b — the fixture's blind spots, stated):
 *   - Whether the UI ever reaches L1's anonymous rating path. This file proves
 *     what the RPC does, not what a browser can drive it to do.
 *   - Historical rows whose delivery cannot be determined. The migration leaves
 *     them unlinked by design; no assertion here exercises that population.
 *   - Prod. Same reason as P1066: the live catalog must be re-read after deploy.
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

/** Role `anon`, no `sub` claim. */
function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function makeUserClient(email: string): Promise<SupabaseClient> {
  const temp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await temp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Rating rows for one story, whoever the listener is. Stable across the schema change. */
async function ratingRowsForStory(storyId: string): Promise<Array<{ listener_id: string }>> {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .select('listener_id')
    .eq('story_id', storyId)
    .eq('source', 'letter');
  if (error) throw new Error(`story_verifications read failed: ${error.message}`);
  return data ?? [];
}

async function storiesRated(deliveryId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('stories_rated')
    .eq('id', deliveryId)
    .single();
  if (error) throw new Error(`letter_deliveries read failed: ${error.message}`);
  return data!.stories_rated as number;
}

test.describe('P1067 — a rating binds to the delivery it was made in', () => {
  test.setTimeout(120000);

  let senderId: string;
  /** A signed-in reader who is the receiver of neither delivery. */
  let readerId: string;
  let readerEmail: string;

  let docId: string;
  let letterId: string;

  /** Both unclaimed — `receiver_profile_id IS NULL`, reachable by invitation token alone. */
  let deliveryA: { id: string; invitationToken: string };
  let deliveryB: { id: string; invitationToken: string };

  /** One story per layer, so layers cannot contaminate each other's row counts. */
  let storyL1: string;
  let storyL2: string;
  let storyL3: string;
  let storyL4: string;
  /** Never snapshotted into the letter — L5's target. */
  let foreignStoryId: string;

  const PREDICTION_B = 7;
  const PREDICTION_A = 4;

  test.beforeAll(async () => {
    const sender = await createTestUser({ name: 'P1067 Sender' });
    senderId = sender.user.id;

    const reader = await createTestUser({ name: 'P1067 Reader' });
    readerId = reader.user.id;
    readerEmail = reader.user.email!;

    docId = (await createTestDoc(senderId, 'P1067 gate fixture')).id;
    const letter = await createTestLetter(senderId, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    const mk = async (title: string) => {
      const story = await createTestStory(senderId, { title, visibility: 'public' });
      const versionId = await getTestStoryVersionId(story.id);
      await createTestStorySnapshot(letterId, story.id, versionId, { position: 0 });
      return story.id;
    };
    storyL1 = await mk('P1067 L1');
    storyL2 = await mk('P1067 L2');
    storyL3 = await mk('P1067 L3');
    storyL4 = await mk('P1067 L4');

    // Deliberately NOT snapshotted into this letter.
    foreignStoryId = (await createTestStory(senderId, { title: 'P1067 foreign', visibility: 'public' })).id;

    deliveryA = await createTestDelivery(letterId, { receiverEmail: 'p1067-a@example.com', status: 'sent' });
    deliveryB = await createTestDelivery(letterId, { receiverEmail: 'p1067-b@example.com', status: 'sent' });

    // Per-delivery sealed predictions: L2 proves the reader learns delivery B's
    // value while holding no rating there; L3 proves their own still resolves.
    await createTestPrediction(letterId, storyL2, PREDICTION_B, deliveryB.id);
    await createTestPrediction(letterId, storyL3, PREDICTION_A, deliveryA.id);

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    for (const s of [storyL1, storyL2, storyL3, storyL4, foreignStoryId].filter(Boolean)) {
      await supabaseAdmin.from('story_verifications').delete().eq('story_id', s);
      await deleteTestStory(s);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([senderId, readerId].filter(Boolean).map((id) => deleteTestUser(id)));
  });

  // =========================================================================
  // L1 — no anonymous caller can create a rating row
  // =========================================================================

  test('L1: an anonymous caller cannot record a rating, and writes nothing', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('submit_rating_by_token', {
      p_token: deliveryA.invitationToken,
      p_story_id: storyL1,
      p_rating: 6,
    });

    expect(error, 'anonymous rating: expected a refusal, got success').not.toBeNull();

    // Nothing was persisted, whichever layer refused it.
    expect(await ratingRowsForStory(storyL1), 'anonymous rating must write no row').toHaveLength(0);
    expect(await storiesRated(deliveryA.id), 'anonymous rating must not move the counter').toBe(0);
  });

  // =========================================================================
  // L2 — THE DEFECT: a rating in one delivery unlocks a sibling delivery
  // =========================================================================

  test('L2: rating under one token must not reveal the sibling delivery\'s prediction', async () => {
    const reader = await makeUserClient(readerEmail);

    const { error: rateErr } = await reader.rpc('submit_rating_by_token', {
      p_token: deliveryA.invitationToken,
      p_story_id: storyL2,
      p_rating: 5,
    });
    expect(rateErr, `rating under token A failed: ${rateErr?.message}`).toBeNull();

    // Same identity, the OTHER delivery's token, no rating made there.
    const { data, error } = await reader.rpc('reveal_prediction_by_token', {
      p_token: deliveryB.invitationToken,
      p_story_id: storyL2,
    });
    expect(error, `reveal under token B errored: ${error?.message}`).toBeNull();

    // Before the fix this returns { prediction: 7 } — delivery B's sealed value.
    expect(
      data,
      'a caller who rated in a sibling delivery must not receive this delivery\'s prediction',
    ).toBeNull();
  });

  // =========================================================================
  // L3 — CONTROL: the legitimate reveal still works
  // =========================================================================

  test('L3: rating under a token still reveals that delivery\'s own prediction', async () => {
    const reader = await makeUserClient(readerEmail);

    const { error: rateErr } = await reader.rpc('submit_rating_by_token', {
      p_token: deliveryA.invitationToken,
      p_story_id: storyL3,
      p_rating: 8,
    });
    expect(rateErr, `rating under token A failed: ${rateErr?.message}`).toBeNull();

    const { data, error } = await reader.rpc('reveal_prediction_by_token', {
      p_token: deliveryA.invitationToken,
      p_story_id: storyL3,
    });
    expect(error, `reveal under token A errored: ${error?.message}`).toBeNull();
    expect(data, 'the rater\'s own delivery must still reveal').not.toBeNull();
    expect((data as { prediction: number }).prediction).toBe(PREDICTION_A);
  });

  // =========================================================================
  // L4 — a repeated submission counts once
  // =========================================================================

  test('L4: repeat submissions of the same rating count once', async () => {
    const reader = await makeUserClient(readerEmail);
    const before = await storiesRated(deliveryA.id);

    for (let i = 0; i < 3; i++) {
      const { error } = await reader.rpc('submit_rating_by_token', {
        p_token: deliveryA.invitationToken,
        p_story_id: storyL4,
        p_rating: 7,
      });
      expect(error, `submission ${i + 1} errored: ${error?.message}`).toBeNull();
    }

    // Before the fix: three rows and a counter three higher.
    expect(await ratingRowsForStory(storyL4), 'three submissions must leave one row').toHaveLength(1);
    expect(await storiesRated(deliveryA.id), 'three submissions must count once').toBe(before + 1);
  });

  // =========================================================================
  // L5 — a story outside this letter is not ratable through its token
  // =========================================================================

  test('L5: a story that is not part of this letter cannot be rated through its token', async () => {
    const reader = await makeUserClient(readerEmail);
    const before = await storiesRated(deliveryA.id);

    await reader.rpc('submit_rating_by_token', {
      p_token: deliveryA.invitationToken,
      p_story_id: foreignStoryId,
      p_rating: 9,
    });

    // Before the fix a row is written and attributed to the letter's sender.
    expect(
      await ratingRowsForStory(foreignStoryId),
      'a story outside the letter must not gain a rating through this token',
    ).toHaveLength(0);
    expect(await storiesRated(deliveryA.id), 'a rejected rating must not move the counter').toBe(before);
  });

  // =========================================================================
  // L6 — CATALOG: the migration's statements took effect
  // =========================================================================

  test('L6: the delivery linkage and its uniqueness exist in the catalog', async () => {
    // Column presence, read from the catalog rather than from a migration file.
    const { error: colErr } = await supabaseAdmin
      .from('story_verifications')
      .select('delivery_id')
      .limit(1);
    expect(
      colErr,
      `story_verifications.delivery_id must exist: ${colErr?.message ?? 'ok'}`,
    ).toBeNull();

    // Uniqueness: a second row for the same (delivery, story) must be rejected by
    // the database, not merely avoided by the function. Proven by attempting it
    // twice here rather than relying on a row another layer wrote — tests in this
    // file run in parallel workers, each with its own fixture.
    const versionId = await getTestStoryVersionId(storyL4);
    const row = {
      story_id: storyL4,
      version_id: versionId,
      speaker_id: senderId,
      listener_id: readerId,
      listener_rating: 7,
      speaker_rating: 0,
      source: 'letter',
      verified: false,
      delivery_id: deliveryA.id,
    };

    const { error: firstErr } = await supabaseAdmin.from('story_verifications').insert(row);
    expect(firstErr, `the first rating row must be accepted: ${firstErr?.message}`).toBeNull();

    const { error: dupErr } = await supabaseAdmin.from('story_verifications').insert(row);
    expect(
      dupErr,
      'a duplicate (delivery, story) rating must be rejected by a constraint',
    ).not.toBeNull();
    expect(dupErr!.message).toMatch(/duplicate key|unique/i);
  });
});
