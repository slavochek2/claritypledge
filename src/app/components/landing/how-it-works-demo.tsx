/**
 * P1704 — the "How it works" section on the six use-case pages: a heading, the product demo
 * (click to play, the manifesto film's player) and 3-4 numbered steps. One component, so all
 * six pages render the same thing; the only per-page input is the analytics `location`.
 * Owns `demo_video_seen` (35% of the frame on screen, once) and `demo_video_play` (first play,
 * once). While DEMO_VIDEO is null the frame is a placeholder and fires nothing.
 */
import { useRef, useState } from "react";
import { analytics } from "@/lib/mixpanel";
import { Mp4VideoFacade } from "@/app/components/shared/mp4-video-facade";
import { useSeenOnce } from "@/app/components/shared/use-seen-once";
import { DEMO_VIDEO, HOW_IT_WORKS, type DemoVideo, type UseCaseLocation } from "@/app/content/how-it-works-demo";
import { Reveal } from "./fable/fable-parts";
import { SHELL } from "./fable/fable-content";

const TEXT_FRAME =
  "flex aspect-video w-full items-center justify-center rounded-2xl bg-muted px-6 text-center text-lg text-muted-foreground ring-1 ring-border";

const COLUMNS = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;

export function HowItWorksDemoSection({ location, video = DEMO_VIDEO }: { location: UseCaseLocation; video?: DemoVideo | null }) {
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  useSeenOnce(frameRef, () => analytics.track("demo_video_seen", { location }), video !== null && !failed);
  const steps: readonly { title: string; text: string }[] = HOW_IT_WORKS.steps;
  const columns = steps.length === 4 ? COLUMNS[4] : COLUMNS[3];

  return (
    <section id="how-it-works" className="scroll-mt-16 border-t border-border px-4 py-16 lg:py-28">
      <Reveal className={SHELL}>
        <h2 className="max-w-3xl text-3xl sm:text-4xl lg:text-5xl font-semibold leading-[1.1] tracking-tight text-balance">{HOW_IT_WORKS.heading}</h2>
        <div ref={frameRef} className="mt-10 max-w-3xl lg:mt-14">
          {video === null ? (
            <div className={TEXT_FRAME}>{HOW_IT_WORKS.placeholder}</div>
          ) : failed ? (
            <div className={TEXT_FRAME}>{HOW_IT_WORKS.errorLine}</div>
          ) : (
            <Mp4VideoFacade
              look="landing"
              src={video.src}
              poster={video.poster}
              posterAlt={video.posterAlt}
              playLabel={video.playLabel}
              captions={video.captions}
              durationSeconds={video.durationSeconds}
              onPlay={() => analytics.track("demo_video_play", { location })}
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <ol className={`mt-12 grid gap-8 lg:mt-16 ${columns}`}>
          {steps.map((s, i) => (
            <li key={s.title} className="border-t-2 border-foreground pt-5">
              <span className="font-mono text-sm font-semibold text-blue-600" aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-foreground/75">{s.text}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
