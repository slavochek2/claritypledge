/**
 * Screen 5, the mirror. Text only, the scene hidden on phones.
 *
 * The whole flow is built: write, explain-back, rate out of 10, say what was missed, try
 * again, three tries at most. It talks to the model through one function, `explain`,
 * which defaults to `explainBack` from ./mirror. That function is not connected in this
 * build and rejects with MirrorNotConnected, so a visitor sees the "not available yet"
 * notice after the first submit. The rating and retry states render only once a real
 * endpoint answers.
 *
 * Every action sits in the shell's footer: Back (to the demonstration) on the left, and on
 * the right the one primary action this screen's state allows, which this component
 * reports through `onPrimary`. Its two forms are submitted from the footer by id.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { TEXT } from "./copy";
import { MIRROR_FORM_ID } from "./formIds";
import { Heading } from "./Heading";
import { MAX_ATTEMPTS, MirrorNotConnected, canRetry, explainBack } from "./mirror";
import { BODY, CAPTION, CARD, CARD_LABEL, LEAD, fieldInput, fieldLabel, note } from "./ui";

type Phase = "compose" | "waiting" | "explained" | "not-connected" | "failed" | "done";

interface Attempt {
  explanation: string;
  rating: number | null;
}

/** What the footer's primary slot holds for the mirror's current state. */
export type MirrorPrimary =
  | { kind: "submit"; formId: string; label: "explain" | "retry" }
  | { kind: "continue" }
  | null;

const SCALE = Array.from({ length: 11 }, (_, i) => i);

export function MirrorScreen({
  onReveal,
  onPrimary,
  explain = explainBack,
}: {
  /** Called when new content appears below, so the shell can scroll it into view. */
  onReveal: () => void;
  onPrimary: (primary: MirrorPrimary) => void;
  explain?: (text: string, feedback?: string) => Promise<string>;
}) {
  const ids = useId();
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [phase, setPhase] = useState<Phase>("compose");

  const current = attempts[attempts.length - 1];

  const ask = async (withFeedback?: string) => {
    setPhase("waiting");
    try {
      const explanation = await explain(text.trim(), withFeedback);
      setAttempts((prev) => [...prev, { explanation, rating: null }]);
      setFeedback("");
      setPhase("explained");
    } catch (error) {
      setPhase(error instanceof MirrorNotConnected ? "not-connected" : "failed");
    }
    onReveal();
  };

  const rate = (value: number) => {
    setAttempts((prev) => prev.map((a, i) => (i === prev.length - 1 ? { ...a, rating: value } : a)));
    if (!canRetry(attempts.length, value)) setPhase("done");
  };

  const retryOpen =
    phase === "explained" && current !== undefined && current.rating !== null && canRetry(attempts.length, current.rating);

  // The footer's primary: submit while the visitor can, Continue once there is nothing left
  // to do here (the last try answered, or the mirror unavailable).
  const hasAttempts = attempts.length > 0;
  const primary = useMemo<MirrorPrimary>(() => {
    if (phase === "compose") return { kind: "submit", formId: MIRROR_FORM_ID.ask, label: "explain" };
    if (phase === "failed") return { kind: "submit", formId: hasAttempts ? MIRROR_FORM_ID.retry : MIRROR_FORM_ID.ask, label: "retry" };
    if (retryOpen) return { kind: "submit", formId: MIRROR_FORM_ID.retry, label: "retry" };
    if (phase === "done" || phase === "not-connected") return { kind: "continue" };
    return null;
  }, [phase, hasAttempts, retryOpen]);
  useEffect(() => {
    onPrimary(primary);
  }, [primary, onPrimary]);

  return (
    <div className="first-enter space-y-6">
      <Heading role="title" text={TEXT.mirrorTitle} />
      <p data-newest={phase === "compose" ? "" : undefined} className={LEAD}>
        {TEXT.mirrorIntro}
      </p>

      <form
        id={MIRROR_FORM_ID.ask}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !hasAttempts) void ask();
        }}
      >
        <p className={LEAD}>{TEXT.mirrorNoNames}</p>
        <label className={fieldLabel} htmlFor={`${ids}-text`}>
          {TEXT.mirrorInputLabel}
        </label>
        <textarea
          id={`${ids}-text`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={attempts.length > 0}
          className={fieldInput}
        />
      </form>

      <div aria-live="polite" data-newest={phase === "compose" ? undefined : ""} className="space-y-4">
        {phase === "waiting" && <p className={note}>{TEXT.mirrorWaiting}</p>}
        {phase === "not-connected" && (
          // A notice, not a field and not an error: an info mark, no input styling.
          <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-500 bg-slate-900 p-4">
            <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
            <p className={BODY}>{TEXT.mirrorNotAvailable}</p>
          </div>
        )}
        {phase === "failed" && <p className={BODY}>{TEXT.mirrorFailed}</p>}

        {current && (phase === "explained" || phase === "done" || (phase === "failed" && attempts.length > 0)) && (
          <section className={`${CARD} space-y-4`}>
            <p className={CARD_LABEL}>
              {TEXT.mirrorAttempt} {attempts.length} {TEXT.mirrorAttemptOf} {MAX_ATTEMPTS}
            </p>
            <div>
              <p className={CARD_LABEL}>{TEXT.mirrorExplainBackLabel}</p>
              <p className={`mt-1 ${BODY}`}>{current.explanation}</p>
            </div>
            <fieldset>
              <legend className={BODY}>{TEXT.mirrorQuestion}</legend>
              <div role="radiogroup" aria-label={TEXT.mirrorRatingLabel} className="mt-3 space-y-1">
                {[SCALE.slice(0, 6), SCALE.slice(6)].map((row, r) => (
                  <div key={r} className={`grid gap-1 ${r === 0 ? "grid-cols-6" : "grid-cols-5"}`}>
                    {row.map((n) => {
                      const on = current.rating === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={phase === "done"}
                          onClick={() => rate(n)}
                          className={`h-11 min-w-11 rounded-lg border text-[17px] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
                            on ? "border-white bg-white text-slate-900" : "border-slate-500 text-slate-50 hover:bg-white/10"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </fieldset>
            {current.rating !== null && (
              <div>
                <p className={CAPTION}>{TEXT.mirrorYourRating}</p>
                <p className="mt-1 whitespace-nowrap">
                  <span className="text-[28px] font-semibold leading-none tabular-nums text-white">{current.rating}</span>{" "}
                  <span className={CAPTION}>{TEXT.outOf}</span>
                </p>
              </div>
            )}
            {(retryOpen || (phase === "failed" && attempts.length > 0)) && (
              <form
                id={MIRROR_FORM_ID.retry}
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (feedback.trim()) void ask(feedback.trim());
                }}
              >
                <label className={fieldLabel} htmlFor={`${ids}-feedback`}>
                  {TEXT.mirrorFeedbackLabel}
                </label>
                <textarea
                  id={`${ids}-feedback`}
                  rows={2}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className={fieldInput}
                />
              </form>
            )}
            {phase === "done" && current.rating !== null && current.rating < 10 && (
              <p className={note}>{TEXT.mirrorLastAttempt}</p>
            )}
          </section>
        )}

        {/* The closing note belongs to the end states only: after the last try, or when the
            mirror is unavailable. It sits inside the newest block, so it is brought into view
            with the result, and it has no divider of its own: the footer's is the only one. */}
        {(phase === "done" || phase === "not-connected") && <p data-closing className={BODY}>{TEXT.mirrorClosing}</p>}
      </div>
    </div>
  );
}
