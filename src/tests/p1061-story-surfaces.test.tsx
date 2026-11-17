/**
 * P1061: how a story's "N moved" count reaches its cards. A list read attaches it to each story (withMovement), a
 * failed read leaves the stories as they were (never a zero), and the card shows the chip only for a human story
 * once the agent registry has answered (P1141). The pinned story and /stake use the same two pieces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StoryWithAuthor } from '@/app/types';
import type { StoryMovement } from '@/lib/position-movement';

const getStoryMovements = vi.fn();
vi.mock('@/app/data/movement-service', () => ({ getStoryMovements: (ids: string[]) => getStoryMovements(ids) }));

import { movementOf, withMovement } from '@/app/data/movement-for-list';
import { FeedStoryFigures } from '@/app/components/feed/feed-story-badges';
import { readsAllHistory } from '@/app/components/movement/use-point-movement';

const story = (id: string): StoryWithAuthor => ({
  id,
  authorId: 'user-id-0001',
  authorName: 'Test Author',
  authorSlug: 'test-author',
  content: 'Test story',
  understoodCount: 2,
  tags: [],
  createdAt: '2026-09-10T12:00:00.000Z',
} as unknown as StoryWithAuthor);

const moved = (storyId: string, n: number): StoryMovement => ({
  storyId,
  verifiedCount: 3,
  moved: n,
  points: [{ pointId: 'point-id-0001', arrows: { left: 0, same: 1, right: n }, verified: { switched: 0, other: n, same: 1 }, notVerified: { switched: 0, other: 0, same: 0 } }],
});

// A block, not an expression: a function returned from beforeEach is run as its cleanup, and mockReset returns the
// mock itself, which would then be called once more after every test.
beforeEach(() => { getStoryMovements.mockReset(); });

describe('P1061 withMovement: counts arrive with the list', () => {
  it('asks once for the whole list and attaches each count to its own story', async () => {
    getStoryMovements.mockResolvedValue(new Map([['story-id-0002', moved('story-id-0002', 2)]]));
    const out = await withMovement([story('story-id-0001'), story('story-id-0002')]);
    expect(getStoryMovements).toHaveBeenCalledTimes(1);
    expect(getStoryMovements).toHaveBeenCalledWith(['story-id-0001', 'story-id-0002']);
    expect(movementOf(out[0]!)).toBeUndefined();
    expect(movementOf(out[1]!)?.moved).toBe(2);
  });

  it('a failed read leaves the stories as they were: no count, never a zero', async () => {
    getStoryMovements.mockRejectedValue(new Error('Could not load how positions moved'));
    const input = [story('story-id-0001')];
    const out = await withMovement(input);
    expect(out).toEqual(input);
    expect(movementOf(out[0]!)).toBeUndefined();
  });

  it('an empty list makes no request', async () => {
    expect(await withMovement([])).toEqual([]);
    expect(getStoryMovements).not.toHaveBeenCalled();
  });
});

describe('P1061 who gets Changes on a point', () => {
  it('a public point: everyone, signed out included; a non-public point: its first validator only', () => {
    expect(readsAllHistory({ visibility: 'public', firstValidatorId: 'user-id-0001' }, undefined)).toBe(true);
    expect(readsAllHistory({ visibility: 'public', firstValidatorId: 'user-id-0001' }, 'user-id-0002')).toBe(true);
    expect(readsAllHistory({ visibility: 'private', firstValidatorId: 'user-id-0001' }, 'user-id-0001')).toBe(true);
    expect(readsAllHistory({ visibility: 'private', firstValidatorId: 'user-id-0001' }, 'user-id-0002')).toBe(false);
    expect(readsAllHistory({ visibility: 'private', firstValidatorId: 'user-id-0001' }, undefined)).toBe(false);
  });
});

describe('P1061 the card figures row', () => {
  const counted = { ...story('story-id-0001'), movement: moved('story-id-0001', 3) } as StoryWithAuthor;
  const row = (s: StoryWithAuthor, isAgent: boolean, identityPending: boolean) =>
    render(<FeedStoryFigures story={s} isAgent={isAgent} identityPending={identityPending} className="row"><span>badge</span></FeedStoryFigures>);

  it('shows "N moved" beside the badge for a human story with movers', () => {
    row(counted, false, false);
    expect(screen.getByText('badge')).toBeTruthy();
    expect(screen.getByTestId('count-chip').getAttribute('aria-label')).toBe('3 of 3 verified people moved. What this counts');
  });

  it('no chip for an agent story, or while the agent registry is still loading', () => {
    row(counted, true, false);
    expect(screen.queryByTestId('count-chip')).toBeNull();
    row(counted, false, true);
    expect(screen.queryByTestId('count-chip')).toBeNull();
  });

  it('no chip for a story read without a count (the chat cards) or with nobody moved', () => {
    row(story('story-id-0001'), false, false);
    expect(screen.queryByTestId('count-chip')).toBeNull();
    row({ ...story('story-id-0001'), movement: moved('story-id-0001', 0) } as StoryWithAuthor, false, false);
    expect(screen.queryByTestId('count-chip')).toBeNull();
  });
});
