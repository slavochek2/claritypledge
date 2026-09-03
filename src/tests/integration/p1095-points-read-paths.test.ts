/**
 * @file p1095-points-read-paths.test.ts
 * @description P1095 — the three read paths that embed `points` with an EXPLICIT
 * column list must still return their points after `points.context` is dropped.
 *
 * WHY THIS FILE EXISTS. The migration's sibling spec
 * (`e2e/integration/20260902003000_p1095_drop_points_context.spec.ts`) asserts
 * only that the column and the out-of-band RPC are ABSENT. Both of those pass
 * whether or not the client still names `context` — revert
 * `fix(p1095): drop 'context' from all three points select lists` and that suite
 * stays green while every doc, story-detail and profile page silently renders
 * zero points. Nothing bound the fix. This does.
 *
 * WHY IT IS SILENT, not loud. PostgREST answers a select naming a dropped column
 * with 42703 for the WHOLE query, and all three callers swallow it:
 *   - docs-service.ts:315-320       logDbError → returns the doc with `stories: []`
 *   - stories-service-real.ts:281   logDbError → falls through to `(storyPoints || [])`
 *   - stories-service-real.ts:419   logDbError → falls through to `(storyPoints || [])`
 * So an assertion on "no error thrown" proves nothing. Each test below asserts the
 * points come back NON-EMPTY and contain the seeded point.
 *
 * Runs against the TEST project only, where 20260902003000 is already applied:
 *   npm run test:integration
 * Excluded from `npm test` — see src/tests/integration/vitest.config.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { supabase } from '@/lib/supabase';
import { realStoriesService } from '@/app/data/stories-service-real';
import { docsService } from '@/app/data/docs-service';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestStory, deleteTestStory } from '../../../e2e/helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../../../e2e/helpers/test-point';

describe('P1095: the three explicit points select lists still return points', () => {
  let author: TestUser;
  let storyId: string;
  let pointId: string;
  let pointStatement: string;
  let docId: string;

  beforeAll(async () => {
    author = await createTestUser({ name: 'P1095 ReadPath' });

    const story = await createTestStory(author.user.id, {
      content: `P1095 read-path story ${Date.now()}`,
      visibility: 'public',
    });
    storyId = story.id;

    pointStatement = `P1095 read-path point ${Date.now()}`;
    const point = await createTestPoint(author.user.id, storyId, {
      statement: pointStatement,
      visibility: 'public',
    });
    pointId = point.id;

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: author.user.id, title: 'P1095 read-path doc', visibility: 'public' })
      .select('id')
      .single();
    if (docError || !doc) throw new Error(`seed doc: ${docError?.message}`);
    docId = doc.id;

    const { error: linkError } = await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });
    if (linkError) throw new Error(`seed doc_stories: ${linkError.message}`);

    // Read through the app's own client, as the author — the same client
    // instance the three services import.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: author.email,
      password: TEST_PASSWORD,
    });
    if (signInError) throw new Error(`sign in: ${signInError.message}`);
  });

  afterAll(async () => {
    await supabase.auth.signOut();
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  it('stories-service-real.getStoryWithPoints returns the linked point', async () => {
    const story = await realStoriesService.getStoryWithPoints(storyId);

    expect(story, 'the story itself must load').not.toBeNull();
    expect(
      story!.points.length,
      'zero points here is the silent 42703 degradation, not an empty story',
    ).toBeGreaterThan(0);
    expect(story!.points.map(p => p.id)).toContain(pointId);
    expect(story!.points.find(p => p.id === pointId)!.statement).toBe(pointStatement);
  });

  it('stories-service-real.getStoriesByAuthorWithPoints returns the linked point', async () => {
    const stories = await realStoriesService.getStoriesByAuthorWithPoints(author.user.id);

    const seeded = stories.find(s => s.id === storyId);
    expect(seeded, 'the seeded public story must appear on its author profile').toBeDefined();
    expect(
      seeded!.points.length,
      'zero points here is the silent 42703 degradation, not an unlinked story',
    ).toBeGreaterThan(0);
    expect(seeded!.points.map(p => p.id)).toContain(pointId);
  });

  it('docs-service.getDoc returns the doc story with its linked point', async () => {
    const result = await docsService.getDoc(docId);

    expect(result, 'the doc itself must load').not.toBeNull();
    expect(
      result!.stories.length,
      'zero stories here is getDoc\'s storiesError branch — the whole embed 42703d',
    ).toBeGreaterThan(0);

    const docStory = result!.stories.find(s => s.story.id === storyId);
    expect(docStory, 'the seeded story must be linked to the doc').toBeDefined();
    expect(
      docStory!.story.points.length,
      'zero points here is the silent 42703 degradation, not an unlinked story',
    ).toBeGreaterThan(0);
    expect(docStory!.story.points.map(p => p.id)).toContain(pointId);
  });
});
