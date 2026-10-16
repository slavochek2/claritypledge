/**
 * P1506 — the brochure's "3-second exchange", made interactive.
 *
 * The visitor steps through A's question → B's 8 → A's 4 → the verified result, then picks
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
import { PersonFigure, HospitalIcon } from "./hospital-icons";
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

function Bubble({ who, children }: { who: "A" | "B"; children: ReactNode }) {
  const isA = who === "A";
  return (
    <div className={`flex gap-2 items-end ${isA ? "" : "flex-row-reverse"} ${ENTER}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isA ? "bg-blue-600" : "bg-slate-600"}`}>
        <PersonFigure className="w-3.5 h-5" fill="#fff" />
      </div>
      <div
        className={`max-w-[80%] px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
          isA ? "bg-white text-slate-800 rounded-2xl rounded-bl-sm" : "bg-slate-200 text-slate-900 rounded-2xl rounded-br-sm"
        }`}
      >
        <span className={`block text-[11px] font-bold mb-0.5 ${isA ? "text-blue-600" : "text-slate-600"}`}>{who}</span>
        {children}
      </div>
    </div>
  );
}

function VerifiedEquation() {
  return (
    <div className="flex items-center gap-3 font-bold text-2xl text-slate-900" aria-label="B said 8, A guessed 4, verified understanding 4">
      <span className="flex flex-col items-center leading-none"><span className="text-slate-600">8</span><small className="text-[11px] font-semibold text-slate-500 mt-1">B</small></span>
      <span className="text-slate-400 font-normal text-base">vs</span>
      <span className="flex flex-col items-center leading-none"><span className="text-blue-600">4</span><small className="text-[11px] font-semibold text-slate-500 mt-1">A</small></span>
      <span className="text-slate-400 font-normal text-base" aria-hidden="true">&rarr;</span>
      <span className="flex flex-col items-center leading-none"><span className="bg-[#1e3a5f] text-white rounded-md px-2.5 py-0.5">4</span><small className="text-[11px] font-semibold text-slate-500 mt-1">{EXCHANGE_COPY.verifiedLabel}</small></span>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
      <h2 className="text-xl sm:text-2xl font-bold text-[#1e3a5f]">{EXCHANGE_COPY.heading}</h2>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1">
        <HospitalIcon name="clock" className="w-4 h-4" />
        {EXCHANGE_COPY.seconds}
      </span>
    </div>
  );
}

/** Static rendering of the full sequence — the no-interaction fallback. */
export function GapExchangeStatic() {
  return (
    <div data-testid="gap-exchange-static">
      <Header />
      <p className="text-sm text-slate-500 mb-3">{EXCHANGE_COPY.roles}</p>
      <ol className="list-decimal pl-5 space-y-2 text-slate-700">
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
    <div data-testid="gap-exchange" ref={rootRef}>
      <Header />
      <div className="grid gap-4 max-w-2xl">
        <div className="rounded-2xl bg-slate-100 p-4 flex flex-col gap-3 min-h-[15rem]">
          <p className="text-center text-sm font-semibold text-[#1e3a5f]">{EXCHANGE_COPY.roles}</p>
          <Bubble who="A">{EXCHANGE_COPY.m1}</Bubble>
          {step >= 1 && <Bubble who="B"><b className="text-xl">{EXCHANGE_COPY.m2}</b></Bubble>}
          {step >= 2 && <Bubble who="A">{EXCHANGE_COPY.m3}</Bubble>}
          {step < 3 && (
            <div className="flex justify-center pt-1">
              <button type="button" data-focus-next className={`${BTN} border-blue-600 text-blue-700 bg-white hover:bg-blue-50`} onClick={() => go((step + 1) as Step)}>
                Next
              </button>
            </div>
          )}
        </div>

        {step >= 3 && (
          <div className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${ENTER}`}>
            <VerifiedEquation />
            <p className="mt-3 font-bold text-[#1e3a5f]">{EXCHANGE_COPY.outcomeLine}</p>
            <p className="text-slate-700">{EXCHANGE_COPY.outcomeText}</p>
            <p className="mt-3 text-sm font-bold text-[#1e3a5f]">{EXCHANGE_COPY.then}</p>

            {step === 3 ? (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" data-focus-next className={`${BTN} border-slate-300 text-[#1e3a5f] bg-slate-50 hover:bg-slate-100`} onClick={() => go(4, "move-on")}>
                  {EXCHANGE_COPY.moveOn}
                </button>
                <button type="button" className={`${BTN} border-slate-300 text-[#1e3a5f] bg-slate-50 hover:bg-slate-100`} onClick={() => go(4, "close-gap")}>
                  {EXCHANGE_COPY.close}
                </button>
              </div>
            ) : (
              <div className={`mt-2 rounded-lg bg-blue-50 border border-blue-100 p-3 ${ENTER}`} data-testid="exchange-outcome">
                <b className="block text-blue-700">{choice === "move-on" ? EXCHANGE_COPY.moveOn : EXCHANGE_COPY.close}</b>
                <span className="text-slate-700">{choice === "move-on" ? EXCHANGE_COPY.moveOnCost : EXCHANGE_COPY.closeCost}</span>
              </div>
            )}

            {step === 4 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`} data-focus-next onClick={() => go(3, null)}>
                  Try the other choice
                </button>
                <button type="button" className={`${BTN} border-slate-300 text-slate-700 bg-white hover:bg-slate-50`} onClick={() => go(0, null)}>
                  Replay
                </button>
              </div>
            )}
          </div>
        )}
      </div>
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
