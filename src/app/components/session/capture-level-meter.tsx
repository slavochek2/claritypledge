/**
 * @file capture-level-meter.tsx
 * @description P1388: the live input level for the person recording. Every failure this spec
 * names (iOS lock, a muted track, an unplugged mic) records SILENCE rather than raising an
 * error, so a meter that moves with speech is the only way to see that words are being caught.
 *
 * Reads the level through subscribeLevel and writes the bar widths straight to the DOM, once
 * per animation frame: the worklet posts levels many times a second, and routing them through
 * React state would re-render the whole capture tree at that rate.
 */
import { useEffect, useRef } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';

const BARS = 5;
/** Speech on a phone mic sits around RMS 0.02–0.2; a log scale spreads that over the bars. */
function levelToBars(rms: number): number {
  if (rms <= 0.002) return 0;
  const db = 20 * Math.log10(rms); // ≈ -54 .. 0
  return Math.max(0, Math.min(BARS, Math.round(((db + 54) / 40) * BARS)));
}

export function CaptureLevelMeter({ active }: { active: boolean }) {
  const { subscribeLevel } = useRoomCapture();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    let peak = 0;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const lit = levelToBars(peak);
      peak *= 0.6; // decay, so the meter falls back to flat in silence
      node.querySelectorAll('i').forEach((bar, i) => {
        bar.dataset.lit = i < lit ? 'true' : 'false';
      });
      node.dataset.level = String(lit);
    };
    const unsubscribe = subscribeLevel((rms) => {
      peak = Math.max(peak, rms);
      if (!frame) frame = requestAnimationFrame(paint);
    });
    // When levels stop arriving altogether (iOS suspends the audio graph on screen lock), keep
    // decaying, so the meter goes flat instead of freezing on the last word.
    const decay = setInterval(() => { if (!frame) paint(); }, 250);
    return () => {
      unsubscribe();
      clearInterval(decay);
      if (frame) cancelAnimationFrame(frame);
      // Paused or stopped: show flat, never the last level frozen in place.
      node.querySelectorAll('i').forEach((bar) => { bar.dataset.lit = 'false'; });
      node.dataset.level = '0';
    };
  }, [active, subscribeLevel]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="capture-level-meter"
      data-level="0"
      className="inline-flex items-end gap-[2px] h-3.5"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <i
          key={i}
          data-lit="false"
          style={{ height: `${40 + i * 15}%` }}
          className="block w-[3px] rounded-sm bg-blue-200 data-[lit=true]:bg-blue-600 transition-colors duration-75"
        />
      ))}
    </span>
  );
}
