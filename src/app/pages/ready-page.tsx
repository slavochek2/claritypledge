/**
 * @file ready-page.tsx
 * @description P1077 — `/ready`, thinking-state awareness before a clarity meeting.
 * P1083 — always-visible distribution above the slider, ephemeral write on Continue.
 *
 * One question, one bipolar slider, one Continue button. The mechanism is affect
 * labeling, not measurement: becoming aware of your own state is the feature. Your
 * OWN slider value is still never recorded, gated on, or sent anywhere in a way
 * that determines what happens next — Continue always proceeds to /meet regardless
 * of where the slider sits, including untouched. It IS written as an ephemeral,
 * no-identity row (P1083) as a side effect of the Continue tap, purely so the next
 * visitor's distribution reflects it.
 *
 * No numeral, percentage, or dynamic word is ever rendered for the current value —
 * only the midpoint carries a static "Neutral" tick label. See the spec's UI
 * Contract for why: a number here would be a second 0-10 rating in the same flow
 * as /meet's understanding number, diluting what that number means.
 *
 * The distribution above the slider (P1083) renders one dot per OTHER respondent
 * in the last 10 minutes, positioned on the same 0-10 axis as the slider below it.
 * No caption in either the /meet (1:1) or event context — the UI Contract sets
 * both to "no caption" (a caption would announce non-anonymity more conspicuously
 * than just showing one honest dot, or assert something the room's shape should
 * speak for itself). The sr-only label below is deliberately neutral wording,
 * never "aggregate" or a claim of anonymity that a single dot wouldn't back up.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { SliderTrack } from "@/app/components/partners/slider-track";
import { PRIMARY_BUTTON_CLASS } from "@/app/pages/meeting-terms-page";
import { getReadyDistribution, submitReadyValue } from "@/app/data/ready-service";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Before you meet";
const QUESTION = "How up for thinking are you right now?";
const MIDPOINT_LABEL = "Neutral";
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: "Keep it light", high: "Go deep" };
const DISTRIBUTION_LABEL = "How up for thinking others are right now";

export function ReadyPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState(MIDPOINT_VALUE);
  // Untouched vs "deliberately left at Neutral" is otherwise indistinguishable to
  // the partner standing next to them — see the spec's "Untouched reads as
  // neutral" risk. The thumb renders hollow until the first change.
  const [touched, setTouched] = useState(false);
  // Other respondents' values in the current retention window. Read happens on
  // load, before any write — the one new invariant an ungated always-visible view
  // requires (P1083). Starts empty and stays empty on a fetch failure, which reads
  // identically to the N=0 empty state rather than as an error.
  const [others, setOthers] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    getReadyDistribution()
      .then((values) => {
        if (!cancelled) setOthers(values);
      })
      // getReadyDistribution() already resolves to [] on its own failures — this
      // catch is a second, independent guarantee that a fetch failure can never
      // surface here as an unhandled rejection or block the slider/Continue.
      .catch(() => {
        if (!cancelled) setOthers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback((next: number) => {
    setValue(next);
    setTouched(true);
  }, []);

  const handleContinue = useCallback(() => {
    // Fire-and-forget: the write must never gate or delay Continue, same as
    // P1077's own value never gating navigation.
    submitReadyValue(value);
    // fromReady lets /meet show its conditional back button — the one, narrow
    // reversal of P1077's "do NOT modify /meet" non-goal.
    navigate("/meet", { state: { fromReady: true } });
  }, [value, navigate]);

  return (
    <div
      // Centered as ONE group rather than /meet's question-at-top +
      // fixed-bottom-bar split: /meet's fixed bar exists to let a long document
      // scroll behind it, but /ready has nothing to scroll — splitting it the same
      // way just left a dead gap between the slider and Continue. Height matches
      // the nav's own top offset (see clarity-landing-layout.tsx) rather than
      // min-h-screen, which would stack on that offset and overflow the fold.
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10 lg:min-h-[calc(100vh-5rem)]"
    >
      <SEO
        title={PAGE_TITLE}
        description="A moment of awareness before a clarity meeting — nothing recorded, nothing gated."
        url="/ready"
      />
      <h1 className="sr-only">{PAGE_TITLE}</h1>

      <div className="flex w-full max-w-sm flex-col gap-10">
        <ReadyDistribution values={others} />

        <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {QUESTION}
        </p>

        <SliderTrack
          value={value}
          onChange={handleChange}
          showValue={false}
          ariaLabel={QUESTION}
          midpointLabel={MIDPOINT_LABEL}
          poleLabels={POLE_LABELS}
          muted={!touched}
          bipolarFill
          expandedHitArea
        />

        <Button
          onClick={handleContinue}
          size="lg"
          className={cn(PRIMARY_BUTTON_CLASS, "w-full")}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

/**
 * One dot per other respondent, on the same 0-10 axis as the slider below it.
 * No caption in either context (UI Contract, founder decision) — dot density (or
 * one honest dot, or none at all) is meant to speak for itself. `role="img"`
 * collapses the dots into one screen-reader announcement instead of reading each
 * dot individually; the label itself never claims "anonymized" or "aggregate" —
 * see the file header for why that matters at N=1.
 */
function ReadyDistribution({ values }: { values: number[] }) {
  return (
    <div role="img" aria-label={DISTRIBUTION_LABEL} className="w-full">
      <div className="relative h-6 w-full">
        {values.map((v, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#002B5C]/70 dark:bg-blue-400/70"
            style={{ left: `${v * 10}%` }}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="relative mt-1.5 h-4 select-none text-xs text-muted-foreground"
      >
        <span className="absolute left-0">{POLE_LABELS.low}</span>
        <span className="absolute right-0">{POLE_LABELS.high}</span>
      </div>
    </div>
  );
}
