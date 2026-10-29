/**
 * @file use-auto-finish.ts
 * @description The learning's finished steps (`useStepsDone`) and what happens when they are all finished already
 * (`useAutoFinish`).
 *
 * `useAutoFinish`: P1542 founder UAT round (2026-10-29, founder: the all-ticked "Finish" screen is confusing): when every
 * step of a hike's learning is already finished — done elsewhere, at another event or on /prepare — opening Learn
 * records the completion and goes straight to the end screen, the one a normal finish shows. There is no agenda with
 * every step ticked and no button to press. The finished steps stay reopenable from the end (decision A).
 *
 * Fires once, only from the step list (the screen the learning opens on), never mid-step, and only from a visible tab.
 * While the completion is being recorded the list is not drawn (`pending`). If the save fails the list comes back, and
 * its own "Start now" retries (it goes to the end, which records the completion) — round 3 (C), tested.
 */
import { useEffect, useRef, useState } from 'react';
import type { PrepPatch, PrepStepKey } from '@/app/data/event-prep-service';
import { recipeFor } from '../series-recipes';
import { whenVisible } from '../when-visible';
import { mergeDone, type PlanStep } from './prep-plan';

/** The flow's finished steps. P1542 (A) review: parts that load or reload later (a sync, another tab) join the finished
 *  steps — never removing one (`mergeDone`). */
export function useStepsDone(plan: PlanStep[], fromState: PrepStepKey[] | undefined) {
  const [stepsDone, setStepsDone] = useState<PrepStepKey[]>(fromState ?? []);
  useEffect(() => {
    setStepsDone((prev) => mergeDone(plan, prev, fromState ?? []));
  }, [plan, fromState]);
  return [stepsDone, setStepsDone] as const;
}

/** `screen`: the flow's current screen — it fires only on the step list ('plan', where the learning opens).
 *  `go`: the flow's own move; `go('end', …)` records completion, then shows the end. */
export function useAutoFinish(
  seriesSlug: string | null | undefined,
  prep: { completedAt?: string | null; startedAt?: string | null } | null | undefined,
  screen: string,
  plan: readonly string[],
  stepsDone: PrepStepKey[],
  go: (next: 'end', done: PrepStepKey[], extra: PrepPatch) => Promise<unknown>,
  /** Inside the room: shown or not (round 4, R5) — a learning hidden under another room view finishes nothing. */
  room?: { active: boolean },
): boolean {
  const allDone = plan.length > 0 && plan.every((s) => stepsDone.includes(s as PrepStepKey));
  const active = recipeFor(seriesSlug).prepare.keepFinished === true && !prep?.completedAt && screen === 'plan' && allDone && room?.active !== false;
  const started = useRef(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active || started.current) return;
    // Round 3 (B, metered rule 3): no write from a hidden tab — it waits until the tab is seen; unmount cancels it.
    return whenVisible(() => {
      started.current = true;
      void go('end', stepsDone, { prepChoice: 'now', startedAt: prep?.startedAt ?? new Date().toISOString() }).finally(() => setSettled(true));
    });
  }, [active, go, stepsDone, prep?.startedAt]);
  return active && !settled;
}
