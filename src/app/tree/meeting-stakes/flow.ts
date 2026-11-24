/** The /tree/meeting-stakes steps and which of them a host can open, derived from the answers (never stored). */
import { CONDITIONS, isComplete, type Answers, type ConditionKey, type Gate } from "./model";

export type Step = "meeting" | "stakes" | "cost" | "result";
export const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: "meeting", label: "Meeting" },
  { key: "stakes", label: "Stakes" },
  { key: "cost", label: "Cost" },
  { key: "result", label: "Result" },
];

export type StepState = "current" | "done" | "open" | "skipped" | "ahead";

export type FlowInput = { meeting: string; gate: Gate | null; answers: Answers; visited: ReadonlySet<Step> };

export const meetingDone = (f: FlowInput) => f.meeting !== "" && f.gate !== null;
const stakesDone = (f: FlowInput) => meetingDone(f) && f.gate === "yes" && isComplete(f.answers);

/** Clearing an upstream answer closes every step after it again, so a stale result is never reachable. */
export function canOpen(step: Step, f: FlowInput): boolean {
  switch (step) {
    case "meeting":
      return true;
    case "stakes":
      return meetingDone(f) && f.gate === "yes";
    case "cost":
      return stakesDone(f) && f.visited.has("cost");
    case "result":
      return meetingDone(f) && (f.gate === "no" || (stakesDone(f) && f.visited.has("result")));
  }
}

export function stateOf(step: Step, shown: Step, f: FlowInput): StepState {
  if (step === shown) return "current";
  if (f.gate === "no" && (step === "stakes" || step === "cost")) return "skipped";
  if (!canOpen(step, f)) return "ahead";
  const done = step === "meeting" ? meetingDone(f) : step === "stakes" ? stakesDone(f) : step === "cost" && f.visited.has("result");
  return done ? "done" : "open";
}

/** Where Next goes from each step. */
export function nextOf(step: Step, f: FlowInput): Step {
  if (step === "meeting") return f.gate === "no" ? "result" : "stakes";
  if (step === "stakes") return "cost";
  return "result";
}

export function backOf(step: Step, f: FlowInput): Step | null {
  if (step === "meeting") return null;
  if (step === "result") return f.gate === "no" ? "meeting" : "cost";
  return step === "cost" ? "stakes" : "meeting";
}

/** The first unanswered question on a step (its data-question key), or undefined when Next may go on. */
export function missingOn(step: Step, f: FlowInput): string | undefined {
  if (step === "meeting") return f.meeting === "" ? "meeting" : f.gate === null ? "gate" : undefined;
  if (step === "stakes") return CONDITIONS.find((c) => f.answers[c.key] === null)?.key;
  return undefined;
}

export type Errors = { meeting?: string; gate?: string } & Partial<Record<ConditionKey, string>>;

/** Inline errors, shown only on a step where Next was already pressed with something missing. */
export function errorsOf(tried: ReadonlySet<Step>, f: FlowInput): Errors {
  const e: Errors = {};
  if (tried.has("meeting")) {
    if (f.meeting === "") e.meeting = "Choose a meeting.";
    if (f.gate === null) e.gate = "Answer yes or no.";
  }
  if (tried.has("stakes")) for (const c of CONDITIONS) if (f.answers[c.key] === null) e[c.key] = "Pick an answer.";
  return e;
}
