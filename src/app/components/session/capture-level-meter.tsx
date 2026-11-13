/**
 * @file capture-level-meter.tsx
 * @description P1388: the live input level for the person recording. Every failure this spec
 * names (iOS lock, a muted track, an unplugged mic) records SILENCE rather than raising an
 * error, so a meter that moves with speech is the only way to see that words are being caught.
 *
 * Reads the level through subscribeLevel and writes the bar heights straight to the DOM, once
 * per animation frame: the worklet posts levels many times a second, and routing them through
 * React state would re-render the whole capture tree at that rate.
 */
import { useEffect, useRef } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { cn } from '@/lib/utils';
import { LEVEL_BAR_CLASS, levelBarHeight } from '@/lib/audio/level-bar';

/** Steps of `data-level` (0 = flat), kept so a test or a probe can read "the voice is moving it" without measuring pixels. */
const STEPS = 5;
/** The waveform's width in bars: the newest bar enters on the right and the row scrolls left, like the dictation bar's. */
const BARS = 14;
/** Speech on a phone mic sits around RMS 0.02–0.2; a log scale spreads that over 0..1. */
function levelToUnit(rms: number): number {
  if (rms <= 0.002) return 0;
  const db = 20 * Math.log10(rms); // ≈ -54 .. 0
  return Math.max(0, Math.min(1, (db + 54) / 40));
}
const FLAT = Array.from({ length: BARS }, () => 0);
const heightPct = levelBarHeight;
/** On a phone the bar's row is tight (320 px): only the newest bars show, as in the dictation bar. */
const COMPACT_BARS = 8;

/** The waveform (the same look as the chat dictation bar's level bars), moving with the voice. */
export function CaptureLevelMeter({ active }: { active: boolean }) {
  const { subscribeLevel } = useRoomCapture();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const bars = Array.from(node.querySelectorAll('i'));
    let peak = 0;
    let frame = 0;
    let history = FLAT;
    const draw = () => {
      bars.forEach((bar, i) => { bar.style.height = heightPct(history[i] ?? 0); });
      node.dataset.level = String(Math.round((history[BARS - 1] ?? 0) * STEPS));
    };
    const push = () => {
      frame = 0;
      history = [...history.slice(1), levelToUnit(peak)];
      peak *= 0.6; // decay, so the row falls back to flat in silence
      draw();
    };
    const unsubscribe = subscribeLevel((rms) => {
      peak = Math.max(peak, rms);
      if (!frame) frame = requestAnimationFrame(push);
    });
    // When levels stop arriving altogether (iOS suspends the audio graph on screen lock), keep
    // scrolling, so the row goes flat instead of freezing on the last word.
    const decay = setInterval(() => { if (!frame) push(); }, 250);
    return () => {
      unsubscribe();
      clearInterval(decay);
      if (frame) cancelAnimationFrame(frame);
      // Paused or stopped: show flat, never the last level frozen in place.
      history = FLAT;
      draw();
    };
  }, [active, subscribeLevel]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="capture-level-meter"
      data-level="0"
      className="inline-flex h-6 shrink-0 items-center gap-[3px]"
    >
      {FLAT.map((_, i) => (
        <i key={i} style={{ height: heightPct(0) }} className={cn('block', LEVEL_BAR_CLASS, i < BARS - COMPACT_BARS && 'max-sm:hidden')} />
      ))}
    </span>
  );
}
