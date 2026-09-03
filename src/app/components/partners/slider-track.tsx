/**
 * @file slider-track.tsx
 * @description P562: Production slider component for free mode.
 * Custom pointer-event-based slider (0-10) with large touch target,
 * debounced live_state writes, and keyboard accessibility.
 */
import { useCallback, useId, useMemo, useRef, useEffect } from 'react';

interface SliderTrackProps {
  /** Current value (0-10) */
  value: number;
  /** Called on every drag position change (local state update) */
  onChange: (value: number) => void;
  /** Called with debounced value for Realtime broadcast (300ms after last change) */
  onDebouncedChange?: (value: number) => void;
  /** Whether the slider is read-only (used in Journey display) */
  readonly?: boolean;
  /** Debounce interval in ms for onDebouncedChange */
  debounceMs?: number;
  /** Whether to render the "{value}/10" numeral above the track. Default true (free mode). */
  showValue?: boolean;
  /** Accessible name for the slider. Default "Understanding rating" (free mode). */
  ariaLabel?: string;
  /** P1077: when set, renders a tick + label at the midpoint (5/10) — e.g. "Neutral". */
  midpointLabel?: string;
  /** P1077: when set, renders a label under each end of the track (e.g. "Keep it light" / "Go deep"). */
  poleLabels?: { low: string; high: string };
  /**
   * P1077: renders the thumb hollow and the fill bar grey instead of solid blue —
   * signals "not yet interacted with" (vs. a deliberate choice at this position).
   */
  muted?: boolean;
  /**
   * P1077: fills from the midpoint outward instead of from the left edge. A
   * left-anchored fill reads as a unipolar progress/volume bar ("50% full");
   * center-out fill reads as a position on a two-sided scale, matching a bipolar
   * control with no numeral. Default false (free mode's unipolar fill, unchanged).
   */
  bipolarFill?: boolean;
  /**
   * P1077: expands the vertical hit area beyond the visible track height, via
   * padding offset by an equal negative margin — the interactive box grows, the
   * rendered layout doesn't shift. The thumb visually overflows the thin track;
   * without this, tapping its top/bottom edge (not just its exact center row)
   * misses. Default false (free mode's existing footprint, unchanged).
   */
  expandedHitArea?: boolean;
  /**
   * P1083: other respondents' values (0-10), rendered as faint marks resting on
   * THIS track rather than as a separate chart above it. The visitor learns what
   * a mark means from the thumb they are about to drag — no caption needed. See
   * `ghostPositions` for why a crowd widens instead of growing taller.
   */
  others?: number[];
  /** P1083: screen-reader-only description of `others`. Ignored when empty. */
  othersLabel?: string;
}

/**
 * P1083 layout for the `others` marks.
 *
 * Each respondent is one mark, always — a count-preserving encoding, unlike a
 * smoothed curve or a normalized bar, which render identically at N=1 and N=50
 * (see the spec's UI Contract footnote for the shipped-product survey behind
 * this). Marks sharing a value stack upward so the pile's shape reads as the
 * room's shape.
 *
 * Height is capped at GHOST_MAX_ROWS; a crowd past that grows WIDER, never
 * taller. Two reasons, in order:
 *
 * 1. An uncapped pile is unbounded — 12 people on one value would stack ~100px
 *    up, into the question above the slider. Capping makes the layer's height a
 *    constant, so it can be painted over the gap that already exists without
 *    reserving space or reflowing anything (which is also why N=0 renders
 *    nothing at all, rather than an empty axis).
 * 2. The scale has 11 discrete steps, so a cluster on "7" is the scale rounding
 *    people together, not 12 people who agree exactly. Spreading reads as the
 *    natural cluster it is; a spike reads as a glitch.
 *
 * Rows TAPER upward (5-4-3 for 12, not a 3x4 block) and each row is centred, so
 * consecutive rows sit half a step out of phase. Both are load-bearing: an even
 * grid of marks reads as an app icon rather than as people — first render of
 * this, at 12-on-one-value, produced a literal 3x4 dot-matrix glyph. A tapered,
 * staggered heap reads as a pile, and its silhouette is the room's shape.
 *
 * Marks on the visitor's OWN value are lifted clear of the thumb — see
 * `liftValue`. The thumb is 28px plus a 4px ring, so it spans +/-18px around the
 * track centre and would otherwise swallow the bottom row whole, silently
 * deleting the "someone else is here too" signal at exactly the position the
 * visitor is looking at (independent visual QA, unverified-edge flag).
 *
 * The lifted group keeps the SAME heap shape as everywhere else, just raised, and
 * is capped a row shorter to stay inside the headroom. An earlier version laid it
 * out as a single even row, which at n=3 produced three evenly-spaced dots in a
 * line directly above a circle — a near-exact match for the chat "typing…"
 * indicator, and QA's most likely misread of the whole feature. Cleaning up the
 * spacing had made that resemblance STRONGER, not weaker. A heap has no such
 * competing convention, and reusing one shape everywhere means a visitor only has
 * to learn what a mark is once.
 */
const GHOST_MAX_ROWS = 3;
/**
 * Steps EXCEED the mark's own footprint (10px circle + 2px ring = 14px), so marks
 * never touch. This is the single most load-bearing number here: two earlier passes
 * packed marks tighter than their own diameter to fit a 40px gap, and independent
 * visual QA read the results as "a bunch of grapes", "a pinecone", "a typing
 * indicator" — every time, because overlapping circles fuse into one silhouette and
 * the individual person stops being a visible unit. A count-preserving encoding that
 * visually merges its units is not count-preserving. The gap above the slider was
 * widened to buy this room (see `ready-page`); the page had spare vertical space all
 * along, and the tight packing was working around a self-imposed constraint.
 */
const GHOST_ROW_STEP = 13;
const GHOST_COL_STEP = 15;
const GHOST_BASE_OFFSET = 8;
/** Clears the thumb (14px half-height + 4px ring + the mark's own 5px radius). */
const GHOST_LIFT_OFFSET = 24;
/** One row shorter than a resting heap: the lifted group starts 24px higher and
 * still has to fit under the question. */
const GHOST_MAX_ROWS_LIFTED = 2;

/**
 * Narrowest track this component is ever laid out in: 320px viewport minus the page's
 * own px-4 gutters. Used as a CONSERVATIVE width budget — bounding against the
 * narrowest case means a wider track simply leaves some slack unused, whereas
 * bounding against the widest would overflow the narrow one.
 */
const GHOST_TRACK_MIN_PX = 288;
/** Keeps a mark's own radius plus ring inside the track ends. */
const GHOST_EDGE_INSET_PX = 7;

/**
 * Only the pile's HEIGHT is capped by construction — its WIDTH grows with the crowd,
 * and nothing stopped it. At the read cap of 200 rows, 200 people on ONE value fan to
 * +/-502px on a track at most 384px wide (measured, not theorised); at 320px that puts
 * marks past the viewport edge entirely. A mark sits at `value*10% + dx`, so the space
 * available to its left is `value/10` of the track and to its right the remainder —
 * this clamps `dx` to exactly that, per value, so a mark can never leave the track at
 * any value including 0 and 10.
 *
 * Past the ~20-50 range this pattern is documented to serve (spec UI Contract,
 * footnote 1) marks therefore COMPRESS against the ends rather than escaping:
 * degraded, but every person still rendered. Dropping the overflow instead would
 * silently stop the encoding being one-mark-per-person, which is the entire reason
 * this is marks and not a curve.
 */
function clampFan(dx: number, value: number): number {
  const leftRoom = (value / 10) * GHOST_TRACK_MIN_PX - GHOST_EDGE_INSET_PX;
  const rightRoom = (1 - value / 10) * GHOST_TRACK_MIN_PX - GHOST_EDGE_INSET_PX;
  return Math.max(-Math.max(0, leftRoom), Math.min(Math.max(0, rightRoom), dx));
}

/** Row widths for a heap of `n`, bottom row first: the narrowest taper that holds n. */
function heapRows(n: number, maxRows: number): number[] {
  let base = 1;
  const capacity = (w: number) => {
    let total = 0;
    for (let i = 0; i < maxRows; i++) total += Math.max(0, w - i);
    return total;
  };
  while (capacity(base) < n) base++;
  const rows: number[] = [];
  let left = n;
  for (let i = 0; i < maxRows && left > 0; i++) {
    const width = Math.min(left, Math.max(0, base - i));
    if (width <= 0) break;
    rows.push(width);
    left -= width;
  }
  return rows;
}

function ghostPositions(
  values: number[],
  liftValue?: number,
): { value: number; dx: number; dy: number }[] {
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));

  const layout = new Map<number, { dx: number; dy: number }[]>();
  counts.forEach((n, value) => {
    const slots: { dx: number; dy: number }[] = [];
    const lifted = value === liftValue;
    const rows = heapRows(n, lifted ? GHOST_MAX_ROWS_LIFTED : GHOST_MAX_ROWS);
    const base = lifted ? GHOST_LIFT_OFFSET : GHOST_BASE_OFFSET;
    rows.forEach((width, row) => {
      for (let j = 0; j < width; j++) {
        slots.push({
          dx: clampFan((j - (width - 1) / 2) * GHOST_COL_STEP, value),
          dy: base + row * GHOST_ROW_STEP,
        });
      }
    });
    layout.set(value, slots);
  });

  const taken = new Map<number, number>();
  return values.map((value) => {
    const i = taken.get(value) ?? 0;
    taken.set(value, i + 1);
    // Every distinct value got a slot list above, sized to its own count, so this
    // always resolves — but fall back to the resting base rather than assert it,
    // so a future change to the layout pass degrades to a visible mark instead of
    // throwing on render.
    const slot = layout.get(value)?.[i] ?? { dx: 0, dy: GHOST_BASE_OFFSET };
    return { value, dx: slot.dx, dy: slot.dy };
  });
}

export function SliderTrack({
  value,
  onChange,
  onDebouncedChange,
  readonly = false,
  debounceMs = 300,
  showValue = true,
  ariaLabel = 'Understanding rating',
  midpointLabel,
  poleLabels,
  muted = false,
  bipolarFill = false,
  expandedHitArea = false,
  others,
  othersLabel,
}: SliderTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingValue = useRef<number | null>(null);

  // Flush pending debounced value on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        if (pendingValue.current !== null && onDebouncedChange) {
          onDebouncedChange(pendingValue.current);
        }
      }
    };
  }, [onDebouncedChange]);

  const computeValue = useCallback((clientX: number): number => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(fraction * 10);
  }, [value]);

  const emitChange = useCallback((newValue: number) => {
    onChange(newValue);

    // Debounce the Realtime write
    if (onDebouncedChange) {
      pendingValue.current = newValue;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onDebouncedChange(newValue);
        pendingValue.current = null;
      }, debounceMs);
    }
  }, [onChange, onDebouncedChange, debounceMs]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (readonly) return;
    e.preventDefault();
    const newVal = computeValue(e.clientX);
    emitChange(newVal);

    const onMove = (ev: PointerEvent) => {
      const v = computeValue(ev.clientX);
      emitChange(v);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [readonly, computeValue, emitChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readonly) return;
    let newVal = value;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      newVal = Math.min(10, value + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      newVal = Math.max(0, value - 1);
      e.preventDefault();
    } else if (e.key === 'Home') {
      newVal = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      newVal = 10;
      e.preventDefault();
    }
    if (newVal !== value) {
      emitChange(newVal);
    }
  }, [readonly, value, emitChange]);

  const pct = value * 10;
  const fillLeft = bipolarFill ? Math.min(50, pct) : 0;
  const fillWidth = bipolarFill ? Math.abs(pct - 50) : pct;

  // Memoised because `value` is one of its inputs and `value` changes on EVERY
  // pointermove during a drag — without this, a Map build plus a nested loop over up
  // to 200 marks reruns every frame of the interaction that matters most.
  // The marks are aria-hidden inside role="slider" (descendants of a slider are
  // presentational to AT), so this sr-only text is the ONLY channel carrying the
  // distribution to a non-visual user — there is no visible caption by design.
  // Wired via aria-describedby rather than left as a preceding sibling: document
  // order only reaches someone reading top-to-bottom, and a user who jumps straight
  // to the control (rotor, tab, heading nav) would otherwise never hear it at all.
  const othersLabelId = useId();
  const ghosts = useMemo(
    () => (others?.length ? ghostPositions(others, value) : []),
    [others, value],
  );

  return (
    <div className="w-full">
      {/* P1083: the marks themselves are decorative (they live inside role="slider",
          where AT treats descendants as presentational anyway) — this carries their
          meaning instead. Wording stays neutral: never "aggregate", never a claim of
          anonymity that a single mark wouldn't back up. Absent at N=0, so silence
          reads as silence rather than as "nobody is here yet". */}
      {ghosts.length > 0 && othersLabel && (
        <span id={othersLabelId} className="sr-only">
          {othersLabel}
        </span>
      )}
      {showValue && (
        <div className="flex justify-end mb-1">
          <span className="text-xl font-light tabular-nums text-gray-900">{value}/10</span>
        </div>
      )}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-label={ariaLabel}
        aria-describedby={ghosts.length > 0 && othersLabel ? othersLabelId : undefined}
        tabIndex={readonly ? -1 : 0}
        className={`relative w-full ${expandedHitArea ? '-my-4 py-4' : ''} ${
          readonly
            ? ''
            : `cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full`
        }`}
        style={{ touchAction: 'none' }}
      >
        <div
          className={`relative w-full h-2.5 rounded-full ${readonly ? 'opacity-75' : ''}`}
          style={{ background: '#eff6ff' }}
        >
          {/* Fill bar — left-anchored by default (free mode's unipolar progress
              read); center-out when bipolarFill, so a two-sided control doesn't
              visually read as "50% full" at rest. */}
          <div
            className="absolute top-0 h-full rounded-full transition-all duration-150"
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
              background: muted ? '#cbd5e1' : '#3b82f6',
            }}
          />
          {/* Midpoint tick — sits under the thumb at rest (value=5); revealed once
              the thumb moves away from centre. */}
          {midpointLabel && (
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-400/70"
            />
          )}
          {/* P1083: other respondents, resting ON this track so they share the
              visitor's own ruler. Rendered BEFORE the thumb so the thumb always
              wins the overlap — you can never lose yourself in the crowd.
              Deliberately the SAME shape vocabulary as the thumb (ringed circle,
              same blue) at roughly half its size: the encoding is unlabelled, so
              the only way a visitor decodes a mark is by recognising it as a
              smaller sibling of the control they are about to drag. A first pass
              used 7px pale-grey dots and independent visual QA read them as
              "stray pixel / screen dust / a ruler notch" — never as a person.
              NOT dimmed while untouched: the same review found dimming lost them
              at first paint, which is the one moment they have to land. Their
              marks are solid because they answered; the visitor's thumb stays
              hollow because they have not. That contrast carries the state. */}
          {ghosts.length > 0 && (
            <div
              aria-hidden="true"
              data-testid="others-marks"
              className="pointer-events-none absolute inset-0"
            >
              {ghosts.map((g, i) => (
                <span
                  key={i}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400 ring-2 ring-white dark:bg-blue-400 dark:ring-slate-900"
                  style={{
                    left: `calc(${g.value * 10}% + ${g.dx}px)`,
                    top: `calc(50% - ${g.dy}px)`,
                  }}
                />
              ))}
            </div>
          )}
          {/* Thumb — hollow/muted until the first interaction (P1077), so "never
              touched" is visually distinct from "deliberately left at Neutral". */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full shadow-md ring-4 ring-white transition-all duration-150 ${
              muted ? 'bg-white border-2 border-slate-300' : 'bg-blue-500'
            }`}
            style={{ left: `calc(${pct}% - 14px)` }}
          />
        </div>
      </div>
      {(midpointLabel || poleLabels) && (
        // expandedHitArea's negative-margin/padding trick expands the interactive div's
        // border box 16px below the visible track — this row sits close enough (mt-1.5 =
        // 6px) to overlap that expanded box by 10px. The pole labels visually win the
        // overlap (later in DOM, same stacking level) so it's not a mis-tap-triggers-drag
        // bug, but it silently dead-zones the bottom of the touch-target expansion right
        // where a thumb reaches for the labels. mt-5 (20px) clears it with a 4px buffer.
        <div className={`relative h-4 select-none text-xs text-muted-foreground ${expandedHitArea ? 'mt-5' : 'mt-1.5'}`}>
          {poleLabels && (
            <>
              <span className="absolute left-0">{poleLabels.low}</span>
              <span className="absolute right-0">{poleLabels.high}</span>
            </>
          )}
          {midpointLabel && (
            <span className="absolute left-1/2 -translate-x-1/2">{midpointLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
