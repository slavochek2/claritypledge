/**
 * @file p1427-seal-keeps-concurrent-hidden.test.ts
 * @description P1427 AC1 — a point hidden in another tab after the composer
 * loaded stays hidden in the SEALED letter.
 *
 * Bug: the seal persisted the default point `order` as `{ ...pageLoadConfig, order }`.
 * A `hidden` written by a second tab between page load and seal was reverted,
 * and `seal_and_send_letter` — which snapshots `doc_stories.point_config`
 * (hidden / order / lead_count) at seal time — published the hidden point.
 *
 * WHY THIS LANE, not e2e/integration: the round trip must run the app's OWN
 * `docsService.getPointConfigs` select, `lettersService.createLetter` and
 * `sealLetter`, which reach the DB through `@/lib/supabase` (`import.meta.env`,
 * Vite-only) — see vitest.config.ts beside this file.
 *
 * Runs against the TEST project only:
 *   npm run test:integration -- src/tests/integration/p1427-seal-keeps-concurrent-hidden.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { supabase } from '@/lib/supabase';
import { docsService } from '@/app/data/docs-service';
import * as lettersService from '@/app/data/letters-service';
import { persistDefaultPointOrders } from '@/app/utils/compose-default-point-order';
import type { DocStory } from '@/app/types';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestStory, deleteTestStory } from '../../../e2e/helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../../../e2e/helpers/test-point';

type SnapshotConfig = {
  points: Array<{ id: string; hidden: boolean }>;
  order: string[];
  hidden: string[];
};

/** The composer's page-load view: points filtered by `hidden` as loaded (letter-compose-page). */
function composerView(stories: DocStory[]): DocStory[] {
  return stories.map((s) => {
    const hidden = new Set(s.point_config?.hidden ?? []);
    return { ...s, story: { ...s.story, points: s.story.points.filter((p) => !hidden.has(p.id)) } };
  });
}

describe('P1427: seal keeps a point hidden by a second writer after page load', () => {
  let author: TestUser;
  let docId: string;
  let storyId: string;
  const pointIds: string[] = [];
  let letterId: string | undefined;

  beforeAll(async () => {
    author = await createTestUser({ name: 'P1427 Seal Author' });

    const story = await createTestStory(author.user.id, {
      content: `P1427 seal story ${Date.now()}`,
      visibility: 'public',
    });
    storyId = story.id;

    for (let i = 1; i <= 3; i++) {
      const point = await createTestPoint(author.user.id, storyId, {
        statement: `P1427 point ${i} ${Date.now()}`,
        visibility: 'public',
      });
      pointIds.push(point.id);
    }

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: author.user.id, title: 'P1427 seal doc', visibility: 'public' })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`seed doc: ${docError?.message}`);
    docId = doc.id;

    // Empty order: the seal's default-order write path (P837) must fire.
    const { error: linkError } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0, point_config: { order: [] } });
    if (linkError) throw new Error(`seed doc_stories: ${linkError.message}`);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: author.email,
      password: TEST_PASSWORD,
    });
    if (signInError) throw new Error(`sign in: ${signInError.message}`);
  });

  afterAll(async () => {
    await supabase.auth.signOut();
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    for (const id of pointIds) await deleteTestPoint(id);
    if (storyId) await deleteTestStory(storyId);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  it('AC1: hidden survives the seal into the snapshot, and the order is persisted', async () => {
    // Tab 1 — composer loads.
    const loaded = await docsService.getDoc(docId);
    expect(loaded, 'doc must load for its author').not.toBeNull();
    const pageLoad = composerView(loaded!.stories);
    const displayed = pageLoad[0]!.story.points.map((p) => p.id);
    expect([...displayed].sort()).toEqual([...pointIds].sort());

    // Tab 2 — doc detail hides point 2 (writes its whole config, as doc-detail-page does).
    const hiddenId = pointIds[1]!;
    await docsService.updatePointConfig(docId, storyId, { order: [], hidden: [hiddenId] });

    // Tab 1 — seal: default order write, then the seal RPC, as handleSeal runs them.
    await persistDefaultPointOrders(docId, pageLoad, docsService);
    const letter = await lettersService.createLetter(docId, author.user.id, 'one-to-one');
    letterId = letter.id;
    const result = await lettersService.sealLetter(
      letter.id,
      [],
      [{ receiver_email: 'p1427-reader@example.com', receiver_name: 'Reader' }],
    );
    expect(result.success, `seal failed: ${result.error}`).toBe(true);

    const { data: row } = await supabaseAdmin
      .from('doc_stories')
      .select('point_config')
      .eq('doc_id', docId)
      .eq('story_id', storyId)
      .single();
    // Soft: on failure, still reach the snapshot assertions — the sealed letter is what AC1 is about.
    expect.soft(row!.point_config).toEqual({ order: displayed, hidden: [hiddenId] });

    const { data: snap, error: snapError } = await supabaseAdmin
      .from('letter_story_snapshots')
      .select('point_config')
      .eq('letter_id', letter.id)
      .single();
    expect(snapError).toBeNull();
    const config = snap!.point_config as SnapshotConfig;

    expect(config.hidden, 'the second writer\'s hide was reverted by the seal').toEqual([hiddenId]);
    expect(
      config.points.find((p) => p.id === hiddenId)?.hidden,
      'hidden point reached the sealed letter as visible',
    ).toBe(true);
    expect(config.order, 'seal must still persist the displayed order').toEqual(displayed);
  });
});
