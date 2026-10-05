import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import type { StoryVideoPlayerHandle } from "@/app/components/shared/story-video-player";
import { Draft } from "../draft";
import { DRAFTS } from "../content";
import { usePrefersStill, useViewport } from "./hooks";
import { Opening } from "./Opening";
import { TheTurn } from "./TheTurn";
import { Screening } from "./Screening";
import { Barriers } from "./Barriers";
import { Credits } from "./Credits";

/** Film grain, drawn once as an SVG noise tile. Decorative. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Landing lab: "Watch". A dark cinematic stage in five beats. The visitor watches
 * first: a short story arrives as titles, the word it turns on splits in depth, the
 * film itself, the five barriers, and the person behind it.
 */
export function LandingWatch() {
  const still = usePrefersStill();
  const vp = useViewport();
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const watchRef = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(false);
  const [beforeFilm, setBeforeFilm] = useState(true);

  // The stage is dark to its edges, and it has no scrollbar gutter: the progress line along
  // the top is this page's position indicator, and it runs edge to edge. Scrolling by wheel,
  // touch and keyboard is unchanged. Everything is restored on leave.
  useEffect(() => {
    const root = document.documentElement;
    const before = {
      scheme: root.style.colorScheme,
      bg: root.style.backgroundColor,
      scrollbar: root.style.scrollbarWidth,
    };
    root.style.colorScheme = "dark";
    root.style.backgroundColor = "#050506";
    root.style.scrollbarWidth = "none";
    return () => {
      root.style.colorScheme = before.scheme;
      root.style.backgroundColor = before.bg;
      root.style.scrollbarWidth = before.scrollbar;
    };
  }, []);

  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => {
    const top = watchRef.current?.offsetTop ?? Infinity;
    setBeforeFilm(v < top - window.innerHeight * 0.6);
  });

  const jumpToFilm = () => {
    const top = watchRef.current?.offsetTop ?? 0;
    // Lands inside the screen's pinned hold, where the poster is already full size.
    window.scrollTo({ top: top + (still ? 0 : window.innerHeight * 0.12), behavior: still ? "auto" : "smooth" });
    setStarted(true);
    playerRef.current?.seekTo(0);
  };

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#050506] font-sans text-neutral-100 antialiased selection:bg-white/20">
      {/* Film progress along the top edge. Decorative. */}
      <motion.div
        aria-hidden="true"
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-0 z-40 h-[2px] origin-left bg-white/50"
      />
      {/* Grain over everything, never in the way. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 opacity-[0.07] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />

      <AnimatePresence>
        {beforeFilm && !started && (
          // A band of stage colour behind the pill, so text scrolling up fades out under it
          // instead of running through it. Decorative.
          <motion.div
            key="scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: still ? 0 : 2.2, duration: 0.8 } }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="pointer-events-none fixed inset-x-0 top-0 z-30 h-[76px] bg-[linear-gradient(to_bottom,#050506_0%,#050506_62%,rgba(5,5,6,0)_100%)] sm:h-[92px]"
          />
        )}
        {beforeFilm && !started && (
          <motion.button
            key="pill"
            type="button"
            onClick={jumpToFilm}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: still ? 0 : 2.2, duration: 0.8 } }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
            className="fixed right-3 top-3 z-40 inline-flex h-10 items-center gap-2 rounded-full border border-white/25 bg-neutral-900 px-4 text-sm font-medium text-white shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-colors hover:border-white/45 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:right-5 sm:top-5"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
            <Draft>{DRAFTS.watchCta}</Draft>
          </motion.button>
        )}
      </AnimatePresence>

      <Opening still={still} />
      <TheTurn still={still} vp={vp} />
      <Screening
        ref={watchRef}
        still={still}
        started={started}
        onStart={() => setStarted(true)}
        playerRef={playerRef}
      />
      <Barriers still={still} />
      <Credits still={still} />
    </main>
  );
}
