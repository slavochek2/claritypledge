import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { DO_ARIA } from "./copy";

/* ── Tone ─────────────────────────────────────────────────────────────────────────
 * "strong" is the saturated circle, used while the circle IS the primary action.
 * "soft" is a pale circle that still flashes blue on every knock, used whenever a
 * different control is the primary one, so the screen never shows two blue primaries. */
export type PadTone = "strong" | "soft";
const TONE = {
  strong: { base: "#2563eb", flash: "#1d4ed8", ring: "rgba(255,255,255,0.75)", shadow: "0 18px 50px -12px rgba(37,99,235,0.55)" },
  soft: { base: "#dbeafe", flash: "#2563eb", ring: "rgba(29,78,216,0.55)", shadow: "0 0 0 0 rgba(0,0,0,0)" },
} as const;

/* ── Ripples ──────────────────────────────────────────────────────────────────────
 * One ring per knock, growing from the centre to the circle's edge and no further,
 * so it never runs behind the headline or off a narrow screen. Under reduced motion
 * MotionConfig drops the scale, leaving a brief ring flash. */
function Ripples({ count, tone }: { count: number; tone: PadTone }) {
  // Only the last few knocks keep a ring node, so a fast drummer never piles up
  // hundreds of them. Each ring animates once on mount and rests invisible.
  const ids: number[] = [];
  for (let id = Math.max(1, count - 5); id <= count; id++) ids.push(id);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      {ids.map((id) => (
        <motion.span
          key={id}
          className="absolute inset-0 rounded-full border-[3px]"
          style={{ borderColor: TONE[tone].ring }}
          initial={{ scale: 0.25, opacity: 0.9 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

/* ── Disc ─────────────────────────────────────────────────────────────────────────
 * The big circle. Remounted per knock so it bumps and flashes each time. */
function Disc({ count, tone, children }: { count: number; tone: PadTone; children?: ReactNode }) {
  const t = TONE[tone];
  return (
    <motion.span
      key={count}
      aria-hidden="true"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-full text-white"
      initial={count > 0 ? { scale: 0.94, backgroundColor: t.flash } : false}
      animate={{ scale: 1, backgroundColor: t.base, boxShadow: t.shadow }}
      transition={{ scale: { type: "spring", stiffness: 600, damping: 18 }, backgroundColor: { duration: 0.35 }, boxShadow: { duration: 0.35 } }}
    >
      {children}
    </motion.span>
  );
}

const PAD_SIZE = "h-[min(64vw,17rem)] w-[min(64vw,17rem)]";
const PAD_FOCUS =
  "outline-none focus-visible:ring-4 focus-visible:ring-blue-300 focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-100";

export function TapPad({
  count,
  tone,
  onTap,
  children,
}: {
  count: number;
  tone: PadTone;
  onTap: () => void;
  children?: ReactNode;
}) {
  const handlePointer = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    onTap();
  };
  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    // A held key is one knock, not a drum roll.
    if (e.repeat) return;
    onTap();
  };
  return (
    <button
      type="button"
      aria-label={DO_ARIA.pad}
      onPointerDown={handlePointer}
      onKeyDown={handleKey}
      className={`relative ${PAD_SIZE} shrink-0 touch-manipulation select-none rounded-full ${PAD_FOCUS}`}
    >
      <Disc count={count} tone={tone}>
        {children}
      </Disc>
      <Ripples count={count} tone={tone} />
    </button>
  );
}

/**
 * The listener's circle. With `onPlay` it is a real button that plays the taps (its
 * visible children, or `ariaLabel` when it has none, name it). Without, while the taps
 * are playing, it is a picture of them.
 */
export function ListenPad({
  count,
  tone,
  onPlay,
  ariaLabel,
  children,
}: {
  count: number;
  tone: PadTone;
  onPlay?: () => void;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <Disc count={count} tone={tone}>
        {children}
      </Disc>
      <Ripples count={count} tone={tone} />
    </>
  );
  if (!onPlay) {
    return (
      <div role="img" aria-label={DO_ARIA.padListening} className={`relative ${PAD_SIZE} shrink-0`}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={ariaLabel}
      className={`relative ${PAD_SIZE} shrink-0 touch-manipulation select-none rounded-full ${PAD_FOCUS}`}
    >
      {inner}
    </button>
  );
}

/* ── Rhythm strip ─────────────────────────────────────────────────────────────────
 * The knocks as a listener meets them: marks on a line, no melody. `lit` marks are
 * ink, the rest are faint (used while replaying). The stroke thins with the real
 * on-screen spacing between marks, so 64 fast taps stay 64 marks, not one bar. */
export function RhythmStrip({ intervals, lit }: { intervals: number[]; lit: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [widthPx, setWidthPx] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidthPx(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const times = [0];
  for (const gap of intervals) times.push((times[times.length - 1] ?? 0) + gap);
  const total = times[times.length - 1] ?? 0;
  const W = 1000;
  const PAD = 12;
  const x = (t: number) => (total > 0 ? PAD + (t / total) * (W - 2 * PAD) : W / 2);

  // Typical gap between neighbouring marks, in screen pixels. The median, so one
  // deliberate double-tap does not thin every mark on the strip.
  const gapsPx = intervals.map((g) => (total > 0 ? (g / total) * ((W - 2 * PAD) / W) * widthPx : widthPx)).sort((a, b) => a - b);
  const medianGap = gapsPx[Math.floor(gapsPx.length / 2)] ?? widthPx;
  const stroke = Math.max(1.5, Math.min(4, medianGap * 0.45));

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} 48`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${DO_ARIA.rhythm}: ${times.length}`}
      className="h-12 w-full"
    >
      <line x1={0} x2={W} y1={24} y2={24} stroke="#d4d4d4" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {times.map((t, i) => (
        <motion.line
          key={i}
          x1={x(t)}
          x2={x(t)}
          y1={6}
          y2={42}
          strokeWidth={stroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ stroke: i < lit ? "#171717" : "#c7c7c7" }}
          transition={{ duration: 0.12 }}
        />
      ))}
    </svg>
  );
}

/* ── Dot field ────────────────────────────────────────────────────────────────────
 * 100 listeners. In "guess" the visitor's number is lit in blue. In "study" the field
 * collapses to what Newton's study found: 2.5 in 100, drawn as two dots and a half. */
export const STUDY_PERCENT = 2.5;

export function DotField({ lit, phase }: { lit: number; phase: "guess" | "study" }) {
  return (
    <div aria-hidden="true" className="mx-auto grid w-full max-w-[18rem] grid-cols-10 gap-[5px] sm:max-w-[20rem] sm:gap-1.5">
      {Array.from({ length: 100 }, (_, i) => {
        const guessed = i < lit;
        const studyFull = phase === "study" && i < Math.floor(STUDY_PERCENT);
        const studyHalf = phase === "study" && i === Math.floor(STUDY_PERCENT);
        const color = studyFull ? "#171717" : phase === "guess" && guessed ? "#2563eb" : "#e5e5e5";
        // Dropping dots drain from the last guessed back towards the survivors.
        const delay = phase === "study" && guessed ? Math.min(1.1, (lit - i) * 0.012) : 0;
        return (
          <motion.span
            key={i}
            className="relative aspect-square overflow-hidden rounded-full"
            initial={false}
            animate={{
              backgroundColor: color,
              // Everyone who did not name it shrinks to a speck; the 2.5 stay full size.
              scale: phase === "study" && !studyFull && !studyHalf ? 0.42 : 1,
            }}
            transition={{ duration: phase === "study" ? 0.35 : 0.12, delay }}
          >
            {studyHalf && (
              <motion.span
                className="absolute inset-y-0 left-0 w-1/2 bg-neutral-900"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay }}
              />
            )}
          </motion.span>
        );
      })}
    </div>
  );
}

/* ── Sound toggle ─────────────────────────────────────────────────────────────── */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? DO_ARIA.soundOn : DO_ARIA.soundOff}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white/80 text-neutral-700 backdrop-blur transition hover:border-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
    >
      {muted ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────────────── */
export const PRIMARY_BTN =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-7 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300";
export const QUIET_BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-neutral-600 underline-offset-4 transition hover:text-neutral-900 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300";
export const OUTLINE_BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-blue-600 px-6 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300";
