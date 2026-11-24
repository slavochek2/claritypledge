/**
 * @file MeetingStakes.tsx
 * Prototype at /tree/meeting-stakes (P1721, design exploration, DEV-only).
 *
 * "Would your meeting benefit from ClarityPledge?" in four steps, one on screen at a time:
 * the meeting and its gate question, five points to agree or disagree with, the host's own
 * cost estimates (optional), and the result. Nothing is pre-selected (decisions.md:
 * "Do not prefill our position on their stakes"); every figure is the host's own estimate.
 *
 * WHERE THE CONTENT COMES FROM. The gate question and the five conditions are
 * docs/arbiter-failure-model.md; the kinds of meeting are docs/high-stakes-examples.md.
 * The answer scale is the product's own position labels (position-groups.ts) and the step
 * bar copies the event room's (RoomSteps.tsx).
 *
 * NO NUMBER HERE IS A FINDING. There is no study behind any figure, and no measured rate at
 * which the check catches anything, so the result states a break-even and never a saving.
 *
 * [FOUNDER DECISION: all copy, the verdict thresholds and the call to action are
 * agent-proposed placeholders.]
 */
import { useEffect, useRef, type RefObject } from "react";
import { Link, useNavigate } from "react-router-dom";
import { worthChecking } from "./model";
import { backOf } from "./flow";
import { StepBar } from "./StepBar";
import { StepFrame } from "./parts";
import { MeetingQuestions, StakesQuestions } from "./StepQuestions";
import { CostQuestions } from "./CostQuestions";
import { ResultView } from "./ResultView";
import { SavedList } from "./SavedList";
import { useMeetingFlow, type MeetingFlow } from "./useMeetingFlow";

export function MeetingStakes() {
  const flow = useMeetingFlow();
  const earlier = flow.saved.filter((m) => m.id !== flow.draftId).length;
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef({ step: flow.step, draftId: flow.draftId });

  // On every step change the new step's heading takes focus, so a screen reader announces it. Compared
  // with the step last shown, not with "first render": Strict Mode replays the effect on load.
  useEffect(() => {
    if (shown.current.step === flow.step && shown.current.draftId === flow.draftId) return;
    shown.current = { step: flow.step, draftId: flow.draftId };
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [flow.step, flow.draftId]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 text-foreground">
      <StepBar states={flow.states} onSelect={flow.goTo} />
      <Link to="/tree" className="mt-4 inline-flex min-h-11 items-center text-sm text-blue-700 hover:underline">← Prototypes</Link>
      <h1 className={flow.step === "meeting" ? "mt-1 text-3xl font-semibold tracking-tight sm:mt-2 sm:text-4xl" : "mt-1 text-sm font-medium text-muted-foreground"}>Would your meeting benefit from ClarityPledge?</h1>
      <CurrentStep flow={flow} earlier={earlier} headingRef={heading} />
      {/* On the result from two meetings (one is what the card already shows); on step 1 as soon as another one exists,
          so a host starting another meeting can still see, and remove, the ones already checked. */}
      {flow.step === "result" && flow.saved.length >= 2 && <SavedList saved={flow.saved} currentId={flow.draftId} onRemove={flow.remove} />}
      {/* Before the result, only the other meetings: the current one's row is re-saved on reaching Result, so here it may be stale. */}
      {flow.step === "meeting" && earlier > 0 && <SavedList saved={flow.saved.filter((m) => m.id !== flow.draftId)} currentId={flow.draftId} onRemove={flow.remove} />}
    </main>
  );
}

function CurrentStep({ flow, earlier, headingRef }: { flow: MeetingFlow; earlier: number; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const navigate = useNavigate();
  const back = (() => {
    const to = backOf(flow.step, { meeting: flow.meeting, gate: flow.gate, answers: flow.answers, visited: new Set() });
    return to ? { onClick: () => flow.goTo(to) } : undefined;
  })();
  switch (flow.step) {
    case "meeting":
      return (
        <StepFrame title="Your meeting" intro={meetingIntro(earlier)} headingRef={headingRef} next={{ label: "Next", onClick: flow.next }}>
          <MeetingQuestions meeting={flow.meeting} customName={flow.customName} gate={flow.gate} errors={flow.errors} onMeeting={flow.setMeeting} onCustomName={flow.setCustomName} onGate={flow.setGate} />
        </StepFrame>
      );
    case "stakes":
      return (
        <StepFrame title="What is at stake" intro={<>Think of this meeting: <span className="break-words font-medium text-foreground">{flow.name}</span>. How much do you agree with each point?</>} headingRef={headingRef} back={back} next={{ label: "Next", onClick: flow.next }}>
          <StakesQuestions answers={flow.answers} errors={flow.errors} onAnswer={flow.setAnswer} />
        </StepFrame>
      );
    case "cost":
      return (
        <StepFrame title="Your estimates" intro="Optional. Rough guesses are enough, and you can leave blank what you cannot guess." headingRef={headingRef} back={back} next={{ label: "See the result", onClick: flow.next }}>
          <CostQuestions money={flow.money} onMoney={flow.setMoneyField} />
        </StepFrame>
      );
    case "result": {
      const another = { label: "Check another meeting", onClick: flow.another };
      // [FOUNDER DECISION: the call to action's words and where it leads.]
      const next = worthChecking(flow.verdict) ? { label: "Try a check in ClarityPledge", onClick: () => navigate("/live"), secondary: another } : another;
      return (
        <StepFrame title="Your result" headingRef={headingRef} back={back} next={next}>
          <ResultView name={flow.name} verdict={flow.verdict} gate={flow.gate} answers={flow.answers} money={flow.money} onAddEstimates={() => flow.goTo("cost")} />
        </StepFrame>
      );
    }
  }
}

/** Says the list exists before it is shown, so a host starting another meeting knows the earlier ones were kept. */
function meetingIntro(earlier: number): string {
  if (earlier === 0) return "One meeting at a time. After its result you can check another.";
  return `Meeting ${earlier + 1}. The ${earlier === 1 ? "meeting" : `${earlier} meetings`} you checked before ${earlier === 1 ? "is" : "are"} listed below.`;
}
