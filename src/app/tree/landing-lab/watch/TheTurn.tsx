import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { FOUNDER } from "../content";
import type { Viewport } from "./hooks";

/** The three meanings, split at the first colon so the label can sit on its own line. */
const MEANINGS = [FOUNDER.st1[2], FOUNDER.st1[3], FOUNDER.st1[4]].map((line) => {
  const cut = line.indexOf(":");
  return { label: line.slice(0, cut + 1), rest: line.slice(cut + 1).trimStart() };
});

const WORD = "understand";

/**
 * Scroll progress keyframes: together, pulled apart in depth, fanned out and readable.
 * Progress starts while the section is still rising into view (see TurnMotion), so the
 * word is already on screen as the opening fades, and the stage pins at about 0.42.
 */
const K: [number, number, number] = [0.36, 0.62, 0.86];

interface Pose {
  x: number[];
  y: number[];
  z: number[];
  rotateY: number[];
  rotateX: number[];
  blur: number[];
}

/**
 * Depth, rotation and blur live only in the middle of the move. Every pose ENDS flat, on
 * whole pixels, with no filter: a settled card must be rasterised as plain 2D text, or it
 * stays soft (blind review: the settled cards read blurry while they still carried z and
 * rotateY).
 */
function poses(vp: Viewport): Pose[] {
  if (vp.w < 768) {
    const spread = Math.round(Math.min(vp.h * 0.27, 230));
    return [
      { x: [0, -10, 0], y: [0, -34, -spread], z: [0, -420, 0], rotateY: [0, 0, 0], rotateX: [0, 12, 0], blur: [0, 3, 0] },
      { x: [0, 0, 0], y: [0, 0, 0], z: [0, -140, 0], rotateY: [0, 0, 0], rotateX: [0, 0, 0], blur: [0, 1, 0] },
      { x: [0, 10, 0], y: [0, 34, spread], z: [0, 80, 0], rotateY: [0, 0, 0], rotateX: [0, -12, 0], blur: [0, 0, 0] },
    ];
  }
  const spread = Math.round(Math.min(vp.w * 0.3, 410));
  return [
    { x: [0, -70, -spread], y: [0, -20, 24], z: [0, -560, 0], rotateY: [0, 28, 0], rotateX: [0, 0, 0], blur: [0, 4, 0] },
    { x: [0, 0, 0], y: [0, 0, 24], z: [0, -170, 0], rotateY: [0, 0, 0], rotateX: [0, 0, 0], blur: [0, 1.5, 0] },
    { x: [0, 70, spread], y: [0, 20, 24], z: [0, 220, 0], rotateY: [0, -28, 0], rotateX: [0, 0, 0], blur: [0, 0, 0] },
  ];
}

function Plane({
  p,
  pose,
  index,
  meaning: m,
  startScale,
  narrow,
}: {
  p: MotionValue<number>;
  pose: Pose;
  index: number;
  meaning: (typeof MEANINGS)[number];
  startScale: number;
  narrow: boolean;
}) {
  const x = useTransform(p, K, pose.x);
  const y = useTransform(p, K, pose.y);
  const z = useTransform(p, K, pose.z);
  const rotateY = useTransform(p, K, pose.rotateY);
  const rotateX = useTransform(p, K, pose.rotateX);
  const blur = useTransform(p, K, pose.blur);
  // "none", not blur(0px): even a zero blur keeps the card on a filter layer.
  const filter = useTransform(blur, (b) => (b < 0.05 ? "none" : `blur(${b.toFixed(2)}px)`));
  // The middle copy is the word you already read. The other two surface out of it.
  const opacity = useTransform(p, [0.3, 0.4], index === 1 ? [1, 1] : [0, 1]);
  const wordScale = useTransform(p, [K[0], K[2]], [startScale, 1]);
  const caption = useTransform(p, [0.8, 0.93], [0, 1]);
  const frame = useTransform(p, [0.72, 0.9], [0, 1]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ x, y, z, rotateY, rotateX, opacity, filter, transformStyle: "preserve-3d" }}
    >
      <div className={`pointer-events-auto ${narrow ? "w-[min(86vw,360px)]" : "w-[min(27vw,340px)]"}`}>
        <div className="relative px-5 pb-5 pt-4">
          <motion.div
            aria-hidden="true"
            style={{ opacity: frame }}
            className="absolute inset-0 rounded-2xl border border-white/15 bg-gradient-to-b from-white/[0.07] to-white/[0.015] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
          />
          <motion.p
            aria-hidden="true"
            style={{ scale: wordScale }}
            className={`relative text-center font-semibold tracking-[-0.03em] text-white ${
              narrow ? "text-[clamp(1.6rem,8.5vw,2.1rem)]" : "text-[clamp(1.8rem,3.4vw,3rem)]"
            }`}
          >
            {WORD}
          </motion.p>
          <motion.p
            style={{ opacity: caption }}
            className={`relative mt-2 text-center leading-snug text-neutral-300 ${narrow ? "text-[0.9rem]" : "text-[0.95rem]"}`}
          >
            <span className="block font-semibold text-white">{m.label}</span> {m.rest}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Beat 2. "understand" splits into its three meanings as three planes that come apart
 * in real 3D depth, driven by scroll. The sentence that sets it up sits above.
 */
function TurnMotion({ vp }: { vp: Viewport }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 0.5", "end end"] });
  const narrow = vp.w < 768;
  // The set-up sentence has its own entrance, tied to where the section sits on screen: it
  // is dark while the section only overlaps the opening, and fully lit by the time it
  // reaches the middle of the screen.
  // Phones overlap the opening more, because there the story sits high on the first screen.
  const { scrollYProgress: entry } = useScroll({
    target: ref,
    offset: narrow ? ["start 0.62", "start 0.42"] : ["start 0.8", "start 0.55"],
  });
  const bridgeIn = useTransform(entry, [0, 1], [0, 1]);
  const bridgeOut = useTransform(p, narrow ? [0.55, 0.66] : [0, 1], narrow ? [1, 0] : [1, 1]);
  const bridgeOpacity = useTransform([bridgeIn, bridgeOut], ([a, b]: number[]) => (a ?? 0) * (b ?? 0));
  const bridgeY = useTransform(p, [0.1, 0.5], [20, 0]);
  const all = poses(vp);

  return (
    <section ref={ref} className="relative -mt-[38svh] h-[170vh] md:-mt-[12svh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <motion.p
          style={{ opacity: bridgeOpacity, y: bridgeY }}
          className="absolute inset-x-0 top-[9svh] mx-auto max-w-2xl px-5 text-center text-[clamp(1rem,2.2vw,1.35rem)] leading-relaxed text-neutral-300"
        >
          {FOUNDER.st1[1]}
        </motion.p>
        <div className="absolute inset-0 [perspective:1100px] [perspective-origin:50%_45%]">
          <div className="absolute inset-0 [transform-style:preserve-3d]">
            {all.map((pose, i) => {
              const meaning = MEANINGS[i];
              if (!meaning) return null;
              return (
                <Plane
                  key={meaning.label}
                  p={p}
                  pose={pose}
                  index={i}
                  meaning={meaning}
                  startScale={narrow ? 1.75 : 2.5}
                  narrow={narrow}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Beat 2 with motion off: the same words, laid out flat and in order. */
function TurnStill() {
  return (
    <section className="px-5 py-10 sm:px-10">
      <p className="mx-auto max-w-2xl text-center text-[clamp(1rem,2.2vw,1.35rem)] leading-relaxed text-neutral-300">
        {FOUNDER.st1[1]}
      </p>
      <ul className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {MEANINGS.map((m) => (
          <li key={m.label} className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-5 text-center">
            <p aria-hidden="true" className="text-3xl font-semibold tracking-[-0.03em] text-white">
              {WORD}
            </p>
            <p className="mt-2 leading-snug text-neutral-300">
              <span className="block font-semibold text-white">{m.label}</span> {m.rest}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TheTurn({ still, vp }: { still: boolean; vp: Viewport }) {
  if (still) return <TurnStill />;
  // Remount on a size bucket change so every pose is recomputed for the new viewport.
  return <TurnMotion key={`${Math.round(vp.w / 40)}-${Math.round(vp.h / 40)}`} vp={vp} />;
}
