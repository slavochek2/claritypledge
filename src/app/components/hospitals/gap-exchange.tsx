/**
 * P1506 — the brochure's "3-second exchange", made interactive.
 *
 * Styled as a WhatsApp group chat between the two colleagues (illustrated avatars, generated
 * for this page). The visitor steps through A's question → B's 8 → A's 4 → the verified result, then picks
 * "Move on" or "Close the gap". Each choice shows its outcome; Replay restarts. Every control
 * is a real <button>, each new step is announced through an aria-live region, and with
 * prefers-reduced-motion the steps change without animation (`motion-safe:` classes only).
 *
 * If the interactive version throws, the error boundary renders the whole sequence as a
 * static ordered list (GapExchangeStatic) — the spec's "if JS fails" fallback, as far as an
 * SPA can honour it. Copy is verbatim from the brochure (texts9.py `en`).
 */
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { analytics } from "@/lib/mixpanel";
import { HospitalIcon } from "./hospital-icons";
import { EXCHANGE_COPY } from "@/app/content/hospitals-exchange";


/** 0 = A asks, 1 = B answers, 2 = A answers, 3 = verified + choice, 4 = outcome. */
type Step = 0 | 1 | 2 | 3 | 4;
type Choice = "move-on" | "close-gap" | null;

const ANNOUNCE: Record<Step, string> = {
  0: `A asks: ${EXCHANGE_COPY.m1}`,
  1: `B answers: ${EXCHANGE_COPY.m2}`,
  2: `A answers: ${EXCHANGE_COPY.m3}`,
  3: `${EXCHANGE_COPY.outcomeLine}: 4. ${EXCHANGE_COPY.outcomeText} ${EXCHANGE_COPY.then}`,
  4: "",
};

const BTN =
  "inline-flex items-center justify-center min-h-[44px] px-5 rounded-md border font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300";

/** Illustrated, not photographs: generic colleagues, nobody real. */
const AVATAR = { A: "/hospitals/colleague-a.jpg", B: "/hospitals/colleague-b.jpg" } as const;

/** WhatsApp-style group bubble (hex = WhatsApp's own palette, as in HardTruthChat).
 *  A is the viewer: right, green. B: left, white, with avatar and name. */
function Bubble({ who, time, children }: { who: "A" | "B"; time: string; children: ReactNode }) {
  const isA = who === "A";
  return (
    <div className={`flex gap-2 items-end ${isA ? "justify-end" : ""} ${ENTER}`}>
      {!isA && <img src={AVATAR.B} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />}
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-[15px] leading-snug shadow-sm text-[#111b21] ${
          isA ? "bg-[#d9fdd3] rounded-tr-sm" : "bg-white rounded-tl-sm"
        }`}
      >
        {!isA && <span className="block text-[12px] font-semibold text-blue-700 mb-0.5">B</span>}
        {children}
        <span className="block text-right text-[10px] text-[#54656f] mt-0.5">
          {time}
          {isA && <span className="text-blue-500"> ✓✓</span>}
        </span>
      </div>
    </div>
  );
}

function VerifiedEquation() {
  return (
    <div className="flex items-center justify-center gap-3 font-bold text-2xl text-foreground" aria-label="B said 8, A guessed 4, verified understanding 4">
      <span className="flex flex-col items-center leading-none"><span className="text-slate-600">8</span><small className="text-[11px] font-semibold text-muted-foreground mt-1">B</small></span>
      <span className="text-muted-foreground font-normal text-base">vs</span>
      <span className="flex flex-col items-center leading-none"><span className="text-blue-600">4</span><small className="text-[11px] font-semibold text-muted-foreground mt-1">A</small></span>
      <span className="text-muted-foreground font-normal text-base" aria-hidden="true">&rarr;</span>
      <span className="flex flex-col items-center leading-none"><span className="bg-blue-600 text-white rounded-md px-2.5 py-0.5">4</span><small className="text-[11px] font-semibold text-muted-foreground mt-1">{EXCHANGE_COPY.verifiedLabel}</small></span>
    </div>
  );
}

function Header() {
  return (
    <div className="text-center mb-10">
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 text-balance">{EXCHANGE_COPY.heading}</h2>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 text-xs font-semibold uppercase tracking-[0.18em] px-4 py-1.5">
        <HospitalIcon name="clock" className="w-4 h-4" />
        {EXCHANGE_COPY.seconds}
      </span>
    </div>
  );
}

/** Static rendering of the full sequence — the no-interaction fallback. */
export function GapExchangeStatic() {
  return (
    <div data-testid="gap-exchange-static" className="container mx-auto max-w-md">
      <Header />
      <p className="text-sm text-muted-foreground mb-3">{EXCHANGE_COPY.roles}</p>
      <ol className="list-decimal pl-5 space-y-2 text-foreground/80">
        <li>A: {EXCHANGE_COPY.m1}</li>
        <li>B: {EXCHANGE_COPY.m2}</li>
        <li>A: {EXCHANGE_COPY.m3}</li>
        <li>{EXCHANGE_COPY.outcomeLine}: 4. {EXCHANGE_COPY.outcomeText}</li>
        <li>
          {EXCHANGE_COPY.then} <b>{EXCHANGE_COPY.moveOn}</b> ({EXCHANGE_COPY.moveOnCost}) or <b>{EXCHANGE_COPY.close}</b> ({EXCHANGE_COPY.closeCost})
        </li>
      </ol>
    </div>
  );
}

export function GapExchange() {
  const [step, setStep] = useState<Step>(0);
  const [choice, setChoice] = useState<Choice>(null);
  // Nothing is announced or focused until the visitor acts: on page load the live region
  // stays empty so it never interrupts the page's own announcement.
  const [interacted, setInteracted] = useState(false);
  // Bumped on every transition so a repeated state (e.g. back to step 3) still re-announces.
  const [turn, setTurn] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // The control that was activated usually unmounts; move keyboard focus to the next one.
  useEffect(() => {
    if (!interacted) return;
    rootRef.current?.querySelector<HTMLButtonElement>("[data-focus-next]")?.focus();
  }, [step, turn, interacted]);

  const go = (next: Step, picked: Choice = choice) => {
    setStep(next);
    setChoice(picked);
    setInteracted(true);
    setTurn((t) => t + 1);
    analytics.track("hospitals_exchange_step", { step: next, ...(picked ? { choice: picked } : {}) });
  };

  const announcement = !interacted
    ? ""
    : step === 4
      ? choice === "move-on"
        ? `${EXCHANGE_COPY.moveOn}. ${EXCHANGE_COPY.moveOnCost}`
        : `${EXCHANGE_COPY.close}. ${EXCHANGE_COPY.closeCost}`
      : ANNOUNCE[step];

  // Clear, then set on the next tick: a message identical to the previous one (back to step 3)
  // is still a change the screen reader hears.
  const [liveText, setLiveText] = useState("");
  useEffect(() => {
    setLiveText("");
    if (!announcement) return;
    const t = setTimeout(() => setLiveText(announcement), 50);
    return () => clearTimeout(t);
  }, [announcement, turn]);

  return (
    <div data-testid="gap-exchange" ref={rootRef} className="container mx-auto max-w-3xl">
      <Header />
      <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Chat header — the two colleagues */}
        <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
          <div className="flex -space-x-2 shrink-0" aria-hidden="true">
            <img src={AVATAR.A} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-card" />
            <img src={AVATAR.B} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-card" />
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold leading-tight">A and B</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{EXCHANGE_COPY.roles}</p>
          </div>
        </div>
        {/* Chat body — WhatsApp wallpaper */}
        <div className="bg-[#efeae2] px-3 py-4 flex flex-col gap-2">
          <Bubble who="A" time="09:41">{EXCHANGE_COPY.m1}</Bubble>
          {step >= 1 && <Bubble who="B" time="09:41"><b className="text-2xl">{EXCHANGE_COPY.m2}</b></Bubble>}
          {step >= 2 && <Bubble who="A" time="09:41">{EXCHANGE_COPY.m3}</Bubble>}
          {step < 3 && (
            <div className="flex justify-center pt-2">
              <button type="button" data-focus-next className={`${BTN} border-blue-600 text-blue-700 bg-white hover:bg-blue-50`} onClick={() => go((step + 1) as Step)}>
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {step >= 3 && (
        <div className={`mx-auto max-w-md mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-sm ${ENTER}`}>
          <VerifiedEquation />
          <p className="mt-4 font-bold">{EXCHANGE_COPY.outcomeLine}</p>
          <p className="text-muted-foreground">{EXCHANGE_COPY.outcomeText}</p>
          <p className="mt-4 text-sm font-bold">{EXCHANGE_COPY.then}</p>

          {step === 3 ? (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" data-focus-next className={`${BTN} border-border bg-muted/40 hover:bg-muted`} onClick={() => go(4, "move-on")}>
                {EXCHANGE_COPY.moveOn}
              </button>
              <button type="button" className={`${BTN} border-border bg-muted/40 hover:bg-muted`} onClick={() => go(4, "close-gap")}>
                {EXCHANGE_COPY.close}
              </button>
            </div>
          ) : (
            <div className={`mt-2 rounded-lg bg-blue-50 border border-blue-100 p-3 ${ENTER}`} data-testid="exchange-outcome">
              <b className="block text-blue-700">{choice === "move-on" ? EXCHANGE_COPY.moveOn : EXCHANGE_COPY.close}</b>
              <span className="text-foreground/80">{choice === "move-on" ? EXCHANGE_COPY.moveOnCost : EXCHANGE_COPY.closeCost}</span>
            </div>
          )}

          {step === 4 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" className={`${BTN} border-border bg-card hover:bg-muted/50`} data-focus-next onClick={() => go(3, null)}>
                Try the other choice
              </button>
              <button type="button" className={`${BTN} border-border bg-card hover:bg-muted/50`} onClick={() => go(0, null)}>
                Replay
              </button>
            </div>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite" data-testid="exchange-live">
        {liveText}
      </p>
    </div>
  );
}

export class ExchangeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // The static list keeps the page whole; Sentry makes sure the broken exchange is noticed.
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
