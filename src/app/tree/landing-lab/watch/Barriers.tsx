import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { FOUNDER } from "../content";
import { seeded } from "./hooks";

const HEAVY = FOUNDER.barriers.slice(0, -1);
const [LIGHT = ""] = FOUNDER.barriers.slice(-1);

const WORD_SIZE = "text-[clamp(2.1rem,10.5vw,5.6rem)]";

/** Scroll windows: the weights drop in, the last word comes apart, the close line arrives. */
const DROP_START = 0.2;
const DROP_STEP = 0.065;
const DISSOLVE: [number, number] = [0.6, 0.82];

function HeavyWord({
  p,
  word,
  index,
}: {
  p: MotionValue<number>;
  word: string;
  index: number;
}) {
  const from = DROP_START + index * DROP_STEP;
  const drop: [number, number] = [from, from + 0.06];
  const y = useTransform(p, drop, [-70, 0]);
  const opacity = useTransform(p, drop, [0, 1]);
  const floor = useTransform(p, [drop[1] - 0.01, drop[1] + 0.02], [0, 1]);
  return (
    <li>
      <span className="relative inline-block">
        <motion.span style={{ y, opacity }} className="block">
          {word}
        </motion.span>
        {/* The ground it lands on: one short centred rule, the same under every word. Decorative. */}
        <motion.span
          aria-hidden="true"
          style={{ scaleX: floor }}
          className="absolute bottom-[0.02em] left-[calc(50%-0.7em)] h-px w-[1.4em] bg-white/35"
        />
      </span>
    </li>
  );
}

function Letter({
  p,
  ch,
  i,
  count,
}: {
  p: MotionValue<number>;
  ch: string;
  i: number;
  count: number;
}) {
  const span = DISSOLVE[1] - DISSOLVE[0];
  const start = DISSOLVE[0] + (i / count) * span * 0.45;
  const end = start + span * 0.55;
  const dx = (seeded(i + 1) - 0.5) * 220;
  const dy = -60 - seeded(i + 11) * 170;
  const rot = (seeded(i + 21) - 0.5) * 120;
  const x = useTransform(p, [start, end], [0, dx]);
  const y = useTransform(p, [start, end], [0, dy]);
  const rotate = useTransform(p, [start, end], [0, rot]);
  const opacity = useTransform(p, [start, end], [1, 0]);
  const filter = useTransform(p, [start, end], ["blur(0px)", "blur(12px)"]);
  return (
    <motion.span
      aria-hidden="true"
      style={{ x, y, rotate, opacity, filter }}
      className="inline-block"
    >
      {ch}
    </motion.span>
  );
}

function LightWord({ p }: { p: MotionValue<number> }) {
  const from = DROP_START + HEAVY.length * DROP_STEP;
  const drop: [number, number] = [from, from + 0.06];
  // It does not drop like the heavy ones. It rises into its place, already lighter.
  const enterY = useTransform(p, drop, [18, 0]);
  const enterOpacity = useTransform(p, drop, [0, 1]);
  const ghost = useTransform(
    p,
    [DISSOLVE[1] - 0.06, DISSOLVE[1] + 0.02],
    [0, 1],
  );
  // The light reaches the far edge before the section lets go, so the slot ends full.
  const fill = useTransform(p, [0.84, 0.95], [0, 1]);
  const letters = [...LIGHT];
  return (
    <li>
      <span className="relative inline-block">
        {/* Where it was: a faint ghost of the word stays, and light fills it. Decorative. */}
        <motion.span
          aria-hidden="true"
          style={{ opacity: ghost }}
          className="pointer-events-none absolute inset-0"
        >
          <motion.span
            style={{ scaleX: fill }}
            className="absolute -inset-x-[0.15em] inset-y-[0.2em] origin-left rounded-full bg-white/[0.16] blur-md"
          />
          <span className="relative block font-medium text-white/[0.2]">
            {LIGHT}
          </span>
        </motion.span>
        <motion.span
          style={{ y: enterY, opacity: enterOpacity }}
          className="relative block font-medium text-neutral-300"
        >
          <span className="sr-only">{LIGHT}</span>
          {letters.map((ch, i) => (
            <Letter key={i} p={p} ch={ch} i={i} count={letters.length} />
          ))}
        </motion.span>
      </span>
    </li>
  );
}

/**
 * Beat 4. Four heavy words drop in and do not move again. The fifth one, ignorance,
 * comes apart letter by letter and leaves a slot that can be filled.
 */
function BarriersMotion() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const close = useTransform(p, [0.8, 0.9], [0, 1]);
  const closeY = useTransform(p, [0.8, 0.9], [16, 0]);

  return (
    // Overlaps the end of the screening, so the first words land as the poster leaves. Less from
    // lg up, where the poster fills the stage and the words would land on its button; a portrait
    // tablet's poster is short, and the smaller overlap left its middle third empty.
    <section ref={ref} className="relative -mt-[40svh] h-[145vh] lg:-mt-[8svh]">
      <div className="pointer-events-none sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden px-5">
        <ul
          className={`${WORD_SIZE} w-full max-w-4xl text-center font-black leading-[1.02] tracking-[-0.035em] text-neutral-100 [overflow-wrap:anywhere]`}
        >
          {HEAVY.map((w, i) => (
            <HeavyWord key={w} p={p} word={w} index={i} />
          ))}
          <LightWord p={p} />
        </ul>
        <motion.p
          style={{ opacity: close, y: closeY }}
          className="mt-8 max-w-xl text-center text-[clamp(1.05rem,2.3vw,1.4rem)] leading-relaxed text-neutral-300"
        >
          {FOUNDER.barriersClose}
        </motion.p>
      </div>
    </section>
  );
}

/** Beat 4 with motion off: the five words in order, the fifth set lighter, then the close. */
function BarriersStill() {
  return (
    <section className="flex flex-col items-center px-5 py-12">
      <ul
        className={`${WORD_SIZE} w-full max-w-4xl text-center font-black leading-[1.02] tracking-[-0.035em] text-neutral-100 [overflow-wrap:anywhere]`}
      >
        {HEAVY.map((w) => (
          <li key={w}>{w}</li>
        ))}
        <li className="font-medium text-neutral-400">{LIGHT}</li>
      </ul>
      <p className="mt-8 max-w-xl text-center text-[clamp(1.05rem,2.3vw,1.4rem)] leading-relaxed text-neutral-300">
        {FOUNDER.barriersClose}
      </p>
    </section>
  );
}

export function Barriers({ still }: { still: boolean }) {
  return still ? <BarriersStill /> : <BarriersMotion />;
}
