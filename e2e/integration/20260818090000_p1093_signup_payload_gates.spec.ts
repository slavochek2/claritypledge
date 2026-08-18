/**
 * @file 20260818090000_p1093_signup_payload_gates.spec.ts
 * @description P1093: the sign-up-after-reading writer accepted an unchecked caller payload.
 *
 * Migration: 20260818090000_p1093_close_unchecked_payload_writer.sql
 *
 * WHAT THE EVIDENCE CHANGED. The spec was written expecting a browser caller whose
 * payload needed validating. There is none: `persist_anonymous_completion` has no
 * call site anywhere in the repo, and on prod it has never written a row (it is the
 * only writer of `story_verifications.sort_order`, and that column is NULL across
 * every row on prod). It was reachable by any signed-in user regardless. A writer
 * with no caller does not need its payload validated — it needs its grant removed.
 *
 * The replay it was built for (P705: staged `letter_point_responses` copied into
 * `point_positions` once a reader verifies) therefore never ran either. That half is
 * real and is restored here as `replay_letter_positions()` — which takes **no
 * parameters at all**, deriving caller, deliveries and positions from server state.
 * A function with no payload has no payload to forge; that is the fix's whole shape.
 *
 * SEVEN LAYERS. L4/L5 are controls on purpose.
 *
 *   L1. THE DEFECT. A signed-in receiver records a rating for a story that is not
 *       in the letter, naming a third party as the speaker. Must be refused.
 *   L2. THE DEFECT, second field. Same call, a story that IS in the letter, but the
 *       speaker forged to a third party. Must be refused.
 *   L3. THE DEFECT, sibling table. The positions half of the same payload writes a
 *       caller-chosen point into `letter_point_responses` and then `point_positions`.
 *       Not named in the spec; found by reading the body. Must be refused.
 *   L4. CONTROL — an anonymous caller was already refused (P1063) and must stay so.
 *       Guards against a fix that rewrites grants and reopens the anon path.
 *   L5. CONTROL — the legitimate rating path must keep working. Without this, a fix
 *       that breaks every letter rating passes L1-L3.
 *   L6. THE RESTORED HALF. Replay writes the reader's staged positions into
 *       `point_positions`, and takes no caller payload to do it.
 *   L7. CATALOG — proven behaviourally, by attempting the calls, not by reading the
 *       migration ledger. A migration recorded as applied is not evidence.
 *
 * NOT COVERED BY THIS FILE (gate 7b — the fixture's blind spots, stated plainly):
 *   - `service_role` retains EXECUTE on the old writer. Nothing here exercises a
 *     service-role caller, so that path stays untested by this file.
 *   - Prod. The live catalog must be re-read after deploy; test proves nothing there.
 *   - Whether any UI reaches the replay. This file proves what the RPC does, not
 *     what a browser drives it to do.
 *
 * If layers fail before the fix: that is the point. Run `./scripts/migrate.sh`.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import {
  createTestDoc,
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  getTestStoryVersionId,
  sealTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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

async function ratingRowsForStory(storyId: string): Promise<Array<{ speaker_id: string }>> {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .select('speaker_id')
    .eq('story_id', storyId)
    .eq('source', 'letter');
  if (error) throw new Error(`story_verifications read failed: ${error.message}`);
  return data ?? [];
}

async function positionRowsForPoint(pointId: string, userId: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin
    .from('point_positions')
    .select('point_id')
    .eq('point_id', pointId)
    .eq('user_id', userId);
  if (error) throw new Error(`point_positions read failed: ${error.message}`);
  return data ?? [];
}

test.describe('P1093 — the payload writer is closed, the replay is payload-free', () => {
  test.setTimeout(120000);

  let senderId: string;
  /** The delivery's claimed receiver — the caller who could reach the defect. */
  let readerId: string;
  let readerEmail: string;
  /** Never a party to the letter. The identity L1/L2 try to credit. */
  let outsiderId: string;

  let docId: string;
  let letterId: string;
  let delivery: { id: string; invitationToken: string };

  /** One story per layer, so layers cannot contaminate each other's row counts. */
  let storyInLetter: string;
  let storyL2: string;
  let storyL5: string;
  /** Never snapshotted into the letter — L1's target. */
  let foreignStoryId: string;
  let foreignVersionId: string;

  /** L3's target: a point the letter never referenced. */
  let foreignPointId: string;
  /** L6's fixture: a point staged against this delivery, awaiting replay. */
  let stagedPointId: string;
  /** L9's fixture: an UNVERIFIED reader with their own delivery and staged point. */
  let unverifiedReaderId: string;
  let unverifiedReaderEmail: string;
  let unverifiedPointId: string;
  let unverifiedDeliveryId: string;

  test.beforeAll(async () => {
    const sender = await createTestUser({ name: 'P1093 Sender' });
    senderId = sender.user.id;

    const reader = await createTestUser({ name: 'P1093 Reader' });
    readerId = reader.user.id;
    readerEmail = reader.user.email!;

    const outsider = await createTestUser({ name: 'P1093 Outsider' });
    outsiderId = outsider.user.id;

    docId = (await createTestDoc(senderId, 'P1093 gate fixture')).id;
    const letter = await createTestLetter(senderId, docId, { mode: 'one-to-one' });
    letterId = letter.id;

    const mk = async (title: string, position: number) => {
      const story = await createTestStory(senderId, { title, visibility: 'public' });
      const versionId = await getTestStoryVersionId(story.id);
      await createTestStorySnapshot(letterId, story.id, versionId, { position });
      return story.id;
    };
    storyInLetter = await mk('P1093 L2 in-letter', 0);
    storyL2 = storyInLetter;
    storyL5 = await mk('P1093 L5 control', 1);

    const foreign = await createTestStory(senderId, { title: 'P1093 foreign', visibility: 'public' });
    foreignStoryId = foreign.id;
    foreignVersionId = await getTestStoryVersionId(foreignStoryId);

    foreignPointId = (await createTestPoint(senderId, { statement: 'P1093 foreign point' })).id;
    stagedPointId = (await createTestPoint(senderId, { statement: 'P1093 staged point' })).id;

    // Claimed delivery: `persist_anonymous_completion` resolves the delivery by
    // (letter, auth.uid()), so the reader must be its receiver to reach the body.
    delivery = await createTestDelivery(letterId, {
      receiverEmail: readerEmail,
      receiverProfileId: readerId,
      status: 'in_progress',
    });

    await sealTestLetter(letterId);

    // L6 fixture: a staged position written through the gated path, exactly as an
    // unverified reader's response lands today. Replay must lift it into the live store.
    // 'unsure' on purpose, NOT 'agree'. The list this replay inherited carried three
    // labels that are not in `position_type` at all ('slightly_disagree', 'neutral',
    // 'slightly_agree'), so it silently dropped the three real middle values. A layer
    // staging 'agree' passes against both the broken list and the correct one, which is
    // exactly how the defect survived the first run of this file.
    const { error: stageErr } = await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: delivery.id,
      point_id: stagedPointId,
      position: 'unsure',
    });
    if (stageErr) throw new Error(`staging insert failed: ${stageErr.message}`);

    // L9 fixture: a reader who has NOT verified. `point_positions` RLS admits only
    // verified users; the replay is SECURITY DEFINER and therefore bypasses that policy
    // unless it re-checks the flag itself.
    const unverified = await createTestUser({ name: 'P1093 Unverified Reader' });
    unverifiedReaderId = unverified.user.id;
    unverifiedReaderEmail = unverified.user.email!;
    const { error: unverErr } = await supabaseAdmin
      .from('profiles').update({ is_verified: false }).eq('id', unverifiedReaderId);
    if (unverErr) throw new Error(`could not unverify reader: ${unverErr.message}`);

    const unverifiedDelivery = await createTestDelivery(letterId, {
      receiverEmail: unverifiedReaderEmail,
      receiverProfileId: unverifiedReaderId,
      status: 'in_progress',
    });
    unverifiedDeliveryId = unverifiedDelivery.id;
    unverifiedPointId = (await createTestPoint(senderId, { statement: 'P1093 unverified point' })).id;

    const { error: stage2Err } = await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: unverifiedDeliveryId,
      point_id: unverifiedPointId,
      position: 'agree',
    });
    if (stage2Err) throw new Error(`unverified staging insert failed: ${stage2Err.message}`);
  });

  test.afterAll(async () => {
    if (delivery?.id) {
      await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', delivery.id);
    }
    if (letterId) {
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    for (const p of [foreignPointId, stagedPointId, unverifiedPointId].filter(Boolean)) {
      await supabaseAdmin.from('point_positions').delete().eq('point_id', p);
      await deleteTestPoint(p);
    }
    for (const s of [storyInLetter, storyL5, foreignStoryId].filter(Boolean)) {
      await supabaseAdmin.from('story_verifications').delete().eq('story_id', s);
      await deleteTestStory(s);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all(
      [senderId, readerId, outsiderId, unverifiedReaderId].filter(Boolean).map((id) => deleteTestUser(id)),
    );
  });

  // =========================================================================
  // L1 — THE DEFECT: a story outside the letter, credited to a third party
  // =========================================================================

  test('L1: a signed-in receiver cannot record a rating for a story outside the letter', async () => {
    const reader = await makeUserClient(readerEmail);

    const { error } = await reader.rpc('persist_anonymous_completion', {
      p_nonce: NIL_UUID,
      p_letter_id: letterId,
      p_ratings: [
        {
          story_id: foreignStoryId,
          version_id: foreignVersionId,
          speaker_id: outsiderId,
          rating: 7,
          sort_order: 0,
        },
      ],
      p_positions: [],
    });

    expect(
      await ratingRowsForStory(foreignStoryId),
      'a story outside the letter must not gain a rating through this path',
    ).toHaveLength(0);

    expect(
      error?.code,
      `the writer must refuse a signed-in caller outright (got ${error?.code ?? 'no error'})`,
    ).toBe('42501');
  });

  // =========================================================================
  // L2 — THE DEFECT: an in-letter story, but the speaker forged
  // =========================================================================

  test('L2: a signed-in receiver cannot name an arbitrary profile as the speaker', async () => {
    const reader = await makeUserClient(readerEmail);
    const versionId = await getTestStoryVersionId(storyL2);

    const { error } = await reader.rpc('persist_anonymous_completion', {
      p_nonce: NIL_UUID,
      p_letter_id: letterId,
      p_ratings: [
        {
          story_id: storyL2,
          version_id: versionId,
          speaker_id: outsiderId,
          rating: 9,
          sort_order: 0,
        },
      ],
      p_positions: [],
    });

    const credited = (await ratingRowsForStory(storyL2)).map((r) => r.speaker_id);
    expect(
      credited,
      'no rating may be credited to a profile that is not the letter sender',
    ).not.toContain(outsiderId);

    expect(
      error?.code,
      `the writer must refuse a signed-in caller outright (got ${error?.code ?? 'no error'})`,
    ).toBe('42501');
  });

  // =========================================================================
  // L3 — THE DEFECT, sibling table: a caller-chosen point becomes their position
  // =========================================================================

  test('L3: a signed-in receiver cannot stage a position on a point outside the letter', async () => {
    const reader = await makeUserClient(readerEmail);

    const { error } = await reader.rpc('persist_anonymous_completion', {
      p_nonce: NIL_UUID,
      p_letter_id: letterId,
      p_ratings: [],
      p_positions: [{ point_id: foreignPointId, position: 'strongly_agree' }],
    });

    expect(
      await positionRowsForPoint(foreignPointId, readerId),
      'a point outside the letter must not become the caller position',
    ).toHaveLength(0);

    expect(
      error?.code,
      `the writer must refuse a signed-in caller outright (got ${error?.code ?? 'no error'})`,
    ).toBe('42501');
  });

  // =========================================================================
  // L4 — CONTROL: the anon refusal from P1063 must survive this change
  // =========================================================================

  test('L4: an anonymous caller is still refused', async () => {
    const anon = makeAnonClient();

    const { error } = await anon.rpc('persist_anonymous_completion', {
      p_nonce: NIL_UUID,
      p_letter_id: letterId,
      p_ratings: [],
      p_positions: [],
    });

    expect(
      error?.code,
      'P1063 REGRESSION: an anonymous caller reached the completion writer',
    ).toBe('42501');
  });

  // =========================================================================
  // L5 — CONTROL: the legitimate rating path still works
  // =========================================================================

  test('L5: the legitimate token rating path is unaffected', async () => {
    const reader = await makeUserClient(readerEmail);

    const { error } = await reader.rpc('submit_rating_by_token', {
      p_token: delivery.invitationToken,
      p_story_id: storyL5,
      p_rating: 6,
    });

    expect(error, `the legitimate rating path must keep working: ${error?.message}`).toBeNull();
    expect(
      await ratingRowsForStory(storyL5),
      'a legitimate rating must still be recorded',
    ).toHaveLength(1);
  });

  // =========================================================================
  // L6 — THE RESTORED HALF: replay, with no caller payload
  // =========================================================================

  test('L6: replay lifts the reader staged positions into the live store', async () => {
    const reader = await makeUserClient(readerEmail);

    expect(
      await positionRowsForPoint(stagedPointId, readerId),
      'precondition: the staged position must not already be live',
    ).toHaveLength(0);

    const { error } = await reader.rpc('replay_letter_positions', {});

    expect(error, `replay must succeed for a signed-in reader: ${error?.message}`).toBeNull();
    expect(
      await positionRowsForPoint(stagedPointId, readerId),
      'the staged position must now be live for this reader',
    ).toHaveLength(1);
  });

  // =========================================================================
  // L7 — CATALOG, proven behaviourally: replay accepts no payload to forge
  // =========================================================================

  test('L7: replay takes no caller payload, so there is nothing to forge', async () => {
    const reader = await makeUserClient(readerEmail);

    // Passing a payload must not resolve to some other overload that accepts one.
    const { error } = await reader.rpc('replay_letter_positions', {
      p_point_id: foreignPointId,
      p_positions: [{ point_id: foreignPointId, position: 'strongly_agree' }],
    });

    expect(
      error,
      'a payload-accepting overload of the replay must not exist',
    ).not.toBeNull();

    expect(
      await positionRowsForPoint(foreignPointId, readerId),
      'no argument to the replay may create a position on an unrelated point',
    ).toHaveLength(0);
  });

  // =========================================================================
  // L8 — the replay carries no anon grant
  // =========================================================================

  // =========================================================================
  // L9 — the replay must not admit an unverified caller
  // =========================================================================

  test('L9: an unverified caller replays nothing', async () => {
    const unverified = await makeUserClient(unverifiedReaderEmail);

    const { error } = await unverified.rpc('replay_letter_positions', {});

    // The call itself may legitimately succeed and simply replay nothing — what must
    // never happen is a row landing in the live store. `point_positions` RLS admits only
    // verified users; a SECURITY DEFINER replay bypasses that policy unless it re-checks
    // the flag itself, the way set_my_pledge re-checks it rather than trusting its caller.
    expect(
      await positionRowsForPoint(unverifiedPointId, unverifiedReaderId),
      'an unverified caller must not get positions written to the live store',
    ).toHaveLength(0);

    if (error) {
      expect(
        error.code,
        `an outright refusal is acceptable, but not an unexpected failure: ${error.message}`,
      ).toBe('P0001');
    }
  });

  test('L8: an anonymous caller cannot execute the replay', async () => {
    const anon = makeAnonClient();

    const { error } = await anon.rpc('replay_letter_positions', {});

    // Supabase's default privileges grant EXECUTE to `anon` on every newly created
    // function in `public`, and `REVOKE ... FROM PUBLIC` does not remove a role-level
    // grant. The first draft of this migration shipped `anon=X` for exactly that reason.
    // The body would refuse an anonymous caller regardless, so this layer pins the GRANT,
    // which is the thing that silently comes back.
    expect(
      error?.code,
      `the replay must carry no anon grant (got ${error?.code ?? 'no error'})`,
    ).toBe('42501');
  });
});
