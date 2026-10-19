/**
 * @file p1512-attachment-load.test.ts
 * @description P1512: loadAttachment must not call a failed read "Not available to you". The services
 * return null both for a row RLS hides and for a read that errored, so a null is confirmed with one plain
 * read before it counts as access.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirm = vi.hoisted(() => vi.fn());
const getPoint = vi.hoisted(() => vi.fn());
const getStory = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => confirm(table) }) }) }) },
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPointWithUserPosition: getPoint } }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getStory: getStory, getPointsForStories: vi.fn().mockResolvedValue(new Map()) } }));

import { loadAttachment } from '@/app/data/chat-ui-helpers';

beforeEach(() => vi.clearAllMocks());

describe('loadAttachment', () => {
  it('a point the reader cannot see (a clean empty answer) is null: "Not available to you"', async () => {
    getPoint.mockResolvedValue(null);
    confirm.mockResolvedValue({ data: null, error: null });
    await expect(loadAttachment('point', 'pt', 'me')).resolves.toBeNull();
    expect(confirm).toHaveBeenCalledWith('points');
  });

  it('a null from a failed read is thrown, so the card offers Retry instead of denying access', async () => {
    getPoint.mockResolvedValue(null);
    confirm.mockResolvedValue({ data: null, error: new Error('TypeError: Failed to fetch') });
    await expect(loadAttachment('point', 'pt', 'me')).rejects.toThrow('Failed to fetch');
    getStory.mockResolvedValue(null);
    await expect(loadAttachment('story', 'st', 'me')).rejects.toThrow('Failed to fetch');
    expect(confirm).toHaveBeenLastCalledWith('stories');
  });

  it('a null for a row that turns out to be readable is a lost read, not access: it throws', async () => {
    getStory.mockResolvedValue(null);
    confirm.mockResolvedValue({ data: { id: 'st' }, error: null });
    await expect(loadAttachment('story', 'st', 'me')).rejects.toThrow();
  });

  it('a readable item needs no confirming read', async () => {
    getPoint.mockResolvedValue({ id: 'pt', statement: 'S', tags: [] });
    await expect(loadAttachment('point', 'pt', 'me')).resolves.toMatchObject({ kind: 'point', title: 'S' });
    expect(confirm).not.toHaveBeenCalled();
  });
});
