/**
 * @file prep-resume.ts
 * @description Which screen the event preparation opens on (the page's mount, e.g. after Publish returns from the canvas workspace), and the plan's total minutes.
 * `current_step` never holds 'canvas' (its CHECK refuses it), so an owner who finished the learning resumes on the canvas step because
 * it is the first plan step not in `steps_done`, not because it was stored.
 */
import type { PlanStep } from './prep-plan';

export type PrepScreen = 'plan' | PlanStep | 'end';

export function resumeScreenOf(args: {
  completedAt?: string | null; startedAt?: string | null; currentStep: string | null | undefined;
  plan: PlanStep[]; stepsDone: readonly string[]; keepFinished: boolean;
}): PrepScreen {
  const { completedAt, startedAt, currentStep, plan, stepsDone, keepFinished } = args;
  if (completedAt) return 'end';
  if (!startedAt) return 'plan';
  const current = currentStep as PlanStep | null;
  if (current && plan.includes(current) && !stepsDone.includes(current)) return current;
  // P1542 (A): everything finished elsewhere but not recorded → the list, which records it at once (useAutoFinish).
  return plan.find((s) => !stepsDone.includes(s)) ?? (keepFinished ? 'plan' : 'end');
}

/**
 * The plan's total minutes. The sales mastermind (founder, 2026-11-09): before starting, one total for the role (`roleMinutes`, null until
 * the role is read) and no row minutes; once started, no total at all. Every other flow: the rows still to do (`computed`), capped
 * at the recipe's `statedMinutes` when it has one (hike, Clarity Night: 15), so the total is never above the stated number and only
 * shrinks; null while `computed` is unknown. `untouched` matters only to the mastermind.
 */
export function planTotalMinutes(args: { mastermind: boolean; untouched: boolean; roleMinutes: number | null; computed: number | null; statedMinutes?: number; brandNew?: boolean }): number | null {
  const { mastermind, untouched, roleMinutes, computed, statedMinutes, brandNew } = args;
  if (!mastermind) {
    if (computed === null || statedMinutes === undefined) return computed;
    // A brand-new person is told the stated length itself (founder: "15 minutes is normal", never 14).
    return brandNew ? statedMinutes : Math.min(computed, statedMinutes);
  }
  return untouched ? roleMinutes : null;
}

/** Whether the agenda shows only the total (no per-row minutes): the mastermind, or the stated number is the one shown. */
export function planTotalOnly(args: { mastermind: boolean; computed: number | null; statedMinutes?: number; brandNew?: boolean }): boolean {
  const { mastermind, computed, statedMinutes, brandNew } = args;
  return mastermind || (computed !== null && statedMinutes !== undefined && (!!brandNew || computed > statedMinutes));
}
