/**
 * @file p1536-w9-no-position.test.tsx
 * @description P1536 §3b W9 (S3b.8): "Hide empty hints". A point nobody has taken a position on shows no "No positions yet" on the canvas: not on the
 * box cards (owner or reader) and not in the open point's panel. Every other page keeps the hint (the shared spread row defaults to showing it).
 * The hint's actual text is "No positions yet" (data-testid spread-no-positions); the owner header's separate, factual "No position" (the owner
 * themself holds none) is not this hint and is not touched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import { levelCounts } from '@/lib/position-spread';
import type { PointPositionWithUser, PointWithUserPosition, PositionType } from '@/app/types';

afterEach(() => cleanup());

const point = { id: 'p1', statement: 'Cafes lose a day a month to their books', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null, totalPositions: 0 } as unknown as PointWithUserPosition;
const pos = (userId: string, position: PositionType) => ({
  id: `pos-${userId}`, pointId: 'p1', userId, position, createdAt: '', updatedAt: '', userName: userId, userSlug: userId, earCount: 0, userHasPledged: false,
}) as unknown as PointPositionWithUser;
const HINT = /No positions? yet/i;

describe('S3b.8: a point with no positions renders no "No positions yet"', () => {
  it.each([['the owner', 'owner-1'], ['a reader', 'reader-1'], ['a signed-out visitor', undefined]])('the box card, seen by %s, has no hint and no empty spread row, and still opens', (_who, viewerId) => {
    render(<CanvasCard point={point} viewerId={viewerId} positions={[]} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />);
    expect(screen.queryByTestId('spread-no-positions')).toBeNull();
    expect(screen.queryByTestId('canvas-card-spread-row')).toBeNull();
    expect(document.body.textContent).not.toMatch(HINT);
    expect(screen.getByTestId('canvas-card-open')).toBeInTheDocument(); // the chevron is still there, and still on the right
    expect(screen.getByTestId('canvas-card-open').getAttribute('class')).toContain('ml-auto');
  });

  it('CONTROL: a point WITH positions still shows its spread row (and Contested when it applies)', () => {
    const positions = [pos('a', 'agree'), pos('b', 'somewhat_agree'), pos('c', 'disagree'), pos('d', 'strongly_disagree')];
    render(<CanvasCard point={point} viewerId="owner-1" positions={positions} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />);
    expect(screen.getByTestId('canvas-card-spread-row')).toBeInTheDocument();
    expect(screen.getByTestId('position-spread')).toBeInTheDocument();
    expect(screen.queryByTestId('spread-no-positions')).toBeNull();
  });

  it('the shared spread row hides its empty hint only when asked (the panel\'s row); every other caller keeps it', () => {
    const empty = levelCounts([]);
    const { unmount } = render(<PointSpreadRow counts={empty} hideEmpty withInfo />);
    expect(screen.queryByTestId('point-spread-row')).toBeNull();
    expect(document.body.textContent).toBe('');
    unmount();
    render(<PointSpreadRow counts={empty} />);
    expect(screen.getByTestId('spread-no-positions')).toHaveTextContent('No positions yet');
  });

  it('CONTROL: hideEmpty with positions still draws the row', () => {
    render(<PointSpreadRow counts={levelCounts([pos('a', 'agree')])} hideEmpty withInfo />);
    expect(screen.getByTestId('point-spread-row')).toBeInTheDocument();
    expect(screen.queryByTestId('spread-no-positions')).toBeNull();
  });

  it('every spread row on the canvas (cards and the open point\'s panel) is drawn with hideEmpty; the hint text lives only in the shared row', () => {
    const root = join(__dirname, '..', 'app');
    const files = ['components/canvas/canvas-card.tsx', 'pages/canvas-page.tsx', 'components/canvas/canvas-point-panel.tsx'];
    let rows = 0;
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/<PointSpreadRow\b[^>]*>/g)) {
        rows += 1;
        expect(m[0], `${f}: ${m[0]}`).toContain('hideEmpty');
      }
      expect(src, f).not.toMatch(HINT);
    }
    expect(rows).toBeGreaterThanOrEqual(2); // the card and the panel: the search found them (not a blind pass)
  });
});
