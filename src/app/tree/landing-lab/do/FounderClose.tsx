import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Play } from "lucide-react";
import { StoryVideoPlayer, type StoryVideoPlayerHandle } from "@/app/components/shared/story-video-player";
import { Draft } from "../draft";
import { DRAFTS, FOUNDER, LINKS, MEDIA } from "../content";
import { DO_ARIA } from "./copy";
import { PRIMARY_BTN } from "./parts";

/** The bridge from the toy to the person: the hidden number, then who is behind the page. */
export function FounderClose() {
  const [watching, setWatching] = useState(false);
  const playerRef = useRef<StoryVideoPlayerHandle>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // One click on "watch" should mean playback, not a second play button to find.
  useEffect(() => {
    if (!watching) return;
    playerRef.current?.seekTo(0);
    frameRef.current?.focus();
  }, [watching]);

  // Same surface as the toy above. The app reserves a scrollbar gutter that always
  // shows the root background (set to this grey by LandingDo), so a white section
  // here would meet a grey strip at the window's right edge.
  return (
    <section className="border-t border-neutral-200 bg-neutral-100 px-4 py-20 sm:py-28">
      {/* One axis for the whole page: centred, like the toy above it. */}
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* Never fully invisible: it starts readable and the reveal only finishes it, so a
            full-page capture or a slow scroll never shows an empty band. No reveal at all
            under reduced motion. */}
        <motion.p
          className="text-balance text-[1.6rem] font-semibold leading-snug tracking-tight text-neutral-900 sm:text-4xl"
          initial={reduce ? false : { opacity: 0.45, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          {FOUNDER.hiddenNumber}
        </motion.p>

        <div className="mt-14 flex flex-col items-center gap-5">
          <img
            src={MEDIA.founderPhoto}
            alt={DO_ARIA.founderPhotoAlt}
            width={96}
            height={96}
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white"
          />
          <div>
            <p className="text-lg leading-relaxed text-neutral-900">
              <Draft>{DRAFTS.founderLine}</Draft>
            </p>
            <p className="mt-2 leading-relaxed text-neutral-600">{FOUNDER.activism}</p>
          </div>
        </div>

        <div className="mt-10 flex w-full justify-center">
          {watching ? (
            <div ref={frameRef} tabIndex={-1} className="w-full outline-none">
              <StoryVideoPlayer ref={playerRef} videoUrl={MEDIA.st1VideoUrl} posterUrl={MEDIA.st1PosterUrl} />
            </div>
          ) : (
            <button type="button" onClick={() => setWatching(true)} className={PRIMARY_BTN}>
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <Draft>{DRAFTS.watchCta}</Draft>
            </button>
          )}
        </div>

        <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          <Link
            to={LINKS.events}
            className="inline-flex min-h-11 items-center font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <Draft>{DRAFTS.eventCta}</Draft>
          </Link>
          <Link
            to={LINKS.community}
            className="inline-flex min-h-11 items-center font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <Draft>{DRAFTS.communityCta}</Draft>
          </Link>
        </nav>
        <div className="mt-6">
          <Link
            to={LINKS.teams}
            className="inline-flex min-h-11 items-center text-sm text-neutral-600 underline-offset-4 hover:text-neutral-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            <Draft>{DRAFTS.teamsLink}</Draft>
          </Link>
        </div>
      </div>
    </section>
  );
}
