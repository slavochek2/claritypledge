/**
 * FounderCredibility — shared credibility block ("Built by someone who paid for the
 * lesson", €398k). Extracted from the inline copy previously duplicated on /founder
 * (old-landing-2) and /program. See features/p1005_founder_talk_video_credibility_section.md.
 *
 * Two modes:
 *  - `video` prop present → talk-clip facade (poster + play) left, text right (/founder).
 *    Click-to-play facade: the <video> element mounts and loads only after the user clicks
 *    the poster (no autoplay on render, no off-page YouTube embed). A Mixpanel event fires
 *    on first play.
 *  - no `video` prop → text only, single column (/coach).
 *
 * Both modes render the "Watch the full talk on YouTube" link-out (same component
 * everywhere). /program keeps its own inline copy untouched (P1005 non-goal).
 */
import { useRef, useState, useEffect } from "react";
import { CheckIcon, PlayIcon, Youtube } from "lucide-react";
import { useReducedMotion, useInView, animate } from "framer-motion";
import { analytics } from "@/lib/mixpanel";

/** The full (unlisted) talk on YouTube — link-out target, shared by both modes. */
export const FOUNDER_FULL_TALK_URL = "https://www.youtube.com/watch?v=goFs8tuw1qc";

/** Founder credibility points (first-person, mirrors /presi + ladischenski.com About). */
const CRED_POINTS = [
  { text: "Studied why partnerships break — wrote about what I learned", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
  { text: "Published a 60-page research paper on trust-building", link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" },
] as const;

export interface FounderVideo {
  /** mp4 URL (hosted off-repo — see spec Hosting decision). */
  src: string;
  /** Poster image URL shown before play. */
  poster: string;
  /** WebVTT captions URL (a11y). Omit → the caption track renders with no `src`
   *  (browser loads no cues); provide a URL to surface real captions. */
  captions?: string;
}

/** €-count that animates up when scrolled into view (once). Ported from the inline block. */
function CountUpMoney({ target, className }: { target: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(0, target, {
      duration: 1.1,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, target, reduce]);
  return (
    <span ref={ref} className={`inline-grid tabular-nums ${className ?? ""}`}>
      <span className="col-start-1 row-start-1 text-left">€{val}k</span>
      <span aria-hidden className="col-start-1 row-start-1 invisible">€{target}k</span>
    </span>
  );
}

/** Quiet link-out to the full talk on YouTube. Red glyph = YouTube brand (nominative use). */
function FullTalkLink({ className }: { className?: string }) {
  return (
    <a
      href={FOUNDER_FULL_TALK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-blue-600 underline underline-offset-2 decoration-blue-300 ${className ?? ""}`}
    >
      <Youtube className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
      Watch the full talk on YouTube
    </a>
  );
}

/** Click-to-play facade: poster + centered play button; the <video> loads only on click. */
function VideoFacade({ video }: { video: FounderVideo }) {
  const [playing, setPlaying] = useState(false);
  const firedRef = useRef(false);

  const handlePlay = () => {
    if (!firedRef.current) {
      firedRef.current = true;
      analytics.track("founder_clip_play", { location: "founder_credibility" });
    }
    setPlaying(true);
  };

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-border bg-black">
        {playing ? (
          <video
            src={video.src}
            poster={video.poster}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            {/* Caption track is always present for a11y (jsx-a11y/media-has-caption).
                When `captions` is undefined React drops `src`, so the browser simply
                loads no cues — a harmless empty track, not a broken one. */}
            <track kind="captions" src={video.captions} srcLang="en" label="English" default />
          </video>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Play the founder talk clip"
            className="group absolute inset-0 h-full w-full cursor-pointer"
          >
            <img
              src={video.poster}
              alt="Vyacheslav Ladischenski on stage, presenting the method"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/30" />
            <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
              <PlayIcon className="h-7 w-7 translate-x-0.5 fill-blue-600 text-blue-600" />
            </span>
          </button>
        )}
      </div>
      <FullTalkLink className="mt-3" />
    </div>
  );
}

/** The eyebrow + big-number heading + checked cred points. Shared by both modes. */
function CredText() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
        Built by someone who paid for the lesson
      </p>
      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight mb-6">
        I've raised <CountUpMoney target={398} className="text-blue-500 align-baseline" />, built B2B SaaS for six years, and had to close it all down.
      </h2>
      <ul className="space-y-3">
        {CRED_POINTS.map((item) => (
          <li key={item.text} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
              <CheckIcon className="h-4 w-4 text-blue-500" />
            </span>
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-blue-600 underline underline-offset-2 decoration-blue-300">
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared founder-credibility block. Pass `video` for the talk-clip facade (/founder);
 * omit it for the text-only block (/coach). Both render the YouTube link-out.
 */
export function FounderCredibility({ video }: { video?: FounderVideo }) {
  if (!video) {
    return (
      <div className="max-w-2xl">
        <CredText />
        <FullTalkLink className="mt-6" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
      {/* Video on top (mobile) / left (desktop) — mirrors the old photo placement. */}
      <VideoFacade video={video} />
      <CredText />
    </div>
  );
}
