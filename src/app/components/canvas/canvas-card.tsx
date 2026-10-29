/**
 * @file canvas-card.tsx
 * @description A box card on the canvas (D4): text to read, no controls inside; the whole card opens the point.
 */
import { ChevronRight } from 'lucide-react';
import { StanceColumn, type Person } from '@/app/components/compare/statement-row';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import { SharedIcon } from '@/app/components/canvas/canvas-audience';
import { POSITION_FIRST_PERSON, POSITION_FULL_LABELS } from '@/lib/compare-positions';
import { levelCounts } from '@/lib/position-spread';
import { stripHashtags } from '@/lib/utils';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import type { PointPositionWithUser, PointWithUserPosition, PositionType } from '@/app/types';
import type { CanvasPerson } from './canvas-page-data';

/** A card's compare column is narrow: first names there; the picker above names people in full. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function stanceLabel(position: PositionType | undefined, firstPerson: boolean): string {
  if (!position) return 'No position';
  return (firstPerson ? POSITION_FIRST_PERSON : POSITION_FULL_LABELS)[position];
}

/**
 * A box card (D4): text to read, no controls inside; the whole card opens the point. Under the
 * statement, always: how everyone spreads, and "Contested" when at least two people stand on each
 * side. When Compare is set, two people's positions in the compare page's columns, small (D8); a
 * person with no position reads "No position", and the card stays where it is.
 */
export function CanvasCard({ point, viewerId, positions, compare, selected, sharedLabel, onOpen }: {
  point: PointWithUserPosition;
  viewerId?: string;
  /** everyone's positions on the point; null: none are shown (the owner's draft version has no positions) */
  positions: PointPositionWithUser[] | null;
  compare: { base: Person; baseId: string; baseIsViewer: boolean; other: CanvasPerson } | null;
  selected: boolean;
  /** the shared icon's words; null: the canvas is private to its owner (no icon) */
  sharedLabel: string | null;
  onOpen: () => void;
}) {
  // Everyone, the owner included: the same read the open point's card and block count from.
  const counts = levelCounts(positions ?? []);
  // The viewer's own position (signed in: the read; signed out: what this browser kept).
  const positionOf = (userId: string) => (positions ?? []).find(p => p.userId === userId)?.position;
  const viewerPosition = viewerId
    ? point.userPosition?.position ?? positionOf(viewerId)
    : (getAnonPosition(point.id) as PositionType | null) ?? undefined;
  const basePosition = compare
    ? (compare.baseIsViewer ? viewerPosition ?? positionOf(compare.baseId) : positionOf(compare.baseId))
    : undefined;
  const otherPosition = compare ? positionOf(compare.other.id) : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`canvas-point-card-${point.id}`}
      data-selected={selected || undefined}
      className={`group w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-border'}`}
    >
      <p className="line-clamp-5 break-words text-sm font-medium text-foreground">
        {/* One visibility idea: the canvas's audience, not the point's own flag, decides who reads it. */}
        {sharedLabel && <><SharedIcon label={sharedLabel} />{' '}</>}
        {stripHashtags(point.statement, point.tags)}
      </p>
      {/* The card's spread row (no info button: the card is itself one button). Founder, sixth
          round: nothing invited a click — a quiet chevron, always visible (phones have no hover). */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {positions ? <PointSpreadRow counts={counts} testId="canvas-card-spread-row" /> : <span />}
        <ChevronRight aria-hidden data-testid="canvas-card-open" className="h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      {compare && (
        <div className="mt-2 flex items-start gap-2" data-testid="canvas-card-compare">
          <StanceColumn
            compact
            muted={!basePosition}
            person={{ ...compare.base, name: firstName(compare.base.name) }}
            label={stanceLabel(basePosition, compare.baseIsViewer)}
          />
          <div className="w-px self-stretch bg-border" />
          <StanceColumn
            compact
            muted={!otherPosition}
            person={{ ...compare.other, name: firstName(compare.other.name) }}
            label={stanceLabel(otherPosition, false)}
          />
        </div>
      )}
    </button>
  );
}
