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
 * The distribution (P1083) is one mark per OTHER respondent in the last 10
 * minutes, rendered ON the slider's own track rather than as a separate chart
 * above it — see `SliderTrack`'s `others` prop. A standalone row was tried first
 * and reviewed as unreadable: duplicating the pole labels made it read as a
 * second, unrelated control, and marks floating on an implied axis gave a
 * position with nothing to be a position ON. Sharing the track means the visitor
 * decodes a mark from the thumb they are about to drag, so it still needs no
 * caption — which the UI Contract sets for both the /meet (1:1) and event
 * contexts (a caption would announce non-anonymity more conspicuously than one
 * honest mark, or assert something the room's shape should speak for itself).
 * The sr-only label is deliberately neutral wording, never "aggregate" or a
 * claim of anonymity that a single mark wouldn't back up.
 *
 * NO visible caption, in either context — the UI Contract's original call, briefly
 * reversed and then restored by the founder on the grounds that the marks are
 * self-evident once they sit on the visitor's own track. The known residual is
 * recorded in the spec (footnote 3): shown cold, a lone mark drew "snap-point
 * marker / status dot / decorative end-cap" from an independent reviewer before it
 * drew "another person". Adding a caption back is a one-line change if live use
 * ever shows that guess is what visitors actually make.
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
        <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {QUESTION}
        </p>

        {/* Extra headroom above the track for P1083's marks. They are painted over
            this space rather than reserving it, so N=0 looks identical to a page
            with no distribution at all — but the space has to EXIST for a crowd to
            spread into without overlapping itself into one blob (see
            `ghostPositions`). The page is vertically centred with room to spare, so
            this costs nothing visible; packing the marks tighter to avoid it is
            what produced two rounds of "reads as an icon" QA findings. */}
        <div className="pt-4">
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
            others={others}
            othersLabel={DISTRIBUTION_LABEL}
          />
        </div>

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
