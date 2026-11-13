/**
 * @file MastermindWaiting.tsx
 * @description P1529: what the mastermind's round card shows to someone who is not seated: before round 1, "between rounds" (a round
 * ended, the host has not ended the evening), a round running without them, and the evening's end, in one order: the state, the owner's task, and the other canvases collapsed at the bottom. Wording is a draft:
 * [FOUNDER DECISION: copy, proposed].
 */
import type { ReactNode } from 'react';
import { OpenYourCanvas } from './OpenYourCanvas';
import type { EventRound } from '@/app/data/event-rounds-service';
import { EVENING_OVER } from './mastermind-round-helpers';
import { discussionRoundLabel, nextDiscussionRoundLabel } from './mastermind-host-helpers';
import { waitingWords } from './mastermind-round-helpers';
import { MastermindOtherCanvases } from './MastermindOtherCanvases';

export function MastermindWaiting({ eventId, rounds, round, view, showWaiting, between, over, task, canvasHref = null, linkState }: {
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
  task: ReactNode;
  /** The person's own canvas at this event (null: none): between rounds it is one tap away (P1529 G5). */
  canvasHref?: string | null;
  linkState?: unknown;
}) {
  const last = rounds[rounds.length - 1];
  const words = waitingWords({
    runningLabel: round ? discussionRoundLabel(rounds, round) : null,
    showcase: !!round?.showcase,
    betweenLabel: between && last ? discussionRoundLabel(rounds, last) : null,
    nextLabel: nextDiscussionRoundLabel(rounds, false),
  });
  // Between rounds, the way to my canvas, inside the "is over" card (a next-version card carries its own).
  const openCanvas = (between ? showWaiting : over) && view === 'table' && canvasHref && <OpenYourCanvas href={canvasHref} linkState={linkState} testId={between ? 'mastermind-between-canvas' : 'mastermind-over-canvas'} />;
  // One focus between rounds: the owner's card if there is one, else "{round} is over".
  const card = showWaiting && view === 'table' && !task && (
    <section className="rounded-xl border border-border bg-card p-5" data-testid={between ? 'mastermind-between' : 'mastermind-waiting'}>
      <h2 className="text-xl font-semibold">{words.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{words.body}</p>
      {openCanvas}
    </section>
  );
  // The host ended the evening: people land on Feedback, and Table stays tappable with this line, the next-version card and the way to the canvas (H3).
  // With a next-version card the heading is inside that card (one card, not an empty one above it).
  const end = over && view === 'table' && !task && (
    <section className="rounded-xl border border-border bg-card p-5" data-testid="mastermind-over">
      <h2 className="text-xl font-semibold">{EVENING_OVER}</h2>
      {openCanvas}
    </section>
  );
  // One focus at a time: the state, then the owner's task, then (collapsed) the other canvases as a backup.
  const backup = (card || (showWaiting && view === 'table' && task)) && <MastermindOtherCanvases eventId={eventId} />;
  // The next-version card is Table's: Feedback (view hidden) shows feedback only, plus a link to Table (H3).
  return <>{end}{card}{view === 'table' && task}{backup}</>;
}
