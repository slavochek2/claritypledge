/**
 * @file VoiceWaveform.tsx
 * @description P1576 Part B: the bars of a voice note, which are also its progress and its seek control. Bars up to the
 * playhead are filled, the rest muted. A tap or drag on them moves the playhead (pointer events, so touch works too);
 * ←/→ move it 5 s. The bars themselves are decoration: the slider role carries the meaning.
 */
import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './chat-kit';
import { formatClock, formatDuration } from './voice-view';
import { barHeightPx, barLevels, filledBars, keySeekMs, seekTimeMs } from './voice-waveform';

interface Props {
  waveform: number[] | null;
  durationMs: number;
  positionMs: number;
  /** Moves the playhead to this time. */
  onSeek: (ms: number) => void;
}

export function VoiceWaveform({ waveform, durationMs, positionMs, onSeek }: Props) {
  const heights = useMemo(() => barLevels(waveform).map(barHeightPx), [waveform]);
  const filled = filledBars(positionMs, durationMs, heights.length);
  const dragging = useRef(false);

  const seekAt = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(seekTimeMs(e.clientX, rect.left, rect.width, durationMs));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keySeekMs(e.key, positionMs, durationMs);
    if (next === null) return;
    e.preventDefault();
    onSeek(next);
  };
  const position = Math.min(Math.max(0, positionMs), durationMs);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek voice message"
      aria-valuemin={0}
      aria-valuemax={Math.ceil(durationMs / 1000)}
      aria-valuenow={Math.floor(position / 1000)}
      aria-valuetext={`${formatClock(position)} of ${formatDuration(durationMs)}`}
      data-testid="voice-waveform"
      className={cn('flex h-8 w-full min-w-0 cursor-pointer touch-pan-y items-center gap-px rounded-sm', FOCUS_RING)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        seekAt(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {heights.map((h, i) => (
        <span key={i} aria-hidden="true" data-testid="voice-wave-bar" data-filled={i < filled ? 'true' : 'false'} className={cn('min-w-px flex-1 rounded-full', i < filled ? 'bg-blue-600' : 'bg-gray-300')} style={{ height: h }} />
      ))}
    </div>
  );
}
