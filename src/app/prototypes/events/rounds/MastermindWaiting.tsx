/**
 * @file MastermindWaiting.tsx
 * @description P1529: what the mastermind's round card shows to someone who is not seated: before round 1, "between rounds" (a round
 * ended, the host has not ended the evening), a round running without them, and the evening's end, in one order: the state, the owner's task, and the other canvases collapsed at the bottom. Wording is a draft:
 * [FOUNDER DECISION: copy, proposed].
 */
import type { ReactNode } from 'react';
import type { EventRound } from '@/app/data/event-rounds-service';
import { nextRoundLabel, roundLabel } from '@/lib/round-numbering';
import { waitingWords } from './mastermind-round-helpers';
import { MastermindOtherCanvases } from './MastermindOtherCanvases';

export function MastermindWaiting({ eventId, rounds, round, view, showWaiting, between, over, updateStepOn, task }: {
  eventId: string;
  rounds: EventRound[];
  /** The round that is on, if any. */
  round: EventRound | undefined;
  view: 'table' | 'compare' | 'hidden';
  /** The waiting card applies (not seated, not over) and the evening's end is known when it matters. */
  showWaiting: boolean;
  /** Between rounds: the newest round ended and the evening has not. */
  between: boolean;
  /** The evening is over (the host ended it, or the event closed). */
  over: boolean;
  updateStepOn: boolean;
  task: ReactNode;
}) {
  const last = rounds[rounds.length - 1];
  const words = waitingWords({
    runningLabel: round ? roundLabel(rounds, round) : null,
    showcase: !!round?.showcase,
    betweenLabel: between && last ? roundLabel(rounds, last) : null,
    nextLabel: nextRoundLabel(rounds, false),
  });
  const card = showWaiting && view === 'table' && (
    <section className="rounded-xl border border-border bg-card p-5" data-testid={between ? 'mastermind-between' : 'mastermind-waiting'}>
      <h2 className="text-xl font-semibold">{words.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{words.body}</p>
    </section>
  );
  // The host ended the evening: the room moves to Feedback by itself; this is what shows where Feedback is not on screen.
  const end = over && view === 'table' && (
    <section className="rounded-xl border border-border bg-card p-5" data-testid="mastermind-over">
      <h2 className="text-xl font-semibold">The rounds are over</h2>
    </section>
  );
  // One focus at a time: the state, then the owner's task, then (collapsed) the other canvases as a backup.
  const backup = card && <MastermindOtherCanvases eventId={eventId} />;
  return updateStepOn ? <>{task}{card}{backup}</> : <>{end}{card}{task}{backup}</>;
}
