/**
 * @file p1508-clarity-canvas.test.tsx
 * @description P1508 — Clarity Canvas: box tags as system tags, grouping into nine boxes (P1535),
 * box-tag pills hidden, and the canvas panel's card with its stories open.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { TagPills } from '@/app/components/shared/tag-pills';
import { isSystemTag } from '@/lib/feed-utils';
import { extractHashtags } from '@/lib/utils';
import {
  CANVAS_BOXES,
  CANVAS_BOX_TAGS,
  CANVAS_LAYERS,
  canvasBoxOf,
  canvasNameOf,
  canvasPath,
  canvasTagFor,
  groupPointsByBox,
  isCanvasBoxTag,
  isCanvasPathname,
  normalizeProjectTag,
} from '@/lib/canvas-boxes';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }) }));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const point = {
  id: 'point-1',
  statement: 'Speakers overestimate how clearly they communicated.',
  tags: ['claritypledge'],
  systemTags: ['canvas:problem'],
  visibility: 'public',
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1,
  userPosition: null,
} as unknown as PointWithUserPosition;

describe('box tags', () => {
  // P1535 (founder): nine boxes in three layers, core bet first. Ikigai dropped; Unfair Advantage
  // and Cost Structure dropped (keys leave the list, like canvas:uvp); titles only, keys unchanged.
  it('has exactly the nine founder-approved boxes in three layers, in reading order', () => {
    expect(CANVAS_BOX_TAGS).toEqual([
      'canvas:segments', 'canvas:problem', 'canvas:solution',
      'canvas:channels', 'canvas:revenue', 'canvas:metrics',
      'canvas:love', 'canvas:good-at', 'canvas:world-needs',
    ]);
    expect(CANVAS_BOXES.map(b => b.title)).toEqual([
      'Customer Segments', 'Problem', 'Solution',
      'Go-to-market strategy', 'Offers & Pricing', "How I'll know it's working",
      'My values', 'My biggest challenge', 'Who else wins when I win?',
    ]);
    expect(CANVAS_LAYERS.map(l => l.title)).toEqual(['Core assumptions', 'Profitability assumptions', 'Founder-fit assumptions']);
    expect(CANVAS_LAYERS.flatMap(l => l.boxes)).toEqual(CANVAS_BOX_TAGS);
  });

  it('P1535: dropped boxes leave the list but stay hidden system tags', () => {
    for (const tag of ['canvas:advantage', 'canvas:cost', 'canvas:uvp']) {
      expect(isCanvasBoxTag(tag)).toBe(false);
      expect(isSystemTag(tag)).toBe(true);
    }
  });

  it('every box tag is a system tag; near misses and plain tags are not', () => {
    for (const tag of CANVAS_BOX_TAGS) expect(isSystemTag(tag)).toBe(true);
    expect(isSystemTag('CANVAS:Problem')).toBe(true);
    for (const tag of ['canvas', 'canvas:', 'canvas_', 'claritypledge', 'ikigai1', 'mycanvas_x']) {
      expect(isSystemTag(tag)).toBe(false);
    }
  });

  it('a retired or unknown box tag stays a hidden system tag, never a pill (R1: canvas:uvp)', () => {
    expect(isCanvasBoxTag('canvas:uvp')).toBe(false);
    for (const tag of ['canvas:uvp', 'canvas:foo']) expect(isSystemTag(tag)).toBe(true);
  });

  it('R9: canvas_<name> is a reserved system tag; a typed #canvas_… never becomes a tag', () => {
    expect(isSystemTag('canvas_claritypledge')).toBe(true);
    expect(isSystemTag('Canvas_Hospital')).toBe(true);
    expect(extractHashtags('Bet #canvas_claritypledge and #claritypledge')).toEqual(['claritypledge']);
    expect(canvasTagFor('ClarityPledge')).toBe('canvas_claritypledge');
    expect(canvasNameOf('canvas_Sales_Mastermind')).toBe('sales_mastermind');
    expect(canvasNameOf('claritypledge')).toBeNull();
    expect(canvasNameOf('canvas:problem')).toBeNull();
  });

  it('the existing system tags are unchanged', () => {
    for (const tag of ['st1', 'v2', 'understanding', 'misunderstanding']) expect(isSystemTag(tag)).toBe(true);
  });

  it('a typed hashtag can never become a box tag', () => {
    expect(extractHashtags('Bet #canvas:problem here #claritypledge')).toEqual(['canvas', 'claritypledge']);
  });

  it('one box per point: the first box tag wins; no box tag means no box', () => {
    expect(canvasBoxOf(['st1', 'canvas:solution', 'canvas:metrics'])).toBe('canvas:solution');
    // A point still tagged with a dropped box falls through to its next box tag, or none.
    expect(canvasBoxOf(['canvas:uvp', 'canvas:metrics'])).toBe('canvas:metrics');
    expect(canvasBoxOf(['canvas:cost'])).toBeNull();
    expect(canvasBoxOf(['canvas:advantage'])).toBeNull();
    expect(canvasBoxOf(['canvas:uvp'])).toBeNull();
    expect(canvasBoxOf(['st1'])).toBeNull();
    expect(isCanvasBoxTag('canvas:good-at')).toBe(true);
  });

  it('groups points into all nine boxes, dropping points with no box tag', () => {
    const pts = [
      { id: 'a', systemTags: ['canvas:problem'] },
      { id: 'b', systemTags: [] },
      { id: 'c', systemTags: ['canvas:problem'] },
      { id: 'd', systemTags: ['canvas:revenue'] },
    ];
    const boxes = groupPointsByBox(pts);
    expect([...boxes.keys()]).toEqual(CANVAS_BOX_TAGS);
    expect(boxes.get('canvas:problem')?.map(p => p.id)).toEqual(['a', 'c']);
    expect(boxes.get('canvas:revenue')?.map(p => p.id)).toEqual(['d']);
    expect(boxes.get('canvas:love')).toEqual([]);
    expect([...boxes.values()].flat().map(p => p.id)).not.toContain('b');
  });

  it('accepts only a hashtag-shaped project tag in the address', () => {
    expect(normalizeProjectTag('ClarityPledge')).toBe('claritypledge');
    expect(normalizeProjectTag('a,b')).toBeNull();
    expect(normalizeProjectTag('')).toBeNull();
    expect(normalizeProjectTag(undefined)).toBeNull();
  });
});

describe('R14: the canvas lives under its owner\'s profile', () => {
  it('builds /p/<handle>/canvas/<name> and recognises only that shape', () => {
    expect(canvasPath('slava', 'salesmastermind')).toBe('/p/slava/canvas/salesmastermind');
    expect(isCanvasPathname('/p/slava/canvas/salesmastermind')).toBe(true);
    expect(isCanvasPathname('/p/slava/canvas/salesmastermind/')).toBe(true);
    expect(isCanvasPathname('/p/slava/canvas/salesmastermind/extra')).toBe(false);
    expect(isCanvasPathname('/canvas/slava/salesmastermind')).toBe(false);
    expect(isCanvasPathname('/p/slava')).toBe(false);
  });
});

describe('TagPills', () => {
  it('hides box-tag pills the way it hides v-tags, keeps every other tag', () => {
    render(<MemoryRouter><TagPills tags={['claritypledge']} systemTags={['canvas:problem', 'v2', 'st1']} context="feed" /></MemoryRouter>);
    expect(screen.getByText('#claritypledge')).toBeInTheDocument();
    expect(screen.getByText('#st1')).toBeInTheDocument();
    expect(screen.queryByText(/canvas:/)).toBeNull();
    expect(screen.queryByText('#v2')).toBeNull();
  });
});

describe('FeedPointCard on the canvas panel', () => {
  const story = {
    id: 'story-1', authorId: 'owner-1', authorName: 'Owner', authorSlug: 'owner', content: 'The story behind the point.',
    visibility: 'public', createdAt: '2026-10-01T00:00:00Z', understoodCount: 0,
  } as unknown as StoryWithAuthor;

  it('by default the stories stay behind the expander', () => {
    render(<MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={[story]} /></MemoryRouter>);
    expect(screen.queryByText('The story behind the point.')).toBeNull();
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    expect(screen.getByText('The story behind the point.')).toBeInTheDocument();
  });

  it('onPositionSaved fires once the position is saved', async () => {
    const onPositionSaved = vi.fn();
    render(<MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={[]} onPositionSaved={onPositionSaved} /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: /^disagree/i })[0]);
    await waitFor(() => expect(onPositionSaved).toHaveBeenCalledTimes(1));
  });

  it('the full card is unchanged: footer, tags, Details still open /point/:id', () => {
    render(<MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={[]} /></MemoryRouter>);
    expect(screen.getByTestId('feed-point-card-point-1')).toBeInTheDocument();
    expect(screen.getByTestId('point-card-footer')).toBeInTheDocument();
    expect(screen.getByText('#claritypledge')).toBeInTheDocument();
    expect(screen.queryByText(/canvas:/)).toBeNull();
  });
});
