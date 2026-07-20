/**
 * FounderCredibility — the full, self-contained credibility SECTION ("Built by someone
 * who paid for the lesson", €398k) with the founder talk-clip facade. It owns its own
 * <section> chrome, container, scroll-reveal, and the clip constant, so every surface
 * renders BYTE-IDENTICAL markup. See features/p1005_founder_talk_video_credibility_section.md.
 *
 * Used on the homepage (/), /coach, and /founder — each just drops `<FounderCredibility />`
 * with no wrapper of its own. Take-nothing, render-everything: that is what keeps the three
 * pages the same (P1005 change request: they had diverged because each page hand-rolled the
 * surrounding section chrome).
 *
 * Click-to-play facade: the <video> element mounts and loads only after the user clicks the
 * poster (no autoplay on render, no off-page YouTube embed). A Mixpanel event fires on first
 * play. The "Watch the full talk on YouTube" link-out sits under the clip.
 */
import { useRef, useState, useEffect } from "react";
import { CheckIcon, PlayIcon, Youtube } from "lucide-react";
import { motion, useReducedMotion, useInView, animate } from "framer-motion";
import { analytics } from "@/lib/mixpanel";

/** The full (unlisted) talk on YouTube — the link-out target under the clip. */
export const FOUNDER_FULL_TALK_URL = "https://www.youtube.com/watch?v=goFs8tuw1qc";

/**
 * The talk clip. PLACEHOLDER root-relative paths for local render/QA — swap to the absolute
 * GCS URLs before ship (see spec Pre-deploy Checklist; CSP media-src already allows
 * storage.googleapis.com). Prod form:
 *   https://storage.googleapis.com/claritypledge-story-images/founder/founder-credibility-clip-v1.mp4
 */
const FOUNDER_CLIP = {
  src: "/founder-credibility-clip-v1.mp4",
  poster: "/founder-credibility-poster-v1.jpg",
  captions: "/founder-credibility-clip-v1.en.vtt",
} as const;

/** Founder credibility points (first-person, mirrors /presi + ladischenski.com About). */
const CRED_POINTS = [
  { text: "Studied why partnerships break — wrote about what I learned", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
  { text: "Published a 60-page research paper on trust-building", link: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" },
] as const;

/** Self-contained scroll-reveal (matches the pages' Reveal feel; keeps the component
 *  dependency-free of any per-page helper). */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={inView || reduce ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** €-count that animates up when scrolled into view (once). */
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
function VideoFacade() {
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
            src={FOUNDER_CLIP.src}
            poster={FOUNDER_CLIP.poster}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <track kind="captions" src={FOUNDER_CLIP.captions} srcLang="en" label="English" default />
          </video>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Play the founder talk clip"
            className="group absolute inset-0 h-full w-full cursor-pointer"
          >
            <img
              src={FOUNDER_CLIP.poster}
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

/** The eyebrow + big-number heading + checked cred points. */
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
 * The full founder-credibility section — identical on /, /coach, and /founder.
 * Renders its own <section> chrome so no page hand-rolls the surrounding markup.
 */
export function FounderCredibility() {
  return (
    <section className="px-4 py-20 lg:py-28 border-t border-border">
      <Reveal className="container mx-auto max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
          {/* Video on top (mobile) / left (desktop) — mirrors the old photo placement. */}
          <VideoFacade />
          <CredText />
        </div>
      </Reveal>
    </section>
  );
}
