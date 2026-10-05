import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { FOUNDER } from "../content";

/** The st1 opening paragraph, cut into its own sentences. Text is unchanged. */
const SENTENCES: string[] = FOUNDER.st1[0]
  .match(/[^.!?]+[.!?]+/g)
  ?.map((s) => s.trim()) ?? [FOUNDER.st1[0]];
const LAST = SENTENCES.length - 1;
/** Seconds between title cards. */
const BEAT = 1.7;
/** Opacity of the sentences already read. Measured 5.8:1 on the stage; 0.38 measured 3.25:1. */
const DIM = 0.55;

/** The last sentence with its key word lit. The characters are the founder's, only wrapped. */
function LitLast({ text, lit }: { text: string; lit: boolean }) {
  const at = text.lastIndexOf("understand");
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span
        className={`transition-[text-shadow,color] duration-[1600ms] ${
          lit ? "text-white [text-shadow:0_0_28px_rgba(255,255,255,0.55)]" : ""
        }`}
      >
        understand
      </span>
      {text.slice(at + "understand".length)}
    </>
  );
}

/**
 * Beat 1. The paragraph arrives like film titles, one sentence at a time, the newest
 * one bright and the earlier ones settling back. With reduced motion it is all there at once.
 */
export function Opening({ still }: { still: boolean }) {
  const [timed, setTimed] = useState(0);
  const shown = still ? SENTENCES.length : timed;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const fade = useTransform(scrollYProgress, [0.15, 0.75], [1, still ? 1 : 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, still ? 0 : -80]);
  // The cue only matters before the first scroll; after that the next sentence takes its place.
  const cueFade = useTransform(scrollYProgress, [0, 0.05], [1, still ? 1 : 0]);

  useEffect(() => {
    if (still) return;
    const timers = SENTENCES.map((_, i) =>
      window.setTimeout(() => setTimed(i + 1), 500 + i * BEAT * 1000),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [still]);

  const done = shown >= SENTENCES.length;

  return (
    <section
      ref={ref}
      // With motion off there is no scroll runway to fill: the section sizes to its words, so
      // the page never shows a screen of empty stage between one block and the next.
      className={
        still
          ? "relative px-5 pb-10 pt-[20svh] sm:px-10 sm:pt-[18svh]"
          : "relative flex min-h-[100svh] items-start px-5 pt-[20svh] sm:items-center sm:px-10 sm:pt-0"
      }
    >
      <motion.div
        style={{ opacity: fade, y: lift }}
        className="mx-auto w-full max-w-5xl"
      >
        <h1 className="text-[clamp(1.55rem,5.4vw,4.1rem)] font-semibold leading-[1.12] tracking-[-0.02em]">
          {SENTENCES.map((s, i) => {
            const visible = i < shown;
            const newest = i === shown - 1;
            return (
              <motion.span
                key={s}
                className="block pb-[0.18em]"
                initial={false}
                animate={
                  still
                    ? {
                        opacity: i === LAST ? 1 : 0.6,
                        y: 0,
                        filter: "blur(0px)",
                      }
                    : {
                        opacity: !visible
                          ? 0
                          : newest || i === LAST
                            ? 1
                            : // Dimmed, never below 4.5:1 on the stage (0.55 measures 5.8:1).
                              DIM,
                        y: visible ? 0 : 18,
                        filter: visible ? "blur(0px)" : "blur(10px)",
                      }
                }
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              >
                {i === LAST ? <LitLast text={s} lit={done} /> : s}{" "}
              </motion.span>
            );
          })}
        </h1>
      </motion.div>

      {/* Scroll cue: a falling light on a thin rule. Decorative only, and only with motion. */}
      {!still && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: cueFade }}
          className="pointer-events-none absolute bottom-7 left-0 right-0 flex justify-center"
        >
          <motion.div
            className="relative h-14 w-px overflow-hidden bg-white/15"
            initial={false}
            animate={{ opacity: done ? 1 : 0 }}
            transition={{ duration: 1 }}
          >
            {!still && (
              <motion.span
                className="absolute left-0 top-0 h-5 w-px bg-white"
                animate={{ y: [-20, 56] }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
