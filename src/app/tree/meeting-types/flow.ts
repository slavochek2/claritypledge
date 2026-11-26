/** The /meeting-types steps and which of them a host can open, derived from the answers (never stored). */
import { ANOTHER, DIMENSIONS, isComplete, type DimensionKey, type Levels } from "./model";

export type Step = "meeting" | "stakes" | "impact";
export const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: "meeting", label: "Meeting" },
  { key: "stakes", label: "Stakes" },
  { key: "impact", label: "Impact" },
];

export type StepState = "current" | "done" | "open" | "ahead";

export type FlowInput = { meeting: string; customName: string; levels: Levels };

const meetingDone = (f: FlowInput) => f.meeting !== "" && (f.meeting !== ANOTHER || f.customName.trim() !== "");

/** Whether a step's own answers are all given, so its Continue goes on. */
export const stepDone = (step: Step, f: FlowInput) => (step === "meeting" ? meetingDone(f) : step === "stakes" ? meetingDone(f) && isComplete(f.levels) : false);

/** A step opens once every step before it is done, so a stale impact is never reachable. */
export function canOpen(step: Step, f: FlowInput): boolean {
  const before = STEPS.slice(0, STEPS.findIndex((s) => s.key === step));
  return before.every((s) => stepDone(s.key, f));
}

export function stateOf(step: Step, shown: Step, f: FlowInput): StepState {
  if (step === shown) return "current";
  if (!canOpen(step, f)) return "ahead";
  return stepDone(step, f) ? "done" : "open";
}

export const nextOf = (step: Step): Step => (step === "meeting" ? "stakes" : "impact");
export const backOf = (step: Step): Step | null => (step === "impact" ? "stakes" : step === "stakes" ? "meeting" : null);

/** The first unanswered question on a step (its data-question key), or undefined when Continue may go on. */
export function missingOn(step: Step, f: FlowInput): string | undefined {
  if (step === "meeting") return f.meeting === "" ? "meeting" : !meetingDone(f) ? "name" : undefined;
  if (step === "stakes") return DIMENSIONS.find((d) => f.levels[d.key] === null)?.key;
  return undefined;
}

export type Errors = { meeting?: string; name?: string } & Partial<Record<DimensionKey, string>>;

/** Inline errors, shown only on a step where Continue was already pressed with something missing. */
export function errorsOf(tried: ReadonlySet<Step>, f: FlowInput): Errors {
  const e: Errors = {};
  if (tried.has("meeting")) {
    if (f.meeting === "") e.meeting = "Choose a meeting.";
    else if (!meetingDone(f)) e.name = "Type the meeting's name.";
  }
  if (tried.has("stakes")) for (const d of DIMENSIONS) if (f.levels[d.key] === null) e[d.key] = "Set this one.";
  return e;
}
