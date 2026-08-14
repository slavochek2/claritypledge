/**
 * @file ready-page.tsx
 * @description P1077 — `/ready`, thinking-state awareness before a clarity meeting.
 *
 * One question, one bipolar slider, one Continue button. The mechanism is affect
 * labeling, not measurement: becoming aware of your own state is the feature. The
 * value is never recorded, gated on, or sent anywhere — Continue always proceeds to
 * /meet regardless of where the slider sits, including untouched.
 *
 * No numeral, percentage, or dynamic word is ever rendered for the current value —
 * only the midpoint carries a static "Neutral" tick label. See the spec's UI
 * Contract for why: a number here would be a second 0-10 rating in the same flow
 * as /meet's understanding number, diluting what that number means.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { SliderTrack } from "@/app/components/partners/slider-track";
import { PRIMARY_BUTTON_CLASS } from "@/app/pages/meeting-terms-page";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "Before you meet";
const QUESTION = "How up for thinking are you right now?";
const MIDPOINT_LABEL = "Neutral";
const MIDPOINT_VALUE = 5;
const POLE_LABELS = { low: "Keep it light", high: "Go deep" };

export function ReadyPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState(MIDPOINT_VALUE);
  // Untouched vs "deliberately left at Neutral" is otherwise indistinguishable to
  // the partner standing next to them — see the spec's "Untouched reads as
  // neutral" risk. The thumb renders hollow until the first change.
  const [touched, setTouched] = useState(false);

  const handleChange = useCallback((next: number) => {
    setValue(next);
    setTouched(true);
  }, []);

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
          onClick={() => navigate("/meet")}
          size="lg"
          className={cn(PRIMARY_BUTTON_CLASS, "w-full")}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
