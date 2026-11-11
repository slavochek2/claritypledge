/**
 * @file MastermindRoundCard.tsx
 * @description P1529 §5 (D1, D3, D5, D19): the sales mastermind's round screen. A seated person sees the table, whose Clarity
 * Canvas it is discussing (a native select that can show any canvas shared with the event, and never changes seating), one
 * line per person at the table in role order, and one "Open the canvas" for everyone (the owner too: their own, or the one they chose). It asks for nothing: no confirm, no half-time swap, no phase, no sliders. The two
 * contracts the room page depends on are kept from RoundCard: it owns the round poll, and it reports the moment upward.
 * Two differences in the moment, on purpose: `atTable` is never true (there is no "we're seated" tap, and no statement
 * Compare step for this flow). Between rounds it also shows the owner's next-version card (one per owned round, never during a running round). Sibling of RoundCard.tsx,
 * chosen by FlowRoundCard.tsx. Wording is a draft: [FOUNDER DECISION: copy].
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { currentRound, EMPTY_ROUNDS_STATE, type EventRoundsState } from '@/app/data/event-rounds-service';
import { recordCanvasOpen } from '@/app/data/event-mastermind-service';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { tableLinkState, workspaceHref } from '@/lib/canvas-hrefs';
import { roundLabel } from '@/lib/round-numbering';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import type { RoundMoment } from './RoundCard';
import { roundClock, roundTiming } from '@/lib/round-clock';
import { firstName, roundsPolling, shortName, useEventRounds, useNow } from './use-event-rounds';
import { useEventCanvasChoices, useOwnerUpdate, useRoundCanvas, useRoundsGap } from './use-mastermind-round';
import { useRoundMic } from './use-round-mic';
import { MastermindMicStep } from './MastermindMicStep';
import { MastermindUpdateTask } from './MastermindUpdateTask';
import { MISSING_NAME, NO_CANVAS_OWNER_LINE, NO_CANVAS_TABLE_LINE, mastermindTable, observerLine, tableLines, taskFace } from './mastermind-round-helpers';
import { useReadingPoints } from './use-reading-points';
import { MastermindReadingList } from './MastermindReadingList';
import { MastermindWaiting } from './MastermindWaiting';

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
  const { pathname } = useLocation();
  // The canvas opened from here says where the table is, so its page can offer "Back to your table".
  const fromRoom = tableLinkState(pathname, eventId);
  const round = currentRound(state);
  const live = !!round;
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

  const owner = useOwnerUpdate(eventId, !!self, roundsKey);
  const isOwner = mine?.role === 'first';
  const { canvas, loaded, failed: canvasFailed, retry: retryCanvas } = useRoundCanvas(seated ? round?.id ?? null : null);
  const choices = useEventCanvasChoices(eventId, seated, round?.id ?? null);
  // The canvas chosen in the selector for one round; null (or another round's) is the table's own. Never seating.
  const [pick, setPick] = useState<{ roundId: string; ownerId: string } | null>(null);
  const navigate = useNavigate();
  // Mic first: a seated person whose mic is not capturing sees only the mic step (hooks stay above every return).
  const mic = useRoundMic({ eventId, roundId: round?.id ?? null, displayName: self?.displayName ?? 'Participant', seated });

  // The part of the round now, from the round's own clock (the same one the host and the projector read): the reading part lists points.
  const tableHasObserver = !!round && !!mine && (state.seatsByRound.get(round.id) ?? []).some(s => s.table === mine.table && s.role === 'observer');
  const now = useNow(seated);
  const phase = round && seated ? roundClock(round.startedAt, now, tableHasObserver, roundTiming(round)).phase : null;
  const reading = useReadingPoints({
    enabled: phase === 'reading' && !!canvas?.shared,
    ownerId: canvas?.ownerProfileId ?? null,
    name: canvas?.canvasName ?? null,
    viewerId: self?.profileId ?? null,
    isOwner,
  });

  if (!self) return null;

  const name = (id: string | undefined) => shortName(roster.find(m => m.id === id)?.displayName ?? '') || MISSING_NAME;
  // The next-version card is shown only between rounds (after the host ends a round, before the next starts, and after the evening ends).
  const face = round ? null : taskFace(owner.offer, owner.publishFailed);
  const offerRound = state.rounds.find(r => r.id === owner.offer?.roundId);
  const mySlug = roster.find(m => m.id === self.id)?.profileSlug ?? self.profileSlug;
  const draftHref = (d: { canvasName: string | null; versionName: string | null } | null) => (mySlug && d?.canvasName ? workspaceHref(mySlug, d.canvasName, d.versionName) : null);
  const tweakHref = draftHref(owner.draft);
  const partnerOf = (roundId: string): string | null => {
    const seats = state.seatsByRound.get(roundId) ?? [];
    const mineAt = seats.find(s => s.id === self.id && s.role === 'first');
    const partner = mineAt ? seats.find(s => s.table === mineAt.table && s.role === 'second') : undefined;
    return partner ? firstName(roster.find(m => m.id === partner.id)?.displayName ?? '') || null : null;
  };
  const task = face && offerRound && (
    <MastermindUpdateTask
      face={face}
      owner={owner}
      roundName={roundLabel(state.rounds, offerRound)}
      partner={partnerOf(offerRound.id)}
      tweakHref={tweakHref}
      linkState={fromRoom}
      onPreview={() => void owner.preview(d => { const to = draftHref(d); if (to) navigate(to, { state: fromRoom }); })}
    />
  );

  if (!seated || !mine) {
    return (
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
    );
  }
  if (view === 'hidden') return null;

  const tableSeats = (state.seatsByRound.get(round.id) ?? []).filter(s => s.table === mine.table);
  const table = mastermindTable(tableSeats, mine);
  const tableOwnerId = roster.find(m => m.id === table.owner?.id)?.profileId ?? canvas?.ownerProfileId ?? null;
  const ownerName = name(table.owner?.id);
  // A table whose owner has no canvas (seated anyway): roles stay as usual, the card says what to do instead.
  const noCanvas = loaded && !!canvas && !canvas.shared;
  const defaultLabel = noCanvas
    ? (isOwner ? NO_CANVAS_OWNER_LINE : NO_CANVAS_TABLE_LINE)
    : isOwner ? 'Discussing your Clarity Canvas' : `Discussing ${ownerName}\u2019s Clarity Canvas`;
  const partnerName = firstName(roster.find(m => m.id === tableSeats.find(s => s.role === 'second')?.id)?.displayName ?? '') || MISSING_NAME;
  const ownerFirst = firstName(roster.find(m => m.id === table.owner?.id)?.displayName ?? '') || MISSING_NAME;
  const watchLine = table.role === 'observer' && phase ? observerLine(phase, partnerName, ownerFirst) : null;
  // Every other canvas shared with the event. A failed read leaves none: the table's canvas alone, no selector.
  const others = choices.failed || !tableOwnerId ? [] : choices.list.filter(c => c.ownerId !== tableOwnerId);
  const chosen = pick && pick.roundId === round.id ? others.find(c => c.ownerId === pick.ownerId) ?? null : null;
  const tableLink = canvas?.shared && canvas.canvasName ? canvasPageHref(canvas.ownerSlug, canvas.canvasName) : null;
  const chosenLink = chosen ? canvasPageHref(chosen.ownerSlug ?? chosen.ownerId, chosen.name) : null;
  if (mic.needsStep) return <MastermindMicStep table={mine.table} discussing={table.owner ? defaultLabel : null} mic={mic} />;

  return (
    <>
      <section className="rounded-xl border border-blue-200 bg-card p-4 shadow-sm" data-testid="mastermind-round-card" data-role={table.role}>
        <h2 className="text-3xl font-semibold" data-testid="round-card-table">Table {mine.table}</h2>
        {table.owner ? (
          others.length > 0 ? (
            <>
            <p className="mt-3 text-sm text-muted-foreground" aria-hidden="true">Discussing</p>
            <select
              aria-label="Clarity Canvas being discussed"
              className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base font-semibold"
              value={chosen?.ownerId ?? ''}
              onChange={e => setPick(e.target.value ? { roundId: round.id, ownerId: e.target.value } : null)}
              data-testid="round-canvas-select"
            >
              <option value="">{defaultLabel.replace('Discussing y', 'Y').replace('Discussing ', '')}</option>
              {others.map(c => (
                <option key={c.ownerId} value={c.ownerId}>{shortName(c.ownerName) || MISSING_NAME}&rsquo;s Clarity Canvas</option>
              ))}
            </select>
            </>
          ) : (
            <p className="mt-3 text-lg font-semibold break-words" data-testid="round-card-headline">{defaultLabel}</p>
          )
        ) : (
          <p className="mt-1 text-base font-medium break-words" data-testid="round-card-setup">The host is still setting up your table</p>
        )}

        {watchLine && <p className="mt-3 text-base font-medium" data-testid="round-card-observer-line">{watchLine}</p>}

        <ul className="mt-3 space-y-1 text-sm" data-testid="round-card-people">
          {tableLines(tableSeats, mine.id, id => name(id)).map(l => (
            <li key={l.id} className="break-words" data-testid="round-card-person">{l.text}</li>
          ))}
        </ul>

        {phase === 'reading' && !chosen && canvas?.shared && <MastermindReadingList reading={reading} isOwner={isOwner} />}

        {table.owner && (chosen ? (
          chosenLink ? (
            <Button asChild className="mt-4 min-h-12 w-full text-base">
              <Link to={chosenLink} state={fromRoom} data-testid="round-canvas-link">Open the canvas</Link>
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="round-canvas-unshared">This Clarity Canvas is no longer shared</p>
          )
        ) : loaded && canvas && (
          tableLink ? (
            <Button asChild className="mt-4 min-h-12 w-full text-base">
              <Link
                to={tableLink}
                state={fromRoom}
                // Evidence, never a gate: recorded only for the table's assigned canvas, and only when a reader opens it (the owner opening their own is not a reading), beside the navigation, which it can never stop.
                onClick={table.role === 'owner' ? undefined : () => { try { recordCanvasOpen(round.id, canvas.ownerProfileId); } catch { /* not a gate */ } }}
                data-testid="round-canvas-link"
              >
                Open the canvas
              </Link>
            </Button>
          ) : noCanvas ? null : (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="round-canvas-unshared">This Clarity Canvas is no longer shared</p>
          )
        ))}

        {!chosen && canvasFailed && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" role="alert" data-testid="round-canvas-error">
            <span>Could not load this Clarity Canvas.</span>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retryCanvas} data-testid="round-canvas-retry">Retry</Button>
          </div>
        )}
      </section>
    </>
  );
}
