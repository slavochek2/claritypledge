/**
 * @file p1536-canvas-grid-changed.test.tsx
 * @description P1536 S3.7 and S3.8.
 *  - S3.7 the grid's columns follow its container: under 520px one, 520-719px two, 720px and up three (boundaries pinned, and the
 *    rendered grid reads its own width, not the screen's)
 *  - S3.8 "Changed" (D6): the owner's draft view marks the boxes the read says differ from the base; a published version, a reader and
 *    a draft with no base (nothing changed) show none
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { columnsForWidth } from '@/app/components/canvas/use-container-columns';
import { changedBoxes, type CanvasReady } from '@/app/components/canvas/canvas-page-data';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('S3.7: columns follow the container', () => {
  it.each([[0, 1], [319, 1], [519, 1], [520, 2], [719, 2], [720, 3], [1400, 3]])('a container %ipx wide has %i column(s)', (width, columns) => {
    expect(columnsForWidth(width)).toBe(columns);
  });

  /** A container of this width, measured the way the browser reports it. */
  function gridAt(width: number) {
    const observers: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { observers.push(cb); } observe() {} disconnect() {} unobserve() {} });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }));
    render(<CanvasGrid boxes={new Map()} renderCard={() => null} onMore={() => undefined} />);
    const grid = screen.getByTestId('canvas-grid');
    return { grid, observers, rect };
  }

  it.each([[375, 'grid-cols-1', '1'], [519, 'grid-cols-1', '1'], [520, 'grid-cols-2', '2'], [719, 'grid-cols-2', '2'], [720, 'grid-cols-3', '3'], [1100, 'grid-cols-3', '3']])('a grid measured at %ipx uses %s', (width, cls, n) => {
    const { grid, rect } = gridAt(width);
    expect(grid.className).toContain(cls);
    expect(grid).toHaveAttribute('data-columns', n);
    // the class set has no screen-breakpoint column rules: the SCREEN width does not decide
    expect(grid.className).not.toMatch(/\b(?:sm|md|lg|xl|2xl):grid-cols-/);
    rect.mockRestore();
  });

  it('re-measures when the container resizes (the workspace pane narrows or widens)', () => {
    const { grid, observers, rect } = gridAt(800);
    expect(grid).toHaveAttribute('data-columns', '3');
    rect.mockImplementation(() => ({ width: 560 } as DOMRect));
    act(() => observers.forEach(cb => cb()));
    expect(screen.getByTestId('canvas-grid')).toHaveAttribute('data-columns', '2');
    rect.mockRestore();
  });
});

describe('S3.8: Changed marks (D6), owner draft views only', () => {
  const boxes = new Map();
  const marks = (changed?: readonly string[]) => {
    render(<CanvasGrid boxes={boxes} renderCard={() => null} onMore={() => undefined} changed={changed} />);
    return screen.queryAllByTestId('canvas-box-changed').map(el => el.closest('section')!.getAttribute('data-testid'));
  };

  it('marks exactly the boxes the read lists, and nothing else', () => {
    expect(marks(['canvas:problem', 'canvas:revenue'])).toEqual(['canvas-box-canvas:problem', 'canvas-box-canvas:revenue']);
    cleanup();
    const view = render(<CanvasGrid boxes={boxes} renderCard={() => null} onMore={() => undefined} changed={['canvas:problem']} />);
    expect(within(view.getByTestId('canvas-box-canvas:problem')).getByTestId('canvas-box-changed')).toHaveTextContent('Changed');
    expect(within(view.getByTestId('canvas-box-canvas:love')).queryByTestId('canvas-box-changed')).toBeNull();
  });

  it('CONTROLS: no list (published version, a reader), an empty list (a draft with no base, or undone back to the base) show no mark', () => {
    expect(marks(undefined)).toEqual([]);
    cleanup();
    expect(marks([])).toEqual([]);
  });

  const ready = (over: Partial<CanvasReady>): CanvasReady => ({
    status: 'ready', ownerId: 'o', ownerName: 'Ana', owner: { name: 'Ana', hasPledged: false }, points: [], stories: new Map(), positions: new Map(),
    visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], version: 'canvas_dabc', versions: [], publishedNone: false,
    draft: { id: 'd', version: 'canvas_dabc', questions: {}, threadRootId: 'r', conversationId: 'c', baseSeq: 1, runCount: 1, revision: 0, changedBoxes: ['canvas:problem'] },
    ...over,
  });

  it('changedBoxes(): the owner on the draft version gets the list; the owner on a published version, a reader and a loading page get none', () => {
    expect(changedBoxes(ready({}))).toEqual(['canvas:problem']);
    expect(changedBoxes(ready({ version: 'canvas_d1' }))).toBeUndefined(); // viewing a published version while a draft is open
    expect(changedBoxes(ready({ isOwner: false }))).toBeUndefined();
    expect(changedBoxes(ready({ draft: null }))).toBeUndefined();
    expect(changedBoxes(null)).toBeUndefined();
  });
});
