/**
 * @file MastermindRoundCard.tsx
 * @description P1529 §5 (D1, D3, D5, D19; redesigned UAT 2026-11-11): the sales mastermind's round screen. A seated person sees the header
 * (table, time left, part of the round), their own role (with an (i) popover), everyone at the table, ONE instruction
 * for their role in the current part, and the table's canvas as one primary button ("See other canvases" is a
 * centred link that lists the other shared canvases, each its own link; it never changes the button or seating). It asks for nothing: no confirm, no half-time swap, no sliders. The two
 * contracts the room page depends on are kept from RoundCard: it owns the round poll, and it reports the moment upward.
 * Two differences in the moment, on purpose: `atTable` is never true (there is no "we're seated" tap, and no statement
 * Compare step for this flow). Between rounds it also shows the owner's next-version card (one per owned round, never during a running round). Sibling of RoundCard.tsx,
 * chosen by FlowRoundCard.tsx. Wording is a draft: [FOUNDER DECISION: copy].
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { currentRound, EMPTY_ROUNDS_STATE, type EventRoundsState } from '@/app/data/event-rounds-service';
import { recordCanvasOpen } from '@/app/data/event-mastermind-service';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { tableLinkState } from '@/lib/canvas-hrefs';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import type { RoundMoment } from './RoundCard';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { firstName, roundsPolling, shortName, useEventRounds, useNow } from './use-event-rounds';
import { useEventCanvasChoices, useOwnerUpdate, useRoundCanvas, useRoundsGap } from './use-mastermind-round';
import { offerCards } from './mastermind-offer-cards';
import { MISSING_NAME, NO_CANVAS_OWNER_LINE, NO_CANVAS_TABLE_LINE, canvasOffer, instructionLine, mastermindTable } from './mastermind-round-helpers';
import { buildFaces, CanvasOpen, InstructionBox, MyRole, OtherCanvases, TablePeople, TableStatus } from './table-card-parts';
import { useReadingPoints } from './use-reading-points';
import { MastermindReadingList } from './MastermindReadingList';
import { MastermindWaiting } from './MastermindWaiting';
import { useRoomCapture } from '@/app/contexts/room-capture-context';

export function MastermindRoundCard({
  eventId,
  self,
  roster,
  ended = false,
  view,
  onMoment,
  onRoundsStarted,
  feedbackSlot = null,
  canvasSetup,
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
  /** The room's Feedback tab: the slot after the feedback block, where the next-version card is portalled (null: in place). */
  feedbackSlot?: HTMLElement | null;
  /** P1529 E5: set when the canvas is made at the event: this card's rounds read also returns the setup's end, reported here (true: read, report nowhere). */
  canvasSetup?: true | ((endsAt: number | null | undefined) => void);
}) {
  // The same poll as RoundCard: a round the host still runs outlives the clock's close.
  const [liveSeen, setLiveSeen] = useState(false);
  const [rounds, setRounds] = useState<EventRoundsState>(EMPTY_ROUNDS_STATE);
  const polling = roundsPolling({ ended, liveSeen, state: rounds, now: Date.now() });
  const { state } = useEventRounds(eventId, !!self, polling.active, { ...polling, withCanvasSetup: !!canvasSetup });
  const reportSetup = typeof canvasSetup === 'function' ? canvasSetup : undefined;
  useEffect(() => { reportSetup?.(state.canvasSetupEnd); }, [reportSetup, state.canvasSetupEnd]);
  useEffect(() => { setRounds(state); }, [state]);
  const { pathname } = useLocation();
  // The canvas opened from here says where the table is, so its page can offer "Back to your table".
  const fromRoom = tableLinkState(pathname, eventId);
  const round = currentRound(state);
  const live = !!round;
  // Founder 2026-11-12 (option B): while seated in a live round with the mic not running, "Start your mic" is the one filled primary.
  const capturing = useRoomCapture().isCapturingForEvent(eventId);
  useEffect(() => { setLiveSeen(live); }, [live]);
  const mine = round && self ? (state.seatsByRound.get(round.id) ?? []).find(s => s.id === self.id) : undefined;
  const seated = !!round && !!mine;
  const last = state.rounds[state.rounds.length - 1];
  const roundsKey = `${last?.id ?? ''}:${last?.endedAt ?? ''}`;

  // The gap between rounds: the evening's stamp, and what follows.
  const { eveningEnd, eveningOver, betweenRounds, idle } = useRoundsGap({ eventId, enabled: !!self, rounds: state.rounds, round, ended });
  const waiting = !seated && !eveningOver && !(ended && !live);
  useEffect(() => { onMoment?.({ seated, atTable: false, eveningOver, live, waiting }); }, [onMoment, seated, eveningOver, live, waiting]);
  const started = state.rounds.length > 0;
  useEffect(() => { onRoundsStarted?.(started); }, [onRoundsStarted, started]);

  const owner = useOwnerUpdate(eventId, !!self, roundsKey, live);
  const isOwner = mine?.role === 'first';
  // Whose canvas this is follows the seating (my table and its owner), so a move or a role swap inside a running round reads again.
  const seatKey = mine && round ? `${mine.table}|${(state.seatsByRound.get(round.id) ?? []).find(s => s.table === mine.table && s.role === 'first')?.id ?? ''}` : '';
  const { canvas, loaded, failed: canvasFailed, retry: retryCanvas } = useRoundCanvas(seated ? round?.id ?? null : null, seatKey);
  const choices = useEventCanvasChoices(eventId, seated, round?.id ?? null);
  const navigate = useNavigate();

  // The part of the round now, from the round's own clock (the same one the host and the projector read): the reading part lists points.
  const tableHasObserver = !!round && !!mine && (state.seatsByRound.get(round.id) ?? []).some(s => s.table === mine.table && s.role === 'observer');
  const now = useNow(seated);
  const clock = round && seated ? roundClock(round.startedAt, now, tableHasObserver, roundTiming(round)) : null;
  const phase = clock?.phase ?? null;
  const reading = useReadingPoints({
    enabled: phase === 'reading' && !!canvas?.shared,
    ownerId: canvas?.ownerProfileId ?? null,
    name: canvas?.canvasName ?? null,
    viewerId: self?.profileId ?? null,
    isOwner,
    roundId: round?.id ?? null,
  });

  if (!self) return null;

  const name = (id: string | undefined) => shortName(roster.find(m => m.id === id)?.displayName ?? '') || MISSING_NAME;
  const { task, readFailedCard } = offerCards({ owner, state, roster, self, live, feedbackSlot, linkState: fromRoom, navigate });

  if (!seated || !mine) {
    return (
      <>
      {readFailedCard}
      <MastermindWaiting
        eventId={eventId}
        rounds={state.rounds}
        round={round ?? undefined}
        view={view}
        // While the evening's end has not been read yet, neither "between rounds" nor "over" is said.
        showWaiting={waiting && !(idle && eveningEnd === undefined)}
        between={betweenRounds}
        over={eveningOver || (ended && !live)}
        task={task}
      />
      </>
    );
  }
  if (view === 'hidden') return null;

  const tableSeats = (state.seatsByRound.get(round.id) ?? []).filter(s => s.table === mine.table);
  const table = mastermindTable(tableSeats, mine);
  const tableOwnerId = roster.find(m => m.id === table.owner?.id)?.profileId ?? canvas?.ownerProfileId ?? null;
  const ownerName = name(table.owner?.id);
  // A table whose owner has no canvas (seated anyway): roles stay as usual, the card says what to do instead.
  const noCanvas = loaded && !!canvas && !canvas.shared && !canvas.hadCanvas;
  const first = (role: 'first' | 'second' | 'observer') => firstName(roster.find(m => m.id === tableSeats.find(s => s.role === role)?.id)?.displayName ?? '') || MISSING_NAME;
  const faces = buildFaces(tableSeats, mine.id, roster, name);
  const names = { owner: first('first'), partner: first('second') };
  const noCanvasPart = noCanvas && phase !== 'seating' && phase !== 'over' && phase !== 'observer';
  const steps = !phase ? null : noCanvasPart ? [isOwner ? NO_CANVAS_OWNER_LINE : NO_CANVAS_TABLE_LINE] : instructionLine(table.role, phase, names);
  // Every other canvas shared with the event. A failed read leaves none: the table's canvas alone, no chooser.
  const others = choices.failed || !tableOwnerId ? [] : choices.list.filter(c => c.ownerId !== tableOwnerId);
  const tableLink = canvas?.shared && canvas.canvasName ? canvasPageHref(canvas.ownerSlug, canvas.canvasName) : null;
  const otherLinks = others.map(c => ({ id: c.ownerId, label: `Open ${shortName(c.ownerName) || MISSING_NAME}\u2019s canvas`, to: canvasPageHref(c.ownerSlug ?? c.ownerId, c.name) }));

  const target = { to: tableLink, label: isOwner ? 'Open your canvas' : `Open ${ownerName}\u2019s canvas`, onOpen: table.role === 'owner' ? undefined : () => { try { recordCanvasOpen(round.id, canvas?.ownerProfileId ?? ''); } catch { /* not a gate */ } } };
  const unshared = table.owner && loaded && !!canvas && !tableLink && !noCanvas;

  return (
    <>
      <section className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm" data-testid="mastermind-round-card" data-role={table.role}>
        <TableStatus table={mine.table} clock={clock} timing={roundTiming(round)} hasObserver={tableHasObserver} />
        {!table.owner && <p className="mt-2 text-base font-medium break-words" data-testid="round-card-setup">The host is still setting up your table</p>}
        <MyRole role={table.role} />
        {steps && <InstructionBox steps={steps} />}

        {phase === 'reading' && canvas?.shared && <MastermindReadingList reading={reading} />}
        <TablePeople faces={faces} />

        {table.owner && (unshared
          ? <p className="mt-3 text-sm text-muted-foreground" data-testid="round-canvas-unshared">This Clarity Canvas is no longer shared</p>
          : loaded && canvas && <CanvasOpen micFirst={live && !capturing} offer={phase ? canvasOffer(table.role, phase) : 'primary'} target={target} linkState={fromRoom} />)}

        {canvasFailed && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" role="alert" data-testid="round-canvas-error">
            <span>Could not load this Clarity Canvas.</span>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retryCanvas} data-testid="round-canvas-retry">Retry</Button>
          </div>
        )}

        {table.owner && <OtherCanvases key={round.id} others={otherLinks} linkState={fromRoom} />}
      </section>
    </>
  );
}
