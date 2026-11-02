/**
 * @file p1536-x12-removed.test.tsx
 * @description P1536 3c X12 (S3c.9): no text where the boxes already say it, and Changed means something.
 *  - "Nothing is drafted yet." and "You can still change who has access above." do not render; a reader of an empty canvas keeps "This canvas has no points yet."
 *  - Changed means: differs from the version this draft started from. A box the base had and an update emptied reads Empty with a Removed tag;
 *    a changed box that has points reads Changed; a first canvas (no base) shows neither (D6).
 * The real grid, header and the page's own `changedBoxes` rule; no network.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { PointWithUserPosition } from '@/app/types';

vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));

import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import { changedBoxes, hasNothingToShow } from '@/app/components/canvas/canvas-page-data';
import { groupPointsByBox } from '@/lib/canvas-boxes';

afterEach(() => cleanup());

const pt = (id: string, box: string) => ({ id, statement: `Bet ${id}`, tags: [], systemTags: [box], visibility: 'private' }) as unknown as PointWithUserPosition;
const grid = (points: PointWithUserPosition[], changed: readonly string[] | undefined) =>
  render(<CanvasGrid boxes={groupPointsByBox(points)} renderCard={p => <div key={p.id} data-testid="card">{p.statement}</div>} onMore={() => undefined} changed={changed} />);
const box = (tag: string) => screen.getByTestId(`canvas-box-${tag}`);

describe('X12: Changed, and Removed for a box an update emptied', () => {
  it('an emptied box that the base had reads Empty with Removed, not Changed', () => {
    grid([pt('a', 'canvas:problem')], ['canvas:problem', 'canvas:solution']); // solution changed and has no points now
    expect(within(box('canvas:solution')).getByTestId('canvas-box-removed')).toHaveTextContent('Removed');
    expect(within(box('canvas:solution')).queryByTestId('canvas-box-changed')).toBeNull();
    expect(box('canvas:solution')).toHaveTextContent('Empty');
  });

  it('a changed box that has points reads Changed, not Removed', () => {
    grid([pt('a', 'canvas:problem')], ['canvas:problem']);
    expect(within(box('canvas:problem')).getByTestId('canvas-box-changed')).toHaveTextContent('Changed');
    expect(within(box('canvas:problem')).queryByTestId('canvas-box-removed')).toBeNull();
  });

  it('an unchanged box, empty or not, shows neither', () => {
    grid([pt('a', 'canvas:problem')], ['canvas:problem']);
    expect(within(box('canvas:metrics')).queryByTestId('canvas-box-removed')).toBeNull();
    expect(within(box('canvas:metrics')).queryByTestId('canvas-box-changed')).toBeNull();
  });

  it('no changed list (a first canvas, a published view, a reader): no Changed and no Removed on any box, empty or not', () => {
    grid([pt('a', 'canvas:problem')], undefined);
    expect(screen.queryAllByTestId('canvas-box-changed')).toEqual([]);
    expect(screen.queryAllByTestId('canvas-box-removed')).toEqual([]);
  });

  it('the page\'s rule: a draft with no base shows neither, even if the read carried boxes; a draft with a base shows what differs', () => {
    const draft = (baseSeq: number | null, changedBoxesList: string[]) => ({ isOwner: true, version: 'd', draft: { version: 'd', baseSeq, changedBoxes: changedBoxesList } }) as unknown as CanvasReady;
    expect(changedBoxes(draft(null, ['canvas:problem']))).toBeUndefined();
    expect(changedBoxes(draft(1, ['canvas:problem']))).toEqual(['canvas:problem']);
    expect(changedBoxes(null)).toBeUndefined();
  });

  it('CONTROL (gate 7): the same checks fail on the old behaviour: a changed EMPTY box was "Changed" (the B5 draft read all nine boxes "Empty" and "Changed")', () => {
    grid([], ['canvas:problem']);
    expect(within(box('canvas:problem')).queryByTestId('canvas-box-changed')).toBeNull();
    expect(within(box('canvas:problem')).getByTestId('canvas-box-removed')).toBeInTheDocument();
  });
});

describe('X12: the sentences that repeat what the boxes say', () => {
  const header = (over: Partial<CanvasReady>) => {
    const ready = { status: 'ready', ownerId: 'u1', ownerName: 'Ana', owner: { name: 'Ana', hasPledged: false }, points: [], stories: new Map(), positions: new Map(), visibility: 'private', isOwner: false,
      generalAccess: 'restricted', via: null, audience: null, addedStoryIds: [], version: 'v1', versions: [{ name: 'v1', draft: false, seq: 1 }], publishedNone: false, draft: null, ...over } as unknown as CanvasReady;
    return render(<MemoryRouter><CanvasHeader ready={ready} failed={false} handle="ana" projectTag="canvas" ownerIsAgent={false} identityPending={false} compare={{ base: null, others: [], withPerson: null }} sharedLabel={null} onParams={() => undefined} onChanged={() => undefined} /></MemoryRouter>);
  };
  it('a reader of an empty canvas reads "This canvas has no points yet." and nothing about access', () => {
    header({});
    expect(screen.getByTestId('canvas-empty-owner')).toHaveTextContent('This canvas has no points yet.');
    expect(document.body).not.toHaveTextContent('You can still change who has access above');
  });
  it('the owner reads the same, with no access sentence either ("goes for everyone")', () => {
    header({ isOwner: true, canvasId: 'c1' });
    expect(screen.getByTestId('canvas-empty-owner')).toHaveTextContent(/^This canvas has no points yet\.$/);
    expect(document.body).not.toHaveTextContent('who has access');
  });
  it('a draft with nothing drafted renders no sentence ("Nothing is drafted yet." is gone)', () => {
    header({ isOwner: true, version: 'd', versions: [{ name: 'd', draft: true, seq: null }] as never, publishedNone: true, draft: { id: 'd1', version: 'd', questions: {}, threadRootId: 'r', conversationId: 'c', baseSeq: null, runCount: 0, revision: 1, changedBoxes: [] } });
    expect(document.body).not.toHaveTextContent('Nothing is drafted yet');
    expect(screen.queryByTestId('canvas-draft-empty')).toBeNull();
  });
  it('S3c.4: the owner of a canvas with nothing published and no draft reads no "Nothing published yet" in the header (the nine empty boxes say it); a reader keeps the one-line "has not published" sentence', () => {
    header({ isOwner: true, canvasId: 'c1', publishedNone: true, version: null, versions: [] as never });
    expect(screen.getByTestId('canvas-header-row')).not.toHaveTextContent('Nothing published yet');
    expect(screen.queryByTestId('canvas-nothing-published')).toBeNull();
    cleanup();
    header({ publishedNone: true, version: null, versions: [] as never });
    expect(screen.getByTestId('canvas-nothing-published')).toHaveTextContent("Ana hasn't published this canvas yet.");
  });
  it('the owner of that canvas still gets the grid (hasNothingToShow is for readers); a reader does not', () => {
    const base = { isOwner: true, publishedNone: true, draft: null } as unknown as CanvasReady;
    expect(hasNothingToShow(base)).toBe(false);
    expect(hasNothingToShow({ ...base, isOwner: false } as CanvasReady)).toBe(true);
  });
});
