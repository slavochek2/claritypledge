/**
 * @file p1508-canvas-story-composer.test.ts
 * @description P1508 founder follow-up: the canvas writes a story in place with the letters'
 * composer. The story takes the visibility it is given (letters: private by default), and a story
 * that could not be linked to its point is removed and reported as a failure, never as success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => ({ inserts: [] as { table: string; row: unknown }[], deletes: [] as string[], linkError: null as null | { code: string; message: string } }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => ({
      insert: (row: unknown) => {
        calls.inserts.push({ table, row });
        if (table === 'story_points') return Promise.resolve({ error: calls.linkError });
        return { select: () => ({ single: async () => ({ data: { id: 's1' }, error: null }) }) };
      },
      delete: () => ({ eq: async (_c: string, id: string) => { calls.deletes.push(`${table}:${id}`); return { error: null }; } }),
    }),
  },
}));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn(), noteNoSessionSuppression: vi.fn(), throwDbError: vi.fn() }));

import { createLetterPositionStory } from '@/app/data/letters-service';

const storyRow = () => calls.inserts.find(i => i.table === 'stories')?.row as { visibility: string };

describe('createLetterPositionStory', () => {
  beforeEach(() => { calls.inserts = []; calls.deletes = []; calls.linkError = null; });

  it('letters: private by default', async () => {
    expect(await createLetterPositionStory('p1', 'text')).toEqual({ storyId: 's1' });
    expect(storyRow().visibility).toBe('private');
  });

  it('the canvas: the visibility it passes (the point\'s)', async () => {
    await createLetterPositionStory('p1', 'text', 'public');
    expect(storyRow().visibility).toBe('public');
  });

  it('a link that fails removes the story and reports failure', async () => {
    calls.linkError = { code: '42501', message: 'denied' };
    expect(await createLetterPositionStory('p1', 'text', 'public')).toBeNull();
    expect(calls.deletes).toEqual(['stories:s1']);
  });

  it('an already-existing link is still success (idempotent)', async () => {
    calls.linkError = { code: '23505', message: 'duplicate' };
    expect(await createLetterPositionStory('p1', 'text')).toEqual({ storyId: 's1' });
    expect(calls.deletes).toEqual([]);
  });
});
