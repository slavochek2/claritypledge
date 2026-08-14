/**
 * @file slider-track.tsx
 * @description P562: Production slider component for free mode.
 * Custom pointer-event-based slider (0-10) with large touch target,
 * debounced live_state writes, and keyboard accessibility.
 */
import { useCallback, useRef, useEffect } from 'react';

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
  muted = false,
  bipolarFill = false,
  expandedHitArea = false,
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

  return (
    <div className="w-full">
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
        tabIndex={readonly ? -1 : 0}
        className={`relative w-full ${expandedHitArea ? '-my-4 py-4' : ''} ${
          readonly
            ? ''
            : `cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full`
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
      {midpointLabel && (
        <div className="relative mt-1.5 h-4">
          <span className="absolute left-1/2 -translate-x-1/2 select-none text-xs text-muted-foreground">
            {midpointLabel}
          </span>
        </div>
      )}
    </div>
  );
}
