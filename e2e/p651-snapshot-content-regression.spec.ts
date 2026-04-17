/**
 * @file p651-snapshot-content-regression.spec.ts
 * @description Regression: P651 clobbered P642's seal_and_send_letter denormalization.
 *
 * Bug: P651 replaced the enriched jsonb_build_object(...) in the snapshot INSERT
 * with bare ds.point_config (raw ordering metadata). Any letter sealed after P651
 * has an empty storyText and zero points in the snapshot.
 *
 * Canary: call seal_and_send_letter RPC as the sender, then assert that
 * letter_story_snapshots.point_config contains storyText and points[].
 * Fails on the P651 function, passes after the fix migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P651 regression: seal_and_send_letter must denormalize story content', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;

  const STORY_CONTENT = 'Co-founders nod along to decisions they privately disagree with.';
  const STORY_TITLE = 'The false consensus effect';
  const POINT_TEXT = 'Avoiding hard conversations destroys trust faster than having them.';

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-regression-sender' });

    // Create doc owned by sender
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 regression doc', visibility: 'public' })
      .select('id')
      .single();
    if (docErr || !doc) throw new Error(`Doc creation failed: ${docErr?.message}`);
    docId = doc.id;

    // Create story + version via helper (handles author_id, story_versions trigger)
    const story = await createTestStory(sender.user.id, {
      title: STORY_TITLE,
      content: STORY_CONTENT,
      visibility: 'public',
    });
    storyId = story.id;

    // Create point via helper (handles first_validator_id)
    const point = await createTestPoint(sender.user.id, { statement: POINT_TEXT });
    pointId = point.id;

    // Link story → doc, point → story (story_points needs author_id from P465)
    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId,
      story_id: storyId,
      position: 0,
    });
    await supabaseAdmin.from('story_points').insert({
      story_id: storyId,
      point_id: pointId,
      author_id: sender.user.id,
    });

    // Set sender's position on the point (supabaseAdmin bypasses RLS for service_role)
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointId,
      user_id: sender.user.id,
      position: 'agree',
    });

    // Create a draft letter for the sender
    const { data: letter, error: letterErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
      .select('id')
      .single();
    if (letterErr || !letter) throw new Error(`Letter creation failed: ${letterErr?.message}`);
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    await supabaseAdmin.from('point_positions').delete()
      .eq('point_id', pointId).eq('user_id', sender.user.id);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('seal_and_send_letter snapshot has storyText and points[] populated', async () => {
    // Call RPC as the sender (auth.uid() must match sender_id for the function to work)
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

    // Sign in as sender to get JWT
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: sender.email,
      password: 'test-password-12345',
    });
    if (signInErr || !signIn.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

    const senderClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Call the RPC — this is what the UI does on seal
    const { error: rpcErr } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_email: 'reader@example.com', receiver_name: 'Test Reader' }],
    });
    expect(rpcErr, `seal_and_send_letter RPC failed: ${rpcErr?.message}`).toBeNull();

    // Fetch the snapshot produced by the RPC
    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letterId);

    expect(snapErr, `Snapshot fetch failed: ${snapErr?.message}`).toBeNull();
    expect(snapshots).toBeDefined();
    expect(snapshots!.length).toBeGreaterThan(0);

    const config = snapshots![0].point_config as Record<string, unknown>;

    // KEY ASSERTIONS — these fail on the P651 bug (storyText missing, points empty)
    expect(config.storyText, 'storyText must be the story content, not null/empty').toBe(STORY_CONTENT);
    expect(config.storyTitle, 'storyTitle must be populated').toBe(STORY_TITLE);

    const points = config.points as Array<{ id: string; text: string; authorPosition: string }>;
    expect(Array.isArray(points), 'points must be an array').toBe(true);
    expect(points.length, 'points array must not be empty').toBeGreaterThan(0);
    expect(points[0].text, 'point text must match the point statement').toBe(POINT_TEXT);
    expect(points[0].authorPosition, 'authorPosition must be the sender\'s position').toBe('agree');
  });
});
