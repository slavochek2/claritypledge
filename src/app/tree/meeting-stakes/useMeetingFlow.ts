/** State and actions for /tree/meeting-stakes: one meeting at a time, saved (and updated in place) on reaching Result. */
import { useRef, useState } from "react";
import { ANOTHER, NO_ANSWERS, NO_MONEY, compute, verdictOf, type Answers, type ConditionKey, type Gate, type Money, type Saved } from "./model";
import { STEPS, errorsOf, missingOn, nextOf, stateOf, type FlowInput, type Step, type StepState } from "./flow";

/** Moves focus to the first question still unanswered, so a failed Next lands where the host has to act. */
function focusQuestion(key: string) {
  // Focus alone does not bring a visually hidden radio into view on a phone, and the sticky step bar
  // would cover a question scrolled to the top edge, so the question is centred first.
  document.querySelector(`[data-question="${key}"]`)?.scrollIntoView({ block: "center" });
  document.querySelector<HTMLElement>(`[data-question="${key}"] input, [data-question="${key}"] select`)?.focus({ preventScroll: true });
}

export function useMeetingFlow() {
  const [meeting, setMeeting] = useState("");
  const [customName, setCustomName] = useState("");
  const [gate, setGate] = useState<Gate | null>(null);
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  const [money, setMoney] = useState<Money>(NO_MONEY);
  const [visited, setVisited] = useState<ReadonlySet<Step>>(new Set());
  const [step, setStep] = useState<Step>("meeting");
  const [tried, setTried] = useState<ReadonlySet<Step>>(new Set());
  const [saved, setSaved] = useState<Saved[]>([]);
  const [draftId, setDraftId] = useState(1);
  const nextId = useRef(2);

  const flow: FlowInput = { meeting, gate, answers, visited };
  const name = meeting === ANOTHER ? customName.trim() || ANOTHER : meeting;
  const verdict = verdictOf(gate, answers);
  const states = Object.fromEntries(STEPS.map((s) => [s.key, stateOf(s.key, step, flow)])) as Record<Step, StepState>;

  const errors = errorsOf(tried, flow);

  const goTo = (target: Step) => {
    setVisited((v) => new Set(v).add(target));
    if (target === "result") {
      const { checkPerYear, atRiskPerYear } = compute(money);
      const row: Saved = { id: draftId, name, verdict, checkPerYear, atRiskPerYear };
      setSaved((all) => (all.some((s) => s.id === draftId) ? all.map((s) => (s.id === draftId ? row : s)) : [...all, row]));
    }
    setStep(target);
  };

  const next = () => {
    const missing = missingOn(step, flow);
    if (missing) {
      setTried((t) => new Set(t).add(step));
      focusQuestion(missing);
      return;
    }
    goTo(nextOf(step, flow));
  };

  const another = () => {
    setMeeting("");
    setCustomName("");
    setGate(null);
    setAnswers(NO_ANSWERS);
    // Every meeting starts blank, estimates included: nothing is pre-filled.
    setMoney(NO_MONEY);
    setVisited(new Set());
    setTried(new Set());
    setDraftId(nextId.current++);
    setStep("meeting");
  };

  return {
    step, states, name, verdict, meeting, customName, gate, answers, money, saved, draftId, errors,
    setMeeting, setCustomName, setGate,
    setAnswer: (k: ConditionKey, a: Answers[ConditionKey]) => setAnswers((r) => ({ ...r, [k]: a })),
    setMoneyField: (k: keyof Money, n: number | null) => setMoney((m) => ({ ...m, [k]: n })),
    remove: (id: number) => setSaved((all) => all.filter((s) => s.id !== id)),
    goTo, next, another,
  };
}

export type MeetingFlow = ReturnType<typeof useMeetingFlow>;
