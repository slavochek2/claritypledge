/**
 * The /tree/meeting-stakes step bar. It copies the look of the event room's bar
 * (src/app/prototypes/events/rounds/RoomSteps.tsx: small labels, a blue underline under the
 * shown step, a tick on done steps), whose step keys are fixed to the room, so it cannot be
 * imported here. Unlike the room's, a step that cannot be opened is a plain label, not a
 * disabled button.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, type Step, type StepState } from "./flow";

const SUFFIX: Record<StepState, string> = { current: "", done: ", done", open: "", ahead: ", not reached yet" };

export function StepBar({ states, onSelect }: { states: Record<Step, StepState>; onSelect: (s: Step) => void }) {
  return (
    <nav aria-label="Steps" className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4">
      <ol className="mx-auto grid max-w-2xl grid-cols-3 gap-1">
        {STEPS.map(({ key, label }, i) => {
          const state = states[key];
          const text = (
            <>
              <span
                className={cn(
                  "inline-flex items-center justify-center gap-1 text-xs leading-tight sm:text-sm",
                  state === "current" ? "font-semibold text-foreground" : state === "done" || state === "open" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {state === "done" && <Check className="h-3 w-3 shrink-0 text-blue-600" strokeWidth={3} aria-hidden="true" />}
                <span aria-hidden="true">{i + 1}.</span>
                {label}
                <span className="sr-only">{SUFFIX[state]}</span>
              </span>
              <span aria-hidden="true" className={cn("h-0.5 rounded-full", state === "current" ? "bg-blue-600" : "bg-transparent")} />
            </>
          );
          const box = "flex min-h-11 w-full flex-col items-stretch justify-between gap-1 rounded-md px-1 pt-2 text-center";
          const clickable = state === "done" || state === "open";
          return (
            <li key={key} aria-current={state === "current" ? "step" : undefined}>
              {clickable ? (
                <button type="button" onClick={() => onSelect(key)} className={cn(box, "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500")}>
                  {text}
                </button>
              ) : (
                <div className={box}>{text}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
