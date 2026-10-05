import { Link } from "react-router-dom";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Draft } from "../draft";
import { DRAFTS, FOUNDER, LINKS, MEDIA } from "../content";
import { WATCH_COPY } from "./copy";

function Arrow() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
    >
      <path
        d="M4 10h11m-4-4 4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const LINK_BASE =
  "group inline-flex min-h-10 items-center gap-2 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400";

/**
 * Beat 5. End credits: the person behind the film, one line from him, what the
 * activism is, and quiet ways to come closer.
 */
export function Credits({ still }: { still: boolean }) {
  // Tied to scroll, not to a timer: the credits are already half lit as they enter, so the
  // handover from the barriers never passes through an empty screen.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 0.45"],
  });
  const opacity = useTransform(scrollYProgress, [0, 1], [still ? 1 : 0.35, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [still ? 0 : 36, 0]);

  return (
    <section
      ref={ref}
      // With motion, it overlaps the pinned barriers so the close line hands straight over.
      // From md up the overlap grows with the screen height and is zero on short screens. The
      // barriers block has a fixed size, so a plain share of the height drew the close line
      // across the photo on wide, short screens, and no overlap at all left a screen with an
      // empty middle on tall ones.
      className={`relative flex items-center justify-center px-5 py-14 ${still ? "" : "-mt-[30svh] min-h-[80svh] md:mt-[calc(-1*clamp(0px,90svh_-_620px,60svh))]"}`}
    >
      <motion.div
        style={{ opacity, y }}
        className="mx-auto flex w-full max-w-2xl flex-col items-center text-center"
      >
        <img
          src={MEDIA.founderPhoto}
          alt={WATCH_COPY.founderPhotoAlt}
          width={400}
          height={400}
          loading="lazy"
          className="h-28 w-28 rounded-full object-cover ring-1 ring-white/25 sm:h-32 sm:w-32"
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 sm:tracking-[0.28em]">
          <Draft>{WATCH_COPY.founderName}</Draft>
        </p>
        <p className="mt-8 text-[clamp(1.35rem,3.6vw,2.2rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-white">
          <Draft>{DRAFTS.founderLine}</Draft>
        </p>
        <p className="mt-5 max-w-md text-base leading-relaxed text-neutral-300 sm:text-lg">
          {FOUNDER.activism}
        </p>

        <nav className="mt-10 flex flex-col items-center gap-1 sm:flex-row sm:gap-6">
          <Link
            to={LINKS.events}
            className={`${LINK_BASE} text-base font-medium text-blue-300 hover:text-blue-200`}
          >
            <Draft>{DRAFTS.eventCta}</Draft>
            <Arrow />
          </Link>
          <Link
            to={LINKS.community}
            className={`${LINK_BASE} text-base font-medium text-blue-300 hover:text-blue-200`}
          >
            <Draft>{DRAFTS.communityCta}</Draft>
            <Arrow />
          </Link>
        </nav>
        <Link
          to={LINKS.teams}
          className={`${LINK_BASE} mt-8 text-sm text-neutral-400 hover:text-neutral-200`}
        >
          <Draft>{DRAFTS.teamsLink}</Draft>
        </Link>
      </motion.div>
    </section>
  );
}
