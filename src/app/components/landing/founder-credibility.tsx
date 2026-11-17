/**
 * FounderCredibility — the full, self-contained credibility SECTION ("Built by someone
 * who paid for the lesson", €398k) with the founder's photo. It owns its own <section>
 * chrome, container and scroll-reveal, so every surface renders BYTE-IDENTICAL markup.
 * See features/p1005_founder_talk_video_credibility_section.md.
 *
 * Used on the six use-case pages (/builders, /change-managers, /hiring, /founder, /hospitals,
 * /coach) — each just drops `<FounderCredibility />` with no wrapper of its own. Take-nothing,
 * render-everything: that is what keeps the pages the same.
 *
 * P1704 replaced the talk clip with the photo: each page now has one video, the product demo
 * (HowItWorksDemoSection). The "Watch my talk on YouTube" link-out sits under the photo.
 */
import { useRef, useState, useEffect } from "react";
import { CheckIcon, Youtube } from "lucide-react";
import { motion, useReducedMotion, useInView, animate } from "framer-motion";
import { publicMediaUrl } from "@/lib/public-media";

/** The full (unlisted) talk on YouTube — the link-out target under the photo. */
export const FOUNDER_FULL_TALK_URL = "https://www.youtube.com/watch?v=goFs8tuw1qc";

/** The founder's photo (640×640), on the public media bucket under founder/. */
const FOUNDER_PHOTO = publicMediaUrl("founder/founder-photo-640-v1.jpg");

/** Founder credibility points (first-person, mirrors /presi + ladischenski.com About). */
const CRED_POINTS = [
  { text: "Studied why relationships break — wrote about what I learned", link: "https://blog.claritypledge.com/two-skills-next-generation-founders/" },
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
  // Default to the real target, not 0: if JS never runs (hydration failure — e.g. Google
  // Translate mutating text nodes before hydration) or inView never fires, the visitor
  // still sees the correct number instead of a permanent 0.
  const [val, setVal] = useState(target);
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
      {/* [FOUNDER DECISION: the link under the photo — draft "Watch my talk on YouTube", or remove it] */}
      Watch my talk on YouTube
    </a>
  );
}

/** The founder's photo + the talk link. */
function FounderPhoto() {
  return (
    <div>
      <img
        src={FOUNDER_PHOTO}
        alt="Vyacheslav Ladischenski, founder of Clarity Pledge"
        width={640}
        height={640}
        loading="lazy"
        className="aspect-square w-full max-w-[320px] rounded-2xl object-cover object-top lg:max-w-[360px]"
      />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-start">
          {/* Photo on top (mobile) / left (desktop). */}
          <FounderPhoto />
          <CredText />
        </div>
      </Reveal>
    </section>
  );
}
