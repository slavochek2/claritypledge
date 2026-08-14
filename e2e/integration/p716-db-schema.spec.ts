/**
 * @file p716-db-schema.spec.ts
 * @description P716: Integration tests for submit_point_response_by_token (canonical version).
 *
 * Migrations covered: 20260416150000_p714_fix_position_enum_guard (canonical final).
 * Migrations 20260416120000, 130000, 140000 are intermediate states superseded by
 * 150000 in the same session — no separate tests for those.
 * The enum label correction (140000→150000: 'somewhat_disagree'/'unsure'/'somewhat_agree')
 * is tested in 20260416150000_p714_fix_position_enum_guard.spec.ts.
 *
 * What this tests (properties the UI canary does NOT cover):
 *   1. Authorization scope guard — p_point_id not in this letter's point_config → false
 *   2. NULL guard — null p_point_id → false
 *   3. Enum validation — invalid position string → false
 *   4. Happy path — valid token + in-scope point → true, row written
 *   5. Dual-write — authenticated caller gets point_positions upsert (auth.uid() path)
 *
 * Run: npx playwright test --project=integration e2e/integration/p716-db-schema.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import {
  createTestLetter,
  createTestDoc,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

function makeUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

test.describe('P716: submit_point_response_by_token — authorization and validation guards', () => {
  test.describe.configure({ timeout: 45_000 });

  let sender: TestUser;
  let receiver: TestUser;
  let storyId: string;
  let storyVersionId: string;
  let pointId: string;           // point IN this letter's point_config
  let outsidePointId: string;    // point NOT in this letter's point_config
  let letterId: string;
  let deliveryId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P716 RPC Guard Sender' });
    receiver = await createTestUser({ name: 'P716 RPC Guard Receiver' });

    const story = await createTestStory(sender.user.id, {
      content: 'P716 authorization guard test story.',
    });
    storyId = story.id;

    // Get the auto-created story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    storyVersionId = version!.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'P716 test point — inside letter.',
    });
    pointId = point.id;

    const outsidePoint = await createTestPoint(sender.user.id, {
      statement: 'P716 test point — outside letter (should be rejected).',
    });
    outsidePointId = outsidePoint.id;

    // P1043: passed the user id as sourceDocId — 23503 on clarity_letters_source_doc_id_fkey.
    const doc = await createTestDoc(sender.user.id);
    const letter = await createTestLetter(sender.user.id, doc.id, {
      mode: 'one-to-one',
    });
    letterId = letter.id;

    // Snapshot with only pointId in point_config — outsidePointId is NOT included
    await createTestStorySnapshot(letterId, storyId, storyVersionId, {
      position: 0,
      pointConfig: {
        storyTitle: 'P716 test story',
        storyText: 'P716 authorization guard test story.',
        points: [{ id: pointId, text: 'P716 test point — inside letter.', authorPosition: 'agree' }],
      },
    });

    await sealTestLetter(letterId);

    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
      status: 'opened',
    });
    deliveryId = delivery.id;
    deliveryToken = delivery.invitationToken;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('point_positions').delete()
      .eq('point_id', pointId).eq('user_id', receiver.user.id);
    await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryId);
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (outsidePointId) await deleteTestPoint(outsidePointId);
    if (receiver) await deleteTestUser(receiver.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  // ── 1. Authorization scope guard ────────────────────────────────────────────

  test('returns false when point_id is not in this letter\'s point_config', async () => {
    // outsidePointId exists in the DB but is not in this letter's snapshot.
    // Without this guard (regressions 120000, 130000 intermediate states),
    // any valid token holder could write positions for arbitrary points.
    const { data: signIn } = await createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ).auth.signInWithPassword({ email: receiver.email, password: 'test-password-12345' });

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: outsidePointId,
      p_position: 'agree',
    });

    expect(error).toBeNull();
    expect(data).toBe(false);

    // Confirm no row was written
    const { data: rows } = await supabaseAdmin
      .from('letter_point_responses')
      .select('id')
      .eq('delivery_id', deliveryId)
      .eq('point_id', outsidePointId);
    expect(rows?.length).toBe(0);
  });

  // ── 2. NULL guard ───────────────────────────────────────────────────────────

  test('returns false when p_point_id is null', async () => {
    const { data: signIn } = await createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ).auth.signInWithPassword({ email: receiver.email, password: 'test-password-12345' });

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: null,
      p_position: 'agree',
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  // ── 3. Enum validation ──────────────────────────────────────────────────────

  test('returns false for invalid position string', async () => {
    const { data: signIn } = await createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ).auth.signInWithPassword({ email: receiver.email, password: 'test-password-12345' });

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: pointId,
      p_position: 'not_a_real_position',
    });

    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  // ── 4. Happy path ───────────────────────────────────────────────────────────

  test('returns true and writes letter_point_responses for valid in-scope point', async () => {
    const { data: signIn } = await createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ).auth.signInWithPassword({ email: receiver.email, password: 'test-password-12345' });

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: pointId,
      p_position: 'agree',
    });

    expect(error).toBeNull();
    expect(data).toBe(true);

    const { data: rows } = await supabaseAdmin
      .from('letter_point_responses')
      .select('position')
      .eq('delivery_id', deliveryId)
      .eq('point_id', pointId);
    expect(rows?.length).toBe(1);
    expect(rows?.[0].position).toBe('agree');
  });

  // ── 5. Dual-write to point_positions ────────────────────────────────────────

  test('upserts point_positions for authenticated caller (auth.uid() path)', async () => {
    // Happy-path test above already wrote the response; this verifies the dual-write.
    const { data: posRows } = await supabaseAdmin
      .from('point_positions')
      .select('position, user_id')
      .eq('point_id', pointId)
      .eq('user_id', receiver.user.id);

    expect(posRows?.length).toBe(1);
    expect(posRows?.[0].position).toBe('agree');
    expect(posRows?.[0].user_id).toBe(receiver.user.id);
  });
});
