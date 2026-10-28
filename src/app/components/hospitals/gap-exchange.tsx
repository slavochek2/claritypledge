/**
 * P1506 — the brochure's "3-second exchange", as an auto-playing WhatsApp chat (the /builders
 * HardTruthChat pattern: plays once on scroll-in, no clicking).
 *
 * The viewer is the nurse (right, green), who explains; the chat is with Dr. Mai (left, white),
 * who receives: it is harder for the senior side to paraphrase, so the doctor explains back.
 * A voice note stands for "the nurse has just explained something" without inventing clinical
 * content. Then the question, the doctor's 8, the nurse's 4, and three system messages: the
 * verified result, the 3 seconds, and how to close the gap. Avatars are illustrations, nobody real.
 * [FOUNDER DECISION: the name "Mai", the heading, and the nurse→doctor direction — drafted]
 *
 * Accessibility: the animated chat is aria-hidden; a sr-only transcript carries the same
 * sequence in order, so screen-reader users never depend on timing. Reduced motion lands on
 * the final state. If the component throws, the error boundary renders the transcript visibly.
 * Copy is from the brochure (texts9.py `en`); the result and choice lines are condensed.
 */
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { MicIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { EXCHANGE_COPY } from "@/app/content/hospitals-exchange";
import { HOSPITAL_CAST, type ExchangeCast } from "@/app/content/exchange-casts";

export const DOCTOR = "Dr. Mai";

/** 0 idle · 1 voice note · 2 question · 3 doctor's 8 · 4 nurse's 4 · 5 verified · 6 3 seconds · 7 how to close. */
const FINAL = 7;
// Paced for a first read, but brisk: the founder found the earlier pace (6.6s) slow.
const SCHEDULE = [150, 500, 1500, 2200, 3100, 3800, 4500];

function Heading() {
  return (
    <SectionHeader
      title={
        <span className="inline-block text-balance">
          Reveal a gap, then <span className="text-blue-500">close it</span>
        </span>
      }
    />
  );
}

function Transcript({ className, cast }: { className?: string; cast: ExchangeCast }) {
  return (
    <ol className={className}>
      <li>{cast.intro}</li>
      <li>{cast.meLabel}: {EXCHANGE_COPY.m1}</li>
      <li>{cast.other}: {EXCHANGE_COPY.m2}</li>
      <li>{cast.meLabel}: {EXCHANGE_COPY.m3}</li>
      <li>{EXCHANGE_COPY.verified}</li>
      <li>{EXCHANGE_COPY.revealed}</li>
      <li>{cast.close}</li>
    </ol>
  );
}

/** The fallback when the animated chat throws: same sequence, visible. */
export function GapExchangeStatic({ cast = HOSPITAL_CAST }: { cast?: ExchangeCast }) {
  return (
    <div data-testid="gap-exchange-static" className="container mx-auto max-w-md">
      <Heading />
      <Transcript cast={cast} className="list-decimal pl-5 space-y-2 text-foreground/80" />
    </div>
  );
}

function Bubble({ mine, time, avatar, children }: { mine: boolean; time: string; avatar: string; children: ReactNode }) {
  return (
    <div className={`flex gap-2 items-end ${mine ? "justify-end" : ""}`}>
      {!mine && <img src={avatar} alt="" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-full object-cover shrink-0" />}
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-[15px] leading-snug shadow-sm text-[#111b21] ${mine ? "bg-[#d9fdd3] rounded-tr-sm" : "bg-white rounded-tl-sm"}`}>
        {children}
        <span className="block text-right text-[10px] text-[#54656f] mt-0.5">
          {time}
          {mine && <span className="text-blue-500"> ✓✓</span>}
        </span>
      </div>
    </div>
  );
}

function VoiceNote({ avatar }: { avatar: string }) {
  return (
    <span className="flex items-center gap-2 min-w-[9.5rem] sm:min-w-[11rem]">
      <img src={avatar} alt="" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-full object-cover shrink-0" />
      <MicIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      <span className="flex items-end gap-[2px] h-5 flex-1">
        {[3, 6, 9, 5, 12, 8, 4, 10, 7, 13, 6, 9, 4, 8, 5, 11, 6, 3].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-[#54656f]/50" style={{ height: `${h + 4}px` }} />
        ))}
      </span>
      <span className="text-[11px] text-[#54656f] tabular-nums">0:48</span>
    </span>
  );
}

/** A centred WhatsApp-style system message: tinted, borderless, so it never reads as a button. */
function SystemNote({ children }: { children: ReactNode }) {
  return (
    <div className="self-center max-w-[92%] rounded-md bg-[#e7f0fb] px-3 py-1.5 text-center text-[12.5px] leading-snug text-[#1f3a5f]">
      {children}
    </div>
  );
}

export function GapExchange({ cast = HOSPITAL_CAST }: { cast?: ExchangeCast }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const [phase, setPhase] = useState(reduce ? FINAL : 0);
  // Plays once per page view: a later in-view or motion-preference change never replays it.
  const played = useRef(false);

  // The view is tracked whatever the motion preference, once.
  const tracked = useRef(false);
  useEffect(() => {
    if (!inView || tracked.current) return;
    tracked.current = true;
    analytics.track(cast.viewEvent);
  }, [inView, cast.viewEvent]);

  useEffect(() => {
    if (reduce) {
      played.current = true;
      setPhase(FINAL);
      return;
    }
    if (!inView || played.current) return;
    // Phase only moves forward; "played" is set only when the last step lands, so an effect
    // cleanup mid-play (StrictMode, remount) simply lets the next run start over.
    const timers = SCHEDULE.map((ms, i) =>
      setTimeout(() => {
        setPhase((p) => Math.max(p, i + 1));
        if (i + 1 === FINAL) played.current = true;
      }, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce]);

  const fade = (show: boolean) => ({
    initial: false as const,
    animate: { opacity: show ? 1 : 0, y: show ? 0 : 10 },
    transition: { duration: 0.4, ease: "easeOut" as const },
  });

  return (
    <div data-testid="gap-exchange" ref={ref} className="container mx-auto max-w-xl">
      <Heading />
      <Transcript cast={cast} className="sr-only" />
      <div aria-hidden="true" data-testid="exchange-visual" data-phase={phase}>
        <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
            <img src={cast.avatars.other} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold leading-tight">{cast.other}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{cast.otherRole}</p>
            </div>
          </div>
          <div className="bg-[#efeae2] px-3 py-4 flex flex-col gap-2">
            <motion.div {...fade(phase >= 1)}><Bubble mine time="09:40" avatar={cast.avatars.other}><VoiceNote avatar={cast.avatars.me} /></Bubble></motion.div>
            <motion.div {...fade(phase >= 2)}><Bubble mine time="09:41" avatar={cast.avatars.other}>{EXCHANGE_COPY.m1}</Bubble></motion.div>
            <motion.div {...fade(phase >= 3)}><Bubble mine={false} time="09:41" avatar={cast.avatars.other}>{EXCHANGE_COPY.m2}</Bubble></motion.div>
            <motion.div {...fade(phase >= 4)}><Bubble mine time="09:41" avatar={cast.avatars.other}>{EXCHANGE_COPY.m3}</Bubble></motion.div>
            <motion.div className="flex flex-col" {...fade(phase >= 5)}><SystemNote><b>{EXCHANGE_COPY.verified}</b></SystemNote></motion.div>
            <motion.div className="flex flex-col" {...fade(phase >= 6)}><SystemNote>{EXCHANGE_COPY.revealed}</SystemNote></motion.div>
            <motion.div className="flex flex-col" {...fade(phase >= 7)}><SystemNote>{cast.close}</SystemNote></motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export class ExchangeBoundary extends Component<{ children: ReactNode; cast?: ExchangeCast }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // The visible transcript keeps the page whole; Sentry makes sure the break is noticed.
    Sentry.captureException(error, { tags: { surface: "hospitals-exchange" } });
  }
  render() {
    return this.state.failed ? <GapExchangeStatic cast={this.props.cast} /> : this.props.children;
  }
}

/** The exchange with its static fallback. */
export function GapExchangeSection({ cast = HOSPITAL_CAST }: { cast?: ExchangeCast }) {
  return (
    <ExchangeBoundary cast={cast}>
      <GapExchange cast={cast} />
    </ExchangeBoundary>
  );
}
