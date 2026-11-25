/** State and actions for /tree/meeting-stakes: one meeting, its five levels, and the step shown. */
import { useState } from "react";
import { flushSync } from "react-dom";
import { ANOTHER, NO_LEVELS, type DimensionKey, type Level, type Levels } from "./model";
import { STEPS, canOpen, errorsOf, missingOn, nextOf, stateOf, stepDone, type FlowInput, type Step, type StepState } from "./flow";

/** Moves focus to the first question still unanswered, so a refused Continue lands where the host has to act. */
function focusQuestion(key: string) {
  // The sticky step bar would cover a question scrolled to the top edge, so the question is centred first.
  document.querySelector(`[data-question="${key}"]`)?.scrollIntoView({ block: "center" });
  document.querySelector<HTMLElement>(`[data-question="${key}"] input, [data-question="${key}"] select`)?.focus({ preventScroll: true });
}

export function useMeetingFlow() {
  const [meeting, setMeeting] = useState("");
  const [customName, setCustomName] = useState("");
  const [levels, setLevels] = useState<Levels>(NO_LEVELS);
  const [step, setStep] = useState<Step>("meeting");
  const [tried, setTried] = useState<ReadonlySet<Step>>(new Set());

  const flow: FlowInput = { meeting, customName, levels };
  const name = meeting === ANOTHER ? customName.trim() : meeting;
  const states = Object.fromEntries(STEPS.map((s) => [s.key, stateOf(s.key, step, flow)])) as Record<Step, StepState>;

  const forgetLevels = () => {
    setLevels(NO_LEVELS);
    setTried((t) => new Set([...t].filter((s) => s !== "stakes")));
  };

  const next = () => {
    const missing = missingOn(step, flow);
    if (missing) {
      // Committed before focus moves, so the focused control already carries its error to announce.
      flushSync(() => setTried((t) => new Set(t).add(step)));
      focusQuestion(missing);
      return;
    }
    setStep(nextOf(step));
  };

  return {
    step, states, name, meeting, customName, levels,
    errors: errorsOf(tried, flow),
    ready: stepDone(step, flow),
    // A different meeting starts with its bars unset: the last meeting's levels are not this one's.
    // That holds for a typed name too, so retyping it is a different meeting.
    setMeeting: (m: string) => {
      if (m === meeting) return;
      setMeeting(m);
      forgetLevels();
      // A fresh choice answers the refused Continue; a name field it reveals starts clean until Continue is pressed again.
      setTried((t) => new Set([...t].filter((s) => s !== "meeting")));
    },
    setCustomName: (s: string) => {
      if (s.trim() !== customName.trim()) forgetLevels();
      setCustomName(s);
    },
    setLevel: (k: DimensionKey, l: Level) => setLevels((all) => ({ ...all, [k]: l })),
    goTo: (target: Step) => {
      if (canOpen(target, flow)) setStep(target);
    },
    next,
  };
}

export type MeetingFlow = ReturnType<typeof useMeetingFlow>;
