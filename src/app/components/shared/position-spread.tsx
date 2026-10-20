/**
 * @file position-spread.tsx
 * @description P1508 (D4, D6): how people spread on one point — seven grey bars, strongly disagree
 * on the left to strongly agree on the right, each as tall as the number of people at that level,
 * on a baseline with a taller tick at the centre level (Unsure). It lives on every point card —
 * the feed, /stake, profile, the /point page and the canvas — between the tags and the position
 * buttons (sixth round R3, R4: read how people stand, then take your own), never on /live, the
 * letter flow or story cards quoting a point. Where it shows, the buttons carry no counts (R5).
 *
 * One colour for every level: positions are styled uniformly — "Disagree isn't negative, Agree
 * isn't positive" (docs/design-system.md §Position Badges). The counts per level are in the
 * `title` and the accessible label.
 */
import { useState } from 'react';
import { ArrowLeftRight, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { POSITION_FIRST_PERSON, POSITION_ORDER } from '@/lib/compare-positions';
import { isContested, totalPositions, type LevelCounts } from '@/lib/position-spread';

/** Founder copy (P1508 fifth round, D6). */
export const SPREAD_EXPLANATION =
  'How everyone stands on this point: strongly disagree on the left, strongly agree on the right. Contested means at least two people on each side.';

/**
 * The spread's explanation behind an info button: opens on hover, toggles on tap, Enter or Space
 * (touch has no hover) — BannerCredit's Popover pattern, without its open-on-focus. Escape closes only the popover: Radix
 * marks the key event handled (defaultPrevented), which the canvas panel's own Escape respects.
 */
export function SpreadInfo() {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  return (
    <Popover
      open={hovered || pinned}
      onOpenChange={(open) => {
        setPinned(open);
        if (!open) setHovered(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How to read the spread"
          data-testid="spread-info"
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
          // A click, tap, Enter or Space pins it open or closed. Radix's own toggle is skipped
          // (preventDefault): it flips the COMBINED open state, so a click after hovering closed
          // what the reader meant to keep open (review). No open-on-focus, for the same reason.
          onClick={(e) => {
            e.preventDefault();
            // Unpinning closes it even with the pointer still on the button (review).
            const next = !pinned;
            setPinned(next);
            if (!next) setHovered(false);
          }}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto max-w-[min(300px,calc(100vw-24px))] px-3 py-2 text-sm"
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Focus never moved into the popover, so there is nothing to hand back — handing it to the
        // trigger would pull focus out of wherever the reader is when the pointer leaves.
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="spread-info-content"
      >
        {SPREAD_EXPLANATION}
      </PopoverContent>
    </Popover>
  );
}

/**
 * "Contested" (founder's word): at least two people on each side. Founder, fifth round: it is
 * important, so it reads as a label — full-strength text with an icon — not muted text. Neutral
 * colour, like every position (design-system.md §Position Badges). The two-way arrow: people
 * pulling in opposite directions (sixth round R3; the fork read as "branching").
 */
export function ContestedLabel({ testId = 'contested' }: { testId?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-foreground" data-testid={testId}>
      <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
      Contested
    </span>
  );
}

/**
 * The spread row of a point card: the spread (or "No positions yet"), "Contested" when it applies,
 * and — where the card is not itself a button — the info button explaining both.
 */
export function PointSpreadRow({ counts, withInfo = false, testId = 'point-spread-row', className = '' }: {
  counts: LevelCounts;
  withInfo?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()} data-testid={testId}>
      {totalPositions(counts) > 0
        ? <PositionSpread counts={counts} />
        : <span className="text-xs text-foreground/60" data-testid="spread-no-positions">No positions yet</span>}
      {isContested(counts) && <ContestedLabel />}
      {withInfo && <span className="-my-3"><SpreadInfo /></span>}
    </div>
  );
}

const CENTRE = POSITION_ORDER.indexOf('unsure');
const BAR_MAX = 16;

export function PositionSpread({ counts, testId = 'position-spread' }: { counts: LevelCounts; testId?: string }) {
  const bars = POSITION_ORDER.map(position => ({ position, n: counts[position] ?? 0 }));
  const max = Math.max(1, ...bars.map(b => b.n));
  const label = bars
    .filter(b => b.n > 0)
    .map(b => `${b.n} ${POSITION_FIRST_PERSON[b.position].toLowerCase()}`)
    .join(', ');
  return (
    <span role="img" aria-label={label} title={label} className="relative inline-flex h-5 shrink-0 items-end gap-0.5 pb-px" data-testid={testId}>
      {bars.map(({ position, n }, i) => (
        <span key={position} className="relative flex h-full w-1.5 items-end justify-center">
          {/* The centre level's tick, taller than the baseline: where Unsure sits. */}
          {i === CENTRE && <span aria-hidden className="absolute -bottom-1 h-2 w-px bg-border" data-testid="position-spread-centre" />}
          <span
            data-count={n}
            className="relative w-full rounded-t-sm bg-foreground/40"
            style={{ height: n === 0 ? 0 : Math.max(3, Math.round((n / max) * BAR_MAX)) }}
          />
        </span>
      ))}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" data-testid="position-spread-baseline" />
    </span>
  );
}
