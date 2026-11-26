/**
 * @file MeetingTypes.tsx
 * Prototype at /meeting-types (P1721, design exploration, DEV-only).
 *
 * "Would your meeting benefit from ClarityPledge?" in three steps: the host names their next
 * high-stakes meeting (from a list, or typed), sets its five dimensions of stakes, and sees the
 * impact. No money and no likelihood: there is no measured rate behind either, so the page only
 * shows the host's own judgement back to them. Nothing is pre-set ("Do not prefill our position on
 * their stakes", decisions.md).
 *
 * WHERE THE CONTENT COMES FROM. The five dimensions are features/p1727 (the five-bar card of demo
 * film 4.7); the kinds of meeting are docs/high-stakes-examples.md. The step bar copies the event
 * room's (RoomSteps.tsx).
 *
 * [FOUNDER DECISION: all copy, the verdict rule and the call to action are agent-proposed placeholders.]
 */
import { useEffect, useRef, type RefObject } from "react";
import { verdictOf } from "./model";
import { backOf } from "./flow";
import { StepBar } from "./StepBar";
import { StepFrame } from "./parts";
import { MeetingQuestions, StakesQuestions } from "./StepQuestions";
import { ResultView } from "./ResultView";
import { useMeetingFlow, type MeetingFlow } from "./useMeetingFlow";

export function MeetingTypes() {
  const flow = useMeetingFlow();
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(flow.step);

  // On every step change the new step's heading takes focus, so a screen reader announces it. Compared
  // with the step last shown, not with "first render": Strict Mode replays the effect on load.
  useEffect(() => {
    if (shown.current === flow.step) return;
    shown.current = flow.step;
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [flow.step]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 text-foreground">
      <StepBar states={flow.states} onSelect={flow.goTo} />
      {/* The page question is a quiet line above step 1, so the step's own heading leads; later steps keep it for screen readers. */}
      <h1 className={flow.step === "meeting" ? "mt-8 text-sm font-medium text-muted-foreground" : "sr-only"}>Would your meeting benefit from ClarityPledge?</h1>
      <CurrentStep flow={flow} headingRef={heading} />
    </main>
  );
}

function CurrentStep({ flow, headingRef }: { flow: MeetingFlow; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const to = backOf(flow.step);
  const back = to ? () => flow.goTo(to) : undefined;
  switch (flow.step) {
    case "meeting":
      return (
        <StepFrame title="Your next high-stakes meeting" headingRef={headingRef} next={{ label: "Continue", onClick: flow.next, ready: flow.ready }}>
          <MeetingQuestions meeting={flow.meeting} customName={flow.customName} errors={flow.errors} onMeeting={flow.setMeeting} onCustomName={flow.setCustomName} onSubmit={flow.next} />
        </StepFrame>
      );
    case "stakes":
      return (
        <StepFrame title="What is at stake" intro={<>How high is each one for <span className="break-words font-medium text-foreground">{flow.name}</span>?</>} headingRef={headingRef} back={back} next={{ label: "Show the impact", onClick: flow.next, ready: flow.ready }}>
          <StakesQuestions levels={flow.levels} errors={flow.errors} onLevel={flow.setLevel} />
        </StepFrame>
      );
    case "impact": {
      // [FOUNDER DECISION: the call to action's words and where it leads.] Low stakes gets no call to action.
      const next = verdictOf(flow.levels) === "low" ? undefined : { label: "Try a check in this meeting", to: "/live" };
      return (
        <StepFrame title="The impact" headingRef={headingRef} back={back} next={next}>
          <ResultView name={flow.name} levels={flow.levels} />
        </StepFrame>
      );
    }
  }
}
