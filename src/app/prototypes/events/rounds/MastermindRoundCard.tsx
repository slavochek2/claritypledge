/**
 * @file MastermindRoundCard.tsx
 * @description P1529 §5 (D1, D3, D5, D19): the sales mastermind's round screen. A seated person sees the table, who they are
 * with, their role, whose Clarity Canvas the table is about, one rule line for the role, and (for their partner and the
 * observers) a link to that canvas. It asks for nothing: no confirm, no half-time swap, no phase, no sliders. The two
 * contracts the room page depends on are kept from RoundCard: it owns the round poll, and it reports the moment upward.
 * Two differences in the moment, on purpose: `atTable` is never true (there is no "we're seated" tap, and no statement
 * Compare step for this flow), and the host's canvas-update step is not "the evening is over". Sibling of RoundCard.tsx,
 * chosen by FlowRoundCard.tsx. Wording is a draft: [FOUNDER DECISION: copy].
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EventCanvasCard } from '../prep/EventCanvasCard';
import { currentRound, EMPTY_ROUNDS_STATE, type EventRoundsState } from '@/app/data/event-rounds-service';
import { recordCanvasOpen } from '@/app/data/event-mastermind-service';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { workspaceHref } from '@/lib/canvas-hrefs';
import { nextRoundLabel, roundLabel } from '@/lib/round-numbering';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import type { RoundMoment } from './RoundCard';
import { roundsPolling, shortName, useEventRounds } from './use-event-rounds';
import { useOwnerUpdate, useRoundCanvas, useUpdateStep } from './use-mastermind-round';
import { MastermindUpdateTask } from './MastermindUpdateTask';
import { useTaskOpen } from './task-open-store';
import { RULE_LINE, mastermindTable, roleLine, taskFace, updateStepOn, withLine } from './mastermind-round-helpers';

export function MastermindRoundCard({
  eventId,
  self,
  roster,
  ended = false,
  view,
  onMoment,
  onRoundsStarted,
}: {
  eventId: string;
  self: EventRoomSelf | null;
  roster: EventRoomMember[];
  /** After the event: no live round, nothing to show. */
  ended?: boolean;
  view: 'table' | 'compare' | 'hidden';
  onMoment?: (moment: RoundMoment) => void;
  /** Whether any round has started: the room's optional preparation line steps aside once one has. */
  onRoundsStarted?: (started: boolean) => void;
}) {
  // The same poll as RoundCard: a round the host still runs outlives the clock's close.
  const [liveSeen, setLiveSeen] = useState(false);
  const [rounds, setRounds] = useState<EventRoundsState>(EMPTY_ROUNDS_STATE);
  const polling = roundsPolling({ ended, liveSeen, state: rounds, now: Date.now() });
  const { state } = useEventRounds(eventId, !!self, polling.active, polling);
  useEffect(() => { setRounds(state); }, [state]);
  const round = currentRound(state);
  const live = !!round;
  useEffect(() => { setLiveSeen(live); }, [live]);
  const mine = round && self ? (state.seatsByRound.get(round.id) ?? []).find(s => s.id === self.id) : undefined;
  const seated = !!round && !!mine;
  const last = state.rounds[state.rounds.length - 1];
  const roundsKey = `${last?.id ?? ''}:${last?.endedAt ?? ''}`;

  const step = useUpdateStep(eventId, !!self, roundsKey);
  const stepOn = updateStepOn(step, state.rounds);
  const eveningOver = !ended && !round && state.rounds.length > 0 && !stepOn;
  const waiting = !seated && !eveningOver && !(ended && !live);
  useEffect(() => {
    onMoment?.({ seated, atTable: false, eveningOver, live, waiting });
  }, [onMoment, seated, eveningOver, live, waiting]);

  const started = state.rounds.length > 0;
  useEffect(() => { onRoundsStarted?.(started); }, [onRoundsStarted, started]);

  const owner = useOwnerUpdate(eventId, !!self, roundsKey);
  const isOwner = mine?.role === 'first';
  const { canvas, loaded, failed: canvasFailed, retry: retryCanvas } = useRoundCanvas(seated && !isOwner ? round?.id ?? null : null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useTaskOpen(`${eventId}:${owner.offer?.roundId ?? ''}`);

  if (!self) return null;

  const name = (id: string | undefined) => shortName(roster.find(m => m.id === id)?.displayName ?? '');
  const face = taskFace(owner.offer, owner.update);
  const offerRound = state.rounds.find(r => r.id === owner.offer?.roundId);
  const mySlug = roster.find(m => m.id === self.id)?.profileSlug ?? self.profileSlug;
  const tweakHref = mySlug && owner.draft?.canvasName ? workspaceHref(mySlug, owner.draft.canvasName, owner.draft.versionName) : null;
  const task = face && (
    <MastermindUpdateTask
      face={face}
      owner={owner}
      inStep={stepOn && !seated}
      collapsed={seated}
      roundName={offerRound ? roundLabel(state.rounds, offerRound) : null}
      tweakHref={tweakHref}
      open={taskOpen}
      setOpen={setTaskOpen}
    />
  );

  if (!seated || !mine) {
    const card = waiting && view === 'table' && (
      <section className="rounded-xl border border-border bg-card p-5" data-testid="mastermind-waiting">
        <h2 className="text-xl font-semibold">
          {!round
            ? `${nextRoundLabel(state.rounds, false)} starts soon`
            : round.showcase
              ? 'Demo · You watch'
              : `${roundLabel(state.rounds, round)} · You join the next round`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {!round ? 'The host starts it. Your table and role appear here.' : 'Your table appears here when the next round starts.'}
        </p>
      </section>
    );
    // No close in the app for this flow (the exit card is on paper): the room just says the rounds are done.
    const over = (eveningOver || (ended && !live)) && view === 'table' && (
      <section className="rounded-xl border border-border bg-card p-5" data-testid="mastermind-over">
        <h2 className="text-xl font-semibold">The rounds are over</h2>
      </section>
    );
    return stepOn ? <>{task}{card}</> : <>{over}{card}{task}</>;
  }
  if (view === 'hidden') return <>{task}</>;

  const table = mastermindTable((state.seatsByRound.get(round.id) ?? []).filter(s => s.table === mine.table), mine);
  const ownerName = name(table.owner?.id);
  const link = canvas?.shared && canvas.canvasName ? canvasPageHref(canvas.ownerSlug, canvas.canvasName) : null;

  return (
    <>
      <section className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm" data-testid="mastermind-round-card" data-role={table.role}>
        <h2 className="text-3xl font-semibold" data-testid="round-card-table">Table {mine.table}</h2>
        <p className="mt-1 text-base font-medium break-words" data-testid="round-card-role">
          {table.owner ? roleLine(table.role, ownerName, name(table.partner?.id)) : 'The host is still setting up your table'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground break-words" data-testid="round-card-with">{withLine(table.others.map(s => name(s.id)))}</p>
        <p className="mt-3 rounded-lg bg-muted px-4 py-3 text-sm" data-testid="round-card-rule">{RULE_LINE[table.role]}</p>

        {table.role !== 'owner' && loaded && canvas && (
          link ? (
            <Link
              to={link}
              className="mt-3 inline-flex min-h-10 items-center break-words text-sm font-medium text-blue-600"
              // Evidence, never a gate: the open is recorded beside the navigation, which it can never stop.
              onClick={() => { try { recordCanvasOpen(round.id, canvas.ownerProfileId); } catch { /* not a gate */ } }}
              data-testid="round-canvas-link"
            >
              Open {ownerName}&rsquo;s Clarity Canvas
            </Link>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="round-canvas-unshared">This Clarity Canvas is no longer shared</p>
          )
        )}

        {table.role !== 'owner' && canvasFailed && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" role="alert" data-testid="round-canvas-error">
            <span>Could not load this Clarity Canvas.</span>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retryCanvas} data-testid="round-canvas-retry">Retry</Button>
          </div>
        )}

        {table.role !== 'owner' && (
          <div className="mt-2">
            {/* D5, D9, D17: observers and people with no canvas yet reach their own canvas card from here, one quiet tap. */}
            <button
              type="button"
              className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline"
              aria-expanded={canvasOpen}
              onClick={() => setCanvasOpen(o => !o)}
              data-testid="round-canvas-card-toggle"
            >
              Your Clarity Canvas{/* [FOUNDER DECISION: copy, proposed] */}
            </button>
            {canvasOpen && <div className="mt-2"><EventCanvasCard eventId={eventId} /></div>}
          </div>
        )}
      </section>
      {task}
    </>
  );
}
