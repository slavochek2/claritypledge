import { forwardRef, useRef, type ReactNode, type RefObject } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from "@/app/components/shared/story-video-player";
import { Draft } from "../draft";
import { DRAFTS, MEDIA } from "../content";

/** Largest 16:9 frame that leaves room for the button under it. */
const FRAME_WIDTH = "min(100%, 1180px, calc((100svh - 220px) * 16 / 9))";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

interface ScreeningProps {
  still: boolean;
  started: boolean;
  onStart: () => void;
  playerRef: RefObject<StoryVideoPlayerHandle | null>;
}

/** The player plus the page's one primary action. */
function Screen({ started, onStart, playerRef }: Omit<ScreeningProps, "still">) {
  return (
    <>
      <div
        // A click on the poster itself starts playback inside the player. Note it here too.
        onClickCapture={onStart}
        // The player's own centred play disc sits on the founder's diagram and hides part of
        // it (the brain icon and the "Cognitive" label at phone widths). It is hidden on this
        // page only; the whole poster stays one button, and a small badge sits in its margin.
        className="relative [&_[data-testid='story-video-facade']>span]:hidden"
      >
        <StoryVideoPlayer
          ref={playerRef}
          videoUrl={MEDIA.st1VideoUrl}
          posterUrl={MEDIA.st1PosterUrl}
          className="!rounded-md ring-1 ring-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
        />
        {!started && (
          // In the poster's white side margin, clear of the diagram. Decorative: the poster
          // itself is the control and carries the label.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md ring-1 ring-white/70 sm:bottom-3 sm:left-3 sm:h-10 sm:w-10"
          >
            <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5 fill-current sm:h-4 sm:w-4">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
      </div>
      <div className="mt-6 flex h-12 justify-center">
        {!started && (
          <button
            type="button"
            onClick={() => {
              onStart();
              // Mounts the embed and plays from the start once it is ready.
              playerRef.current?.seekTo(0);
            }}
            className="inline-flex h-12 items-center gap-2.5 rounded-full bg-blue-600 px-7 text-base font-semibold text-white shadow-[0_10px_40px_-8px_rgba(37,99,235,0.8)] transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300/60"
          >
            <PlayIcon />
            <Draft>{DRAFTS.watchCta}</Draft>
          </button>
        )}
      </div>
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: FRAME_WIDTH }}>
      {children}
    </div>
  );
}

/**
 * Beat 3. The house lights go down and the poster grows until it fills the stage,
 * a lit screen in a dark room. Pressing play is the primary action of the page.
 */
const ScreeningMotion = forwardRef<HTMLElement, Omit<ScreeningProps, "still">>(function ScreeningMotion(
  props,
  sectionRef,
) {
  const inner = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: inner, offset: ["start end", "end end"] });
  const scale = useTransform(p, [0, 0.72], [0.38, 1]);
  const y = useTransform(p, [0, 0.72], [120, 0]);
  const glow = useTransform(p, [0.1, 0.7], [0, 1]);
  const vignette = useTransform(p, [0.2, 0.75], [0, 1]);

  return (
    // Overlaps the end of the three cards, so the poster is already rising as they leave.
    <section ref={sectionRef} id="watch" className="relative -mt-[45svh]">
      <div ref={inner} className="relative h-[125vh]">
        <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden px-4">
          {/* The projector's spill on the room. Decorative. */}
          <motion.div
            aria-hidden="true"
            style={{ opacity: glow }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_46%,rgba(226,232,240,0.22),transparent_72%)]"
          />
          <motion.div
            aria-hidden="true"
            style={{ opacity: vignette }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_55%,rgba(0,0,0,0.85))]"
          />
          <motion.div
            style={{ scale: props.started ? 1 : scale, y: props.started ? 0 : y }}
            className="relative w-full origin-center"
          >
            <Frame>
              <Screen {...props} />
            </Frame>
          </motion.div>
        </div>
      </div>
    </section>
  );
});

export const Screening = forwardRef<HTMLElement, ScreeningProps>(function Screening({ still, ...props }, ref) {
  if (!still) return <ScreeningMotion ref={ref} {...props} />;
  return (
    <section ref={ref} id="watch" className="px-4 py-10">
      <Frame>
        <Screen {...props} />
      </Frame>
    </section>
  );
});
