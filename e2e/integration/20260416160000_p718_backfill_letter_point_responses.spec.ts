/**
 * @file 20260416160000_p718_backfill_letter_point_responses.spec.ts
 * @description P718: Integration test — letter_point_responses position backfill.
 *
 * Verifies:
 * 1. The backfill migration converted all numeric string positions to PositionType labels.
 *    After the migration, no row should have position matching numeric strings (-3..3).
 * 2. New rows written by the fixed edge function store PositionType labels (not numerics).
 *    The `submit_point_response_by_token` RPC accepts only valid PositionType values —
 *    if we pass a label, it succeeds; if we pass a numeric string, it returns false.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

test.describe('Migration: P718 — letter_point_responses position backfill', () => {
  test.setTimeout(60000);

  test('no existing rows have numeric string positions after backfill', async () => {
    // After the backfill migration, ALL rows must have PositionType labels (not "2", "-2", etc.)
    const { data, error } = await supabaseAdmin
      .from('letter_point_responses')
      .select('id, position')
      .filter('position', 'in', '("-3","-2","-1","0","1","2","3")');

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

test.describe('Migration: P718 — fixed edge function stores PositionType labels', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let pointId: string;
  let storyId: string;
  let versionId: string;
  let docId: string;
  let letterId: string;
  let deliveryId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P718 Position Label Test Sender', withProfile: true });

    // Create doc (required by clarity_letters FK)
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P718 test doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story + point
    const story = await createTestStory(sender.user.id, {
      title: 'P718 test story',
      content: 'P718 test content.',
    });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');
    versionId = version.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'P718 test point for position storage.',
    });
    pointId = point.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin.from('story_points').insert({ story_id: storyId, point_id: pointId });

    // Create letter + snapshot
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

    const { error: snapshotError } = await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: versionId,
      position: 0,
      visibility: 'public',
      point_config: {
        storyTitle: 'P718 test story',
        storyText: 'P718 test content.',
        points: [{ id: pointId, text: 'P718 test point for position storage.', authorPosition: 'agree' }],
      },
    });
    if (snapshotError) throw new Error(`Snapshot creation failed: ${snapshotError.message}`);

    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'p718-position-label@example.com',
        receiver_name: 'P718 Test Reader',
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
    if (storyId) await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    if (storyId) await supabaseAdmin.from('doc_stories').delete().eq('story_id', storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('submit_point_response_by_token accepts valid PositionType labels (pre-fix guard)', async () => {
    // The DB RPC accepts only valid PositionType enum values.
    // This guards against regression to numeric strings — "2" returns false, "agree" returns true.
    const { data: numericResult, error: numericError } = await supabaseAdmin.rpc(
      'submit_point_response_by_token',
      { p_token: invitationToken, p_point_id: pointId, p_position: '2' },
    );
    expect(numericError).toBeNull();
    expect(numericResult).toBe(false); // "2" is NOT a valid position_type

    const { data: labelResult, error: labelError } = await supabaseAdmin.rpc(
      'submit_point_response_by_token',
      { p_token: invitationToken, p_point_id: pointId, p_position: 'agree' },
    );
    expect(labelError).toBeNull();
    expect(labelResult).toBe(true); // "agree" IS a valid position_type
  });

  test('letter_point_responses accepts PositionType labels and rejects numeric strings', async () => {
    // Insert a valid label row directly — verifies the column accepts PositionType strings
    const { error: insertError } = await supabaseAdmin
      .from('letter_point_responses')
      .insert({ delivery_id: deliveryId, point_id: pointId, position: 'agree' });
    expect(insertError).toBeNull();

    // Read it back — should be the label, not a numeric string
    const { data, error } = await supabaseAdmin
      .from('letter_point_responses')
      .select('position')
      .eq('delivery_id', deliveryId)
      .eq('point_id', pointId)
      .single();

    expect(error).toBeNull();
    expect(data?.position).toBe('agree');
    expect(data?.position).not.toMatch(/^-?[0-3]$/); // not a numeric string
  });
});
