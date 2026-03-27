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
}

export function SliderTrack({
  value,
  onChange,
  onDebouncedChange,
  readonly = false,
  debounceMs = 300,
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

  return (
    <div className="w-full">
      <div className="flex justify-end mb-1">
        <span className="text-xl font-light tabular-nums text-gray-900">{value}/10</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-label="Understanding rating"
        tabIndex={readonly ? -1 : 0}
        className={`relative w-full h-2.5 rounded-full ${
          readonly ? 'opacity-75' : 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
        }`}
        style={{ background: '#eff6ff', touchAction: 'none' }}
      >
        {/* Fill bar */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-150"
          style={{ width: `${pct}%`, background: '#3b82f6' }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-blue-500 shadow-md ring-4 ring-white transition-all duration-150"
          style={{ left: `calc(${pct}% - 14px)` }}
        />
      </div>
    </div>
  );
}
