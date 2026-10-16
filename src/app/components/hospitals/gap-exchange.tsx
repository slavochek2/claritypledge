/**
 * P1506 — the brochure's "3-second exchange", as an auto-playing WhatsApp chat (the /builders
 * HardTruthChat pattern: plays once on scroll-in, no clicking).
 *
 * The viewer is the doctor (right, green); the chat is with Mai, a ward nurse (left, white).
 * A voice note stands for "A has just explained something" without inventing clinical
 * content. Then the question, Mai's 8, the doctor's 4, the verified result and the two
 * choices with their cost. Avatars are illustrations generated for this page, nobody real.
 * [FOUNDER DECISION: the name "Mai" and the doctor/nurse pairing — drafted]
 *
 * Accessibility: the animated chat is aria-hidden; a sr-only transcript carries the same
 * sequence in order, so screen-reader users never depend on timing. Reduced motion lands on
 * the final state. If the component throws, the error boundary renders the transcript visibly.
 * Copy is verbatim from the brochure (texts9.py `en`) except the speaker names.
 */
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { MicIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { SectionHeader } from "@/app/components/landing/section-header";
import { EXCHANGE_COPY } from "@/app/content/hospitals-exchange";

/** Illustrated, not photographs: generic colleagues, nobody real. */
const AVATAR = { doctor: "/hospitals/colleague-a.jpg", nurse: "/hospitals/colleague-b.jpg" } as const;
export const NURSE = "Mai";

/** 0 idle · 1 voice note · 2 question · 3 Mai's 8 · 4 doctor's 4 · 5 verified · 6 choices. */
const FINAL = 6;
const SCHEDULE = [150, 800, 1700, 2600, 3500, 4300];

function Heading() {
  return (
    <SectionHeader
      title={
        <span className="inline-block text-balance">
          Revealing a gap takes <span className="text-blue-500">{EXCHANGE_COPY.seconds}</span>
        </span>
      }
    />
  );
}

function Transcript({ className }: { className?: string }) {
  return (
    <ol className={className}>
      <li>The doctor sends {NURSE} a voice message explaining something.</li>
      <li>Doctor: {EXCHANGE_COPY.m1}</li>
      <li>{NURSE}: {EXCHANGE_COPY.m2}</li>
      <li>Doctor: {EXCHANGE_COPY.m3}</li>
      <li>{EXCHANGE_COPY.outcomeLine}: 4. {EXCHANGE_COPY.outcomeText}</li>
      <li>
        {EXCHANGE_COPY.then} {EXCHANGE_COPY.moveOn} ({EXCHANGE_COPY.moveOnCost}) or {EXCHANGE_COPY.close} ({EXCHANGE_COPY.closeCost})
      </li>
    </ol>
  );
}

/** The fallback when the animated chat throws: same sequence, visible. */
export function GapExchangeStatic() {
  return (
    <div data-testid="gap-exchange-static" className="container mx-auto max-w-md">
      <Heading />
      <Transcript className="list-decimal pl-5 space-y-2 text-foreground/80" />
    </div>
  );
}

function Bubble({ mine, time, children }: { mine: boolean; time: string; children: ReactNode }) {
  return (
    <div className={`flex gap-2 items-end ${mine ? "justify-end" : ""}`}>
      {!mine && <img src={AVATAR.nurse} alt="" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-full object-cover shrink-0" />}
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

function VoiceNote() {
  return (
    <span className="flex items-center gap-2 min-w-[11rem]">
      <img src={AVATAR.doctor} alt="" width={28} height={28} loading="lazy" className="w-7 h-7 rounded-full object-cover shrink-0" />
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

function VerifiedEquation() {
  return (
    <div className="flex items-center justify-center gap-3 font-bold text-2xl text-foreground">
      <span className="flex flex-col items-center leading-none"><span className="text-foreground/70">8</span><small className="text-xs font-semibold text-foreground/70 mt-1">{NURSE}</small></span>
      <span className="text-muted-foreground font-normal text-base">vs</span>
      <span className="flex flex-col items-center leading-none"><span className="text-blue-600">4</span><small className="text-xs font-semibold text-foreground/70 mt-1">Doctor</small></span>
      <span className="text-muted-foreground font-normal text-base">&rarr;</span>
      <span className="flex flex-col items-center leading-none"><span className="bg-blue-600 text-white rounded-md px-2.5 py-0.5">4</span><small className="text-xs font-semibold text-foreground/70 mt-1">{EXCHANGE_COPY.verifiedLabel}</small></span>
    </div>
  );
}

export function GapExchange() {
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
    analytics.track("hospitals_exchange_viewed");
  }, [inView]);

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
      <Transcript className="sr-only" />
      <div aria-hidden="true" data-testid="exchange-visual" data-phase={phase}>
        <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
            <img src={AVATAR.nurse} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold leading-tight">{NURSE}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">ward nurse · chat with the doctor</p>
            </div>
          </div>
          <div className="bg-[#efeae2] px-3 py-4 flex flex-col gap-2">
            <motion.div {...fade(phase >= 1)}><Bubble mine time="09:40"><VoiceNote /></Bubble></motion.div>
            <motion.div {...fade(phase >= 2)}><Bubble mine time="09:41">{EXCHANGE_COPY.m1}</Bubble></motion.div>
            <motion.div {...fade(phase >= 3)}><Bubble mine={false} time="09:41"><b className="text-2xl">{EXCHANGE_COPY.m2}</b></Bubble></motion.div>
            <motion.div {...fade(phase >= 4)}><Bubble mine time="09:41">{EXCHANGE_COPY.m3}</Bubble></motion.div>
          </div>
        </div>

        <motion.div className="mx-auto max-w-md mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-sm" {...fade(phase >= 5)}>
          <VerifiedEquation />
          <p className="mt-4 font-bold">{EXCHANGE_COPY.outcomeLine}</p>
          <p className="text-foreground/75">{EXCHANGE_COPY.outcomeText}</p>
          <motion.div {...fade(phase >= 6)}>
            <p className="mt-5 text-sm font-bold">{EXCHANGE_COPY.then}</p>
            <div className="mt-2 grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 text-left">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <b className="block">{EXCHANGE_COPY.moveOn}</b>
                <span className="text-sm text-muted-foreground">{EXCHANGE_COPY.moveOnCost}</span>
              </div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <b className="block text-blue-700">{EXCHANGE_COPY.close}</b>
                <span className="text-sm text-foreground/80">{EXCHANGE_COPY.closeCost}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export class ExchangeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // The visible transcript keeps the page whole; Sentry makes sure the break is noticed.
    Sentry.captureException(error, { tags: { surface: "hospitals-exchange" } });
  }
  render() {
    return this.state.failed ? <GapExchangeStatic /> : this.props.children;
  }
}

/** The exchange with its static fallback. */
export function GapExchangeSection() {
  return (
    <ExchangeBoundary>
      <GapExchange />
    </ExchangeBoundary>
  );
}
