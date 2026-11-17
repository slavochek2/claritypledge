/**
 * @file movement-bits.tsx
 * @description P1061: the small additions of position movement: a chip on a point that says how many people
 * changed position and which way, a chip on a story that says how many moved at all, the product's spread
 * drawn twice (first positions, then now), and an info button that holds the explanation so the card
 * carries no sentence.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { ContestedLabel, PositionSpread } from '@/app/components/shared/position-spread';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { POSITION_ORDER } from '@/lib/compare-positions';
import { isContested, type LevelCounts } from '@/lib/position-spread';
import type { Arrows, StoryMovement } from '@/lib/position-movement';
import { cn } from '@/lib/utils';
import { chipHint, spreadHint, storyHint } from './movement-copy';

const POPOVER = 'w-auto max-w-[min(300px,calc(100vw-24px))] px-3 py-2 text-sm';
/** An explanation keeps this far from the edge of the screen, so its border and shadow are never cut. */
const EDGE = 12;

/** An info button with the explanation behind it: tap or click to open, again to close. */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="-my-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" collisionPadding={EDGE} className={POPOVER}>{children}</PopoverContent>
    </Popover>
  );
}

/** The chip's frame: looks 22px tall and takes taps over 44px. What a tap opens is the caller's. */
export const Chip = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'> & { testId: string }>(function Chip({ testId, className, children, ...props }, ref) {
  return (
    <button ref={ref} type="button" data-testid={testId} {...props} className={cn('group -my-[11px] inline-flex shrink-0 items-center py-[11px] focus-visible:outline-none', className)}>
      {/* Filled and borderless: a figure, not an action. */}
      <span className="inline-flex h-[22px] min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 text-xs font-medium text-foreground group-hover:bg-accent group-focus-visible:ring-2 group-focus-visible:ring-blue-500">
        {children}
      </span>
    </button>
  );
});

/** A chip that opens its own explanation. */
function ChipButton({ label, hint, children, testId }: { label: string; hint: ReactNode; children: ReactNode; testId: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Chip testId={testId} aria-label={label}>{children}</Chip></PopoverTrigger>
      <PopoverContent side="bottom" align="start" collisionPadding={EDGE} className={POPOVER}>{hint}</PopoverContent>
    </Popover>
  );
}

/**
 * How many people changed position on one point, and which way: left toward disagree, right toward agree.
 * A side nobody moved to is dimmed, never hidden, so the chip keeps one shape.
 */
export function MovedChip({ arrows, authorName }: { arrows: Arrows; authorName: string }) {
  return (
    <ChipButton testId="moved-chip" label={`${arrows.left} moved toward disagree, ${arrows.right} moved toward agree. What this counts`} hint={chipHint(arrows, authorName)}>
      <span className={`inline-flex items-center gap-0.5 ${arrows.left === 0 ? 'text-foreground/70' : ''}`}>
        <ArrowLeft size={12} aria-hidden />{arrows.left}
      </span>
      <span className="h-3 w-px bg-foreground/30" aria-hidden />
      <span className={`inline-flex items-center gap-0.5 ${arrows.right === 0 ? 'text-foreground/70' : ''}`}>
        {arrows.right}<ArrowRight size={12} aria-hidden />
      </span>
      <span className="font-normal text-foreground/80" aria-hidden>moved</span>
    </ChipButton>
  );
}

/** What the story's chip shows, wherever it is and whatever it opens. */
export function CountFace({ moved }: { moved: number }) {
  return <span aria-hidden>{moved} <span className="font-normal text-foreground/80">moved</span></span>;
}

/**
 * A story's figure as one count, the sibling of the "N verified" badge beside it: of the people the author
 * verified, how many changed position. Nothing at all when nobody moved.
 */
export function StoryCountChip({ movement, authorName, pointCount }: { movement: StoryMovement; authorName: string; pointCount: number }) {
  if (movement.moved === 0) return null;
  const share = { verified: movement.verifiedCount, moved: movement.moved };
  return (
    <ChipButton testId="count-chip" label={`${share.moved} of ${share.verified} verified people moved. What this counts`} hint={storyHint(share, authorName, pointCount)}>
      <CountFace moved={share.moved} />
    </ChipButton>
  );
}

const BAR_MAX = 16;
const CENTRE = 3;

/** The first positions, in the shape of the product's spread but outlined. */
function OutlineSpread({ counts }: { counts: LevelCounts }) {
  const bars = POSITION_ORDER.map(position => counts[position] ?? 0);
  const max = Math.max(1, ...bars);
  return (
    <span role="img" aria-label="First positions" className="relative inline-flex h-5 shrink-0 items-end gap-0.5 pb-px" data-testid="position-spread-first">
      {bars.map((n, i) => (
        <span key={i} className="relative flex h-full w-1.5 items-end justify-center">
          {i === CENTRE && <span aria-hidden className="absolute -bottom-1 h-2 w-px bg-border" />}
          <span className="w-full rounded-t-sm border border-b-0 border-foreground/60" style={{ height: n === 0 ? 0 : Math.max(3, Math.round((n / max) * BAR_MAX)), borderWidth: n === 0 ? 0 : undefined }} />
        </span>
      ))}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" />
    </span>
  );
}

/**
 * The spread row of a point card with one addition: the first positions, outlined, then an arrow, then the
 * spread the product shows today. When nobody has changed, only today's spread is drawn.
 */
export function SpreadShift({ first, now, className = '' }: { first: LevelCounts; now: LevelCounts; className?: string }) {
  const changed = JSON.stringify(first) !== JSON.stringify(now);
  const contested = isContested(now);
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()} data-testid="spread-shift">
      {changed && (
        <>
          <OutlineSpread counts={first} />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
        </>
      )}
      <PositionSpread counts={now} />
      <span className="inline-flex items-center gap-2">
        {contested && <ContestedLabel />}
        <Hint label="How to read the spread">{spreadHint(changed, contested)}</Hint>
      </span>
    </div>
  );
}
