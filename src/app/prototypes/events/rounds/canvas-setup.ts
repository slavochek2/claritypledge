/**
 * @file canvas-setup.ts
 * @description P1529 E5: the "Make your Clarity Canvas" part, apart from any component: when it applies, its words, the count, and the
 * one read every surface (host, projector, phones) shares. Every sentence is a draft: [FOUNDER DECISION: copy, proposed].
 * Time running out never blocks anything: the part only changes what is shown.
 */
import { useCallback } from 'react';
import { useEffect, useState } from 'react';
import { getMyEventCanvas } from '@/app/data/event-mastermind-service';
import { hostEndCanvasSetup, hostStartCanvasSetup } from '@/app/data/event-canvas-setup-service';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import { canvasTimingOf } from '@/app/types/event-fields';
import { whenVisible } from '../when-visible';
import { useNow } from './use-event-rounds';

/** The host's default for the part, in seconds (10 minutes, as the published agenda says); 0 skips it. */
export const CANVAS_SETUP_SECONDS = 10 * 60;

/** [FOUNDER DECISION: copy, proposed] */
export const CANVAS_SETUP_COPY = {
  title: 'Make your Clarity Canvas',
  screenLine: 'Open your phone: your mirror agent helps you write it. Share it with the event when it is ready.',
  start: 'Start canvas setup',
  end: 'End setup',
  setting: 'Canvas setup',
  open: 'Open your mirror agent',
  shared: 'Your Clarity Canvas is shared with this event ✓',
  observer: 'Help the people next to you make their canvas',
  left: 'left',
  failed: 'That didn’t save. Try again.',
  readFailed: 'Couldn’t read canvas setup',
  retry: 'Retry',
  skip: 'Skip setup',
  retryPrimary: 'Retry reading canvas setup',
  loading: 'Loading…',
};
export const setupCountLine = (n: number, m: number): string => `${n} of ${m} have a Clarity Canvas`;

/** Where the Clarity Canvas is made, from the event (the canonical reading of the column). */
export const eventCanvasTiming = (event: { canvasTiming?: string | null } | null | undefined): 'before' | 'at_event' => canvasTimingOf(event?.canvasTiming);

/** The part applies: the mastermind, the canvas made at the event, and no round has started (it only runs before round 1). */
export const setupApplies = (a: { mastermind: boolean; timing: 'before' | 'at_event'; roundsStarted: boolean }): boolean => a.mastermind && a.timing === 'at_event' && !a.roundsStarted;

export type SetupPhase = 'off' | 'before' | 'running' | 'over';
/**
 * `off` the part does not apply (or the host set 0 minutes and never started it); `before` it applies and has not started;
 * `running` the end is ahead; `over` it ran (ended or timed out). `endsAt` undefined = not read yet, which is `off` (never a flash of it).
 */
export function setupPhase(a: { applies: boolean; endsAt: number | null | undefined; now: number; skip?: boolean }): SetupPhase {
  if (!a.applies || a.endsAt === undefined) return 'off';
  if (a.endsAt === null) return a.skip ? 'off' : 'before';
  return a.endsAt > a.now ? 'running' : 'over';
}

/** People who should have a canvas by the end of the setup: registered, coming, and not helping as an observer. */
const needsCanvas = (p: MastermindPerson): boolean => p.registered && p.waitingPosition === null && p.participation !== 'observer';
/** "N of M have a Clarity Canvas": M the people who make one, N those of them with a canvas shared with the event. */
export function setupCounts(people: MastermindPerson[]): { n: number; m: number } {
  const makers = people.filter(needsCanvas);
  return { n: makers.filter(p => p.canvasShared).length, m: makers.length };
}

export interface CanvasSetupActions {
  start: (seconds: number) => Promise<void>;
  end: () => Promise<void>;
}

/** The host's two writes. What they changed comes back on the rounds read's next tick, and is read at once here (`refreshRounds`). */
export function useCanvasSetupActions(eventId: string | undefined, refreshRounds: () => Promise<void>): CanvasSetupActions {
  const start = useCallback(async (seconds: number) => {
    if (!eventId) return;
    await hostStartCanvasSetup(eventId, seconds);
    await refreshRounds();
  }, [eventId, refreshRounds]);
  const end = useCallback(async () => {
    if (!eventId) return;
    await hostEndCanvasSetup(eventId);
    await refreshRounds();
  }, [eventId, refreshRounds]);
  return { start, end };
}

/** The phase now, ticking each second while it runs. */
/** `endsAt` comes from the rounds read (`EventRoundsState.canvasSetupEnd`): undefined = not read. */
export function useSetupPhase(endsAt: number | null | undefined, applies: boolean, skip = false): { phase: SetupPhase; leftMs: number } {
  const running = applies && typeof endsAt === 'number';
  const now = useNow(running);
  const phase = setupPhase({ applies, endsAt, now, skip });
  return { phase, leftMs: running ? Math.max(0, (endsAt as number) - now) : 0 };
}

/** Whether my canvas is shared with the event (the Canvas tab's tick). Read when it is turned on and each time `again` changes; a failed read keeps what is shown. */
export function useMyCanvasShared(eventId: string | undefined, enabled: boolean, again: unknown): [boolean, (shared: boolean) => void] {
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!enabled || !eventId) return;
    let cancelled = false;
    // A hidden tab makes no request: the read waits until the tab is seen.
    const cancelWait = whenVisible(() => {
      getMyEventCanvas(eventId).then(c => { if (!cancelled) setShared(!!c?.shared); }).catch(() => undefined);
    });
    return () => { cancelled = true; cancelWait(); };
  }, [enabled, eventId, again]);
  return [shared, setShared];
}
