/**
 * @file 20260416150000_p714_fix_position_enum_guard.spec.ts
 * @description P270: Migration integration test — position enum guard fix.
 *
 * Verifies: submit_point_response_by_token accepts all valid position_type values
 * including the three that were broken by the P705/P716 wrong enum labels:
 *   'somewhat_disagree', 'unsure', 'somewhat_agree'
 *
 * Bug: P705/P716 used 'slightly_disagree', 'neutral', 'slightly_agree' in the
 * guard — not valid position_type enum values. Any user submitting those positions
 * received RETURN false → tokenExpired=true → redirected to signup mid-reading.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

test.describe('Migration fix: position enum guard in submit_point_response_by_token', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let versionId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'Enum Guard Test Sender', withProfile: true });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Enum guard test doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story (creates story_versions automatically)
    const story = await createTestStory(sender.user.id, {
      title: 'Enum guard test story',
      content: 'Test story content for enum guard verification.',
    });
    storyId = story.id;

    // Get the story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');
    versionId = version.id;

    // Create point
    const point = await createTestPoint(sender.user.id, {
      statement: 'Test point for enum guard verification.',
    });
    pointId = point.id;

    // Link story to doc and point to story
    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin.from('story_points').insert({ story_id: storyId, point_id: pointId });

    // Create sealed letter
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Create story snapshot with the real point ID in point_config
    const { error: snapshotError } = await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: versionId,
      position: 0,
      visibility: 'public',
      point_config: {
        storyTitle: 'Enum guard test story',
        storyText: 'Test story content for enum guard verification.',
        points: [
          { id: pointId, text: 'Test point for enum guard verification.', authorPosition: 'agree' },
        ],
      },
    });

    if (snapshotError) throw new Error(`Snapshot creation failed: ${snapshotError.message}`);

    // Create delivery with auto-generated invitation_token
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'enum-guard-test@example.com',
        receiver_name: 'Test Reader',
        status: 'sent',
      })
      .select('id, invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;
    invitationToken = delivery.invitation_token;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryId);
    await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
    if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    if (docId) await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
  });

  // Previously broken: these three values returned false before the fix
  test('accepts somewhat_disagree (was broken — returned false before fix)', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'somewhat_disagree',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('accepts unsure (was broken — returned false before fix)', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'unsure',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('accepts somewhat_agree (was broken — returned false before fix)', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'somewhat_agree',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('accepts agree', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'agree',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test('accepts strongly_disagree', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'strongly_disagree',
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  // Guard: wrong old labels that should be rejected
  test('rejects slightly_agree (wrong old label, not a valid enum value)', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'slightly_agree',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  test('rejects neutral (wrong old label, not a valid enum value)', async () => {
    const { data, error } = await supabaseAdmin.rpc('submit_point_response_by_token', {
      p_token: invitationToken,
      p_point_id: pointId,
      p_position: 'neutral',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
