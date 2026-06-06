/**
 * @file 20260606120000_p898_seal_rpc_lead_count.spec.ts
 * @description P898: Migration integration test — seal_and_send_letter carries
 * point_config.lead_count into the sealed snapshot (seal→read round-trip).
 *
 * The seal RPC builds the snapshot's point_config with an explicit
 * jsonb_build_object — unlisted fields are silently dropped (P819 incident).
 * This verifies the live function:
 *   - carries a valid integer lead_count verbatim
 *   - seals absent lead_count as 1 (the historical implicit single lead)
 *   - floors + floors-at-zero malformed numbers (validate-on-seal)
 *   - seals non-numeric values as 1 (type guard)
 *
 * Run: npx playwright test --project=integration e2e/integration/20260606120000_p898_seal_rpc_lead_count.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

// position → (point_config to store, lead_count expected in the sealed snapshot)
const CASES: Array<{ config: Record<string, unknown>; expected: number; label: string }> = [
  { config: { lead_count: 2 }, expected: 2, label: 'explicit 2 carried verbatim' },
  { config: {}, expected: 1, label: 'absent seals as 1 (implicit single lead)' },
  { config: { lead_count: -3 }, expected: 0, label: 'negative floors at 0' },
  { config: { lead_count: 'three' }, expected: 1, label: 'non-numeric seals as 1' },
];

test.describe('Migration p898: seal_and_send_letter carries lead_count into point_config', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  const storyIds: string[] = [];
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P898-Integration-Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P898 integration doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    for (let i = 0; i < CASES.length; i++) {
      const story = await createTestStory(sender.user.id, {
        content: `P898 story ${i}: ${CASES[i].label}`,
        visibility: 'public',
      });
      storyIds.push(story.id);
      await supabaseAdmin.from('doc_stories').insert({
        doc_id: docId,
        story_id: story.id,
        position: i,
        point_config: CASES[i].config,
      });
    }

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('sealed snapshots carry lead_count: verbatim / default-1 / floored-at-0 / type-guarded', async () => {
    const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInErr } = await tempClient.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });
    if (signInErr || !signIn.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

    const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: rpcErr } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_email: 'p898-reader@example.com', receiver_name: 'Reader' }],
    });
    expect(rpcErr, `seal_and_send_letter failed: ${rpcErr?.message}`).toBeNull();

    const { data: snapshots, error: snapErr } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('position, point_config')
      .eq('letter_id', letterId)
      .order('position');

    expect(snapErr).toBeNull();
    expect(snapshots!.length).toBe(CASES.length);

    for (let i = 0; i < CASES.length; i++) {
      const config = snapshots![i].point_config as Record<string, unknown>;
      expect(
        config.lead_count,
        `position ${i} (${CASES[i].label}): expected sealed lead_count ${CASES[i].expected}`,
      ).toBe(CASES[i].expected);
    }
  });
});
