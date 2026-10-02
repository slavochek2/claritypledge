/**
 * @file EventHostPage.tsx
 * @description P1337 §6 — `/events/:slug/host`, the host panel. Reached by "Run this event" on
 * the event page; gated on being the event's host (events.host_id), never on is_admin.
 *
 * The host is standing, one-handed, in a dim room with people waiting. Two actions per round:
 * ring the (physical) bell, press the one button. Everything else is optional — swap two people
 * by hand, undo, regroup, mark someone left or sitting out.
 *
 * Two views from one route:
 *   - default: the phone panel (clock · the one button · the round grid · who's here).
 *   - `?view=screen`: the projector — current tables, roles and the countdown, no controls.
 *     It is also the print view (the browser's own print/share sheet; no PDF download).
 *
 * The grouping is computed HERE, on the host's device (src/lib/round-grouping.ts), and written
 * through host-only RPCs. Seed = event id, so pressing Regroup with nothing changed gives the
 * same tables back.
 *
 * The override control is variant A, confirmed by the founder on a phone (prototype
 * /tree/host-controls): tap a name, tap who it trades with; a committed trade leaves an
 * "Undo X ↔ Y". Adding someone needs no control at all — opening the event room puts them in
 * the pool for the next round. Add/remove facts live on the "who's here" list, never the grid.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Monitor, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { useEventRoomAccess } from '../components/EventRoomAccess';
import { subscribeToRoomRoster } from '@/app/data/event-room-service';
import { getPrepHostView } from '@/app/data/event-prep-service';
import {
  ROUNDS_PER_EVENING,
  ROUNDS_POLL_MS,
  currentRound,
  getRoundPresence,
  hostEndRounds,
  hostSetRoundPresence,
  hostSetRoundSeats,
  hostStartRound,
  type EventRound,
  type RoundPresence,
  type RoundSeat,
} from '@/app/data/event-rounds-service';
import {
  DEFAULT_TOGGLES,
  groupNextRound,
  pairGap,
  swapSeats,
  type GroupingToggles,
  type Seat,
} from '@/lib/round-grouping';
import { formatClock, roundClock, type RoundPhase } from '@/lib/round-clock';
import type { EventRoomMember } from '@/app/types';
import { shortName, useEventRounds, useNow } from './use-event-rounds';
import { numericPositions, useTagPositions } from './use-tag-positions';

const PHASE_LABEL: Record<RoundPhase, string> = {
  seating: 'Finding tables',
  first: 'First speaker',
  second: 'Second speaker',
  observer: 'Observer',
  over: 'Over by',
};

const ROLE_LABEL = { first: 'first', second: 'second', observer: 'observer' } as const;

interface Settings {
  groupSize: 2 | 3 | 4;
  toggles: GroupingToggles;
}

const DEFAULT_SETTINGS: Settings = { groupSize: 3, toggles: DEFAULT_TOGGLES };

/** Per-host convenience: survives a reload of the panel, never needed for the evening to run. */
function useSettings(eventId: string | undefined): [Settings, (s: Settings) => void] {
  const storageKey = eventId ? `p1337-host-settings:${eventId}` : null;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) });
    } catch {
      /* defaults */
    }
  }, [storageKey]);
  const update = useCallback(
    (next: Settings) => {
      setSettings(next);
      try {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — the setting still applies for this visit */
      }
    },
    [storageKey],
  );
  return [settings, update];
}

function groupByTable(seats: Seat[]): { no: number; seats: Seat[] }[] {
  const tables = new Map<number, Seat[]>();
  for (const s of seats) tables.set(s.table, [...(tables.get(s.table) ?? []), s]);
  const order = { first: 0, second: 1, observer: 2 };
  return [...tables.entries()]
    .sort(([a], [b]) => a - b)
    .map(([no, t]) => ({ no, seats: t.sort((x, y) => order[x.role] - order[y.role]) }));
}

function useClock(round: EventRound | null, seats: Seat[]) {
  const now = useNow(!!round);
  if (!round) return null;
  return roundClock(round.startedAt, now, seats.some(s => s.role === 'observer'));
}

function ClockReadout({ round, seats, large }: { round: EventRound | null; seats: Seat[]; large?: boolean }) {
  const clock = useClock(round, seats);
  if (!round || !clock) return null;
  const ms = clock.phase === 'over' ? clock.overByMs : clock.phaseRemainingMs;
  return (
    <div className="flex items-baseline gap-3" data-testid="round-clock" data-phase={clock.phase}>
      <span className={cn('text-muted-foreground', large ? 'text-3xl' : 'text-sm')}>{PHASE_LABEL[clock.phase]}</span>
      <span
        className={cn(
          'font-semibold tabular-nums',
          large ? 'text-8xl' : 'text-4xl',
          clock.phase === 'over' ? 'text-red-600' : 'text-foreground',
        )}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

/* ── The projector / print view ──────────────────────────────────────────── */

function ScreenView({
  round,
  seats,
  names,
  roomCount,
}: {
  round: EventRound | null;
  seats: Seat[];
  names: Map<string, string>;
  roomCount: number;
}) {
  return (
    <div className="min-h-screen bg-white px-8 py-8 print:p-0" data-testid="host-screen">
      {round ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-6 mb-8">
            <h1 className="text-5xl font-semibold">Round {round.roundNo}</h1>
            <div className="print:hidden">
              <ClockReadout round={round} seats={seats} large />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groupByTable(seats).map(table => (
              <div key={table.no} className="rounded-xl border border-border p-5 break-inside-avoid">
                <p className="text-sm uppercase tracking-widest text-muted-foreground">Table {table.no}</p>
                <ul className="mt-2 space-y-1">
                  {table.seats.map(s => (
                    <li key={s.id} className="flex items-baseline justify-between gap-3 text-2xl">
                      <span className="font-medium truncate">{names.get(s.id) ?? '—'}</span>
                      <span className="shrink-0 text-base text-muted-foreground">{ROLE_LABEL[s.role]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-[70vh] place-items-center text-center">
          <div>
            <h1 className="text-5xl font-semibold">Round 1 starts soon</h1>
            <p className="mt-4 text-2xl text-muted-foreground">{roomCount} in the room</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── The round grid (variant A) ──────────────────────────────────────────── */

function RoundGrid({
  seats,
  names,
  lifted,
  onName,
}: {
  seats: Seat[];
  names: Map<string, string>;
  lifted: string | null;
  onName: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid="round-grid">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Table</p>
      {groupByTable(seats).map(table => (
        <div key={table.no} className="flex items-stretch gap-1.5">
          <div className="w-7 shrink-0 grid place-items-center rounded-lg bg-muted text-[13px] font-semibold text-muted-foreground">
            {table.no}
          </div>
          {table.seats.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => onName(s.id)}
              data-testid="round-grid-name"
              aria-pressed={lifted === s.id}
              className={cn(
                'flex-1 min-w-0 min-h-[52px] rounded-lg px-1 text-[14px] font-medium leading-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                lifted === s.id ? 'bg-blue-600 text-white' : 'bg-white border border-border text-foreground',
              )}
            >
              <span className="block truncate">{shortName(names.get(s.id) ?? '—')}</span>
              {s.role === 'observer' && (
                <span className={cn('block text-[11px] font-normal', lifted === s.id ? 'text-white/80' : 'text-muted-foreground')}>
                  observer
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function EventHostPage() {
  const { slug, event, loading } = useEventRoomAccess();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isScreen = params.get('view') === 'screen';
  const isHost = !!user && !!event && event.hostId === user.id;
  const eventId = isHost ? event?.id : undefined;

  const [roster, setRoster] = useState<EventRoomMember[]>([]);
  const [presence, setPresence] = useState<Map<string, RoundPresence>>(new Map());
  const [recorderProfiles, setRecorderProfiles] = useState<Set<string>>(new Set());
  const { state, loaded, refresh } = useEventRounds(eventId);
  const [settings, setSettings] = useSettings(eventId);
  const [lifted, setLifted] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ roundId: string; seats: Seat[]; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => (eventId ? subscribeToRoomRoster(eventId, setRoster) : undefined), [eventId]);

  const refreshPresence = useCallback(async () => {
    if (!eventId) return;
    try {
      setPresence(await getRoundPresence(eventId));
    } catch {
      /* keep */
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId || isScreen) return;
    void refreshPresence();
    const id = setInterval(() => void refreshPresence(), ROUNDS_POLL_MS);
    return () => clearInterval(id);
  }, [eventId, isScreen, refreshPresence]);

  // Recorders: research_state 'confirmed' in the preparation (P1336). Re-read as the room grows.
  useEffect(() => {
    if (!eventId || isScreen) return;
    let cancelled = false;
    getPrepHostView(eventId)
      .then(rows => {
        if (!cancelled) setRecorderProfiles(new Set(rows.filter(r => r.researchState === 'confirmed').map(r => r.profileId)));
      })
      .catch(() => { /* group without the recorder signal */ });
    return () => {
      cancelled = true;
    };
  }, [eventId, isScreen, roster.length]);

  // The host is not seated: they run the room (an odd person observes or makes a table of two).
  const members = useMemo(() => roster.filter(m => m.profileId !== event?.hostId), [roster, event?.hostId]);
  const names = useMemo(() => new Map(roster.map(m => [m.id, m.displayName])), [roster]);
  const profileIds = useMemo(() => members.map(m => m.profileId).filter((p): p is string => !!p), [members]);
  const positions = useTagPositions(isScreen ? null : event?.statementTag, profileIds);

  const round = currentRound(state);
  const seats: RoundSeat[] = round ? state.seatsByRound.get(round.id) ?? [] : [];
  const lastRound = state.rounds[state.rounds.length - 1];
  const evening = state.rounds.length === 0 ? 'before' : lastRound?.endedAt ? 'ended' : 'running';
  const nextNo = state.rounds.length + 1;

  // Undo applies to one round only.
  useEffect(() => {
    setUndoStack([]);
    setLifted(null);
  }, [round?.id]);

  const gap = useCallback(
    (a: string, b: string) => {
      const pa = roster.find(m => m.id === a)?.profileId;
      const pb = roster.find(m => m.id === b)?.profileId;
      if (!pa || !pb) return null;
      return pairGap(numericPositions(positions.byProfile.get(pa)), numericPositions(positions.byProfile.get(pb)));
    },
    [roster, positions],
  );

  const poolFor = useCallback(
    (roundNo: number) =>
      members
        .filter(m => {
          const p = presence.get(m.id);
          return !p?.leftAt && p?.sitsOutRound !== roundNo;
        })
        .map(m => ({ id: m.id, recorder: !!m.profileId && recorderProfiles.has(m.profileId) })),
    [members, presence, recorderProfiles],
  );

  const historyBefore = useCallback(
    (roundNo: number) =>
      state.rounds.filter(r => r.roundNo < roundNo).map(r => state.seatsByRound.get(r.id) ?? []),
    [state],
  );

  const compute = useCallback(
    (roundNo: number) =>
      groupNextRound({
        people: poolFor(roundNo),
        history: historyBefore(roundNo),
        gap,
        totalRounds: ROUNDS_PER_EVENING,
        groupSize: settings.groupSize,
        toggles: settings.toggles,
        seed: eventId ?? '',
      }),
    [poolFor, historyBefore, gap, settings, eventId],
  );

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Let "Grouping…" paint before the (synchronous, up to ~2s on a phone) search runs.
        await new Promise(resolve => setTimeout(resolve, 30));
        await write();
        await refresh();
      } catch {
        setError('That didn’t save. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!event || !isHost) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm" data-testid="host-not-allowed">
        <p>Only the host can run this event.</p>
        <Link to={slug ? `/events/${slug}` : '/events'} className="mt-3 inline-block text-blue-600 underline">
          Back to the event
        </Link>
      </div>
    );
  }

  if (isScreen) {
    return <ScreenView round={round} seats={seats} names={names} roomCount={members.length} />;
  }

  const startNext = () => {
    if (poolFor(nextNo).length < 2) {
      setError('Waiting for at least two people in the room.');
      return;
    }
    void run(() => hostStartRound(event.id, nextNo, settings.groupSize, compute(nextNo)));
  };

  const commitSeats = (next: Seat[] | (() => Seat[]), label: string) => {
    if (!round) return;
    const before = seats.map(({ id, table, role }) => ({ id, table, role }));
    void run(async () => {
      await hostSetRoundSeats(round.id, typeof next === 'function' ? next() : next);
      setUndoStack(stack => [...stack, { roundId: round.id, seats: before, label }]);
    });
  };

  const onName = (id: string) => {
    if (!lifted) return setLifted(id);
    if (lifted === id) return setLifted(null);
    const label = `${shortName(names.get(lifted) ?? '')} ↔ ${shortName(names.get(id) ?? '')}`;
    commitSeats(swapSeats(seats, lifted, id), label);
    setLifted(null);
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!round || !last || last.roundId !== round.id) return;
    void run(async () => {
      await hostSetRoundSeats(round.id, last.seats);
      setUndoStack(stack => stack.slice(0, -1));
    });
  };

  const seatOf = new Map(seats.map(s => [s.id, s]));
  const here = members.filter(m => !presence.get(m.id)?.leftAt);
  const gone = members.filter(m => presence.get(m.id)?.leftAt);
  const unconfirmed = seats.filter(s => !s.confirmedAt).length;

  const setPresenceFor = (memberId: string, left: boolean, sitsOut: number | null) =>
    void (async () => {
      setError(null);
      try {
        await hostSetRoundPresence(event.id, memberId, left, sitsOut);
        await refreshPresence();
      } catch {
        setError('That didn’t save. Try again.');
      }
    })();

  const primary =
    evening === 'ended'
      ? null
      : nextNo <= ROUNDS_PER_EVENING
        ? { label: `Start round ${nextNo}`, action: startNext }
        : { label: 'End evening', action: () => void run(() => hostEndRounds(event.id)) };

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-16" data-testid="host-panel">
      <div className="flex items-start justify-between gap-3">
        <FocusHeader onBack={() => navigate(`/events/${slug}`)} label="Back" aria-label="Back to the event" />
        <a
          href={`/events/${slug}/host?view=screen`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-blue-600"
          data-testid="host-screen-link"
        >
          <Monitor className="h-4 w-4" /> Screen
        </a>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground" data-testid="host-round-title">
          {evening === 'ended'
            ? 'Evening ended'
            : round
              ? `Round ${round.roundNo} of ${ROUNDS_PER_EVENING}`
              : `${members.length} in the room`}
        </p>
        <div className="mt-1 min-h-[2.5rem]">
          <ClockReadout round={round} seats={seats} />
        </div>
        {primary && (
          <Button
            type="button"
            className="mt-3 w-full min-h-12 text-base"
            onClick={primary.action}
            disabled={busy || !loaded}
            data-testid="host-primary"
          >
            {busy ? 'Grouping…' : primary.label}
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      {round && seats.length > 0 && (
        <section className="mt-4 space-y-3">
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {lifted ? `Tap who swaps with ${shortName(names.get(lifted) ?? '')}` : 'Tap two names to swap'}
          </p>
          <RoundGrid seats={seats} names={names} lifted={lifted} onName={onName} />
          <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
            {lifted && (
              <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setLifted(null)}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            {undoStack.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={undo} disabled={busy} data-testid="host-undo">
                <Undo2 className="h-3.5 w-3.5" /> Undo {undoStack[undoStack.length - 1]?.label}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto min-h-10 text-muted-foreground"
              disabled={busy}
              onClick={() => commitSeats(() => compute(round.roundNo), 'regroup')}
              data-testid="host-regroup"
            >
              Regroup
            </Button>
          </div>
        </section>
      )}

      <section className="mt-6" data-testid="host-whos-here">
        <h2 className="text-sm font-semibold">
          Who&rsquo;s here <span className="font-normal text-muted-foreground">({here.length})</span>
          {round && unconfirmed > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">· {unconfirmed} not at a table yet</span>
          )}
        </h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
          {here.map(m => {
            const seat = seatOf.get(m.id);
            const sitsOut = presence.get(m.id)?.sitsOutRound === nextNo;
            return (
              <li key={m.id} className="flex items-center gap-2 px-3 py-1.5 min-h-12" data-testid="host-member">
                <span className="flex-1 min-w-0 truncate text-sm">{m.displayName}</span>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  {seat ? (
                    <>
                      {seat.confirmedAt && <Check className="h-3.5 w-3.5 text-green-600" aria-label="at their table" />}
                      Table {seat.table}
                    </>
                  ) : null}
                </span>
                {nextNo <= ROUNDS_PER_EVENING && evening !== 'ended' && (
                  <Button
                    type="button"
                    variant={sitsOut ? 'secondary' : 'ghost'}
                    size="sm"
                    className="min-h-10 shrink-0 px-2 text-xs"
                    aria-pressed={sitsOut}
                    onClick={() => setPresenceFor(m.id, false, sitsOut ? null : nextNo)}
                  >
                    Sit out
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10 shrink-0 px-2 text-xs"
                  onClick={() => setPresenceFor(m.id, true, null)}
                  data-testid="host-mark-left"
                >
                  Left
                </Button>
              </li>
            );
          })}
          {here.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nobody yet.</li>}
        </ul>
        {gone.length > 0 && (
          <ul className="mt-2 space-y-1">
            {gone.map(m => (
              <li key={m.id} className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
                <span className="flex-1 min-w-0 truncate line-through">{m.displayName}</span>
                <Button type="button" variant="ghost" size="sm" className="min-h-10 px-2 text-xs" onClick={() => setPresenceFor(m.id, false, null)}>
                  Back
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mt-6 rounded-xl border border-border bg-card px-4 py-3" data-testid="host-settings">
        <summary className="cursor-pointer text-sm font-semibold min-h-8">Grouping</summary>
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm">Group size</span>
            <div className="inline-flex rounded-lg bg-muted p-1">
              {([2, 3, 4] as const).map(size => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={settings.groupSize === size}
                  onClick={() => setSettings({ ...settings, groupSize: size })}
                  className={cn(
                    'min-h-10 min-w-10 rounded-md text-sm',
                    settings.groupSize === size ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ['recorders', 'Recorders together'],
              ['gap', 'Disagreement gap'],
              ['unmet', 'Haven’t met yet'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm min-h-10">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.toggles[key]}
                onChange={e => setSettings({ ...settings, toggles: { ...settings.toggles, [key]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
        </div>
      </details>

      {state.rounds.filter(r => r.id !== round?.id).length > 0 && (
        <section className="mt-6" data-testid="host-past-rounds">
          <h2 className="text-sm font-semibold">Past rounds</h2>
          {state.rounds
            .filter(r => r.id !== round?.id)
            .map(r => (
              <details key={r.id} className="mt-2 rounded-xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer text-sm min-h-8">Round {r.roundNo}</summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {groupByTable(state.seatsByRound.get(r.id) ?? []).map(table => (
                    <li key={table.no}>
                      <span className="text-muted-foreground">Table {table.no}:</span>{' '}
                      {table.seats.map(s => `${names.get(s.id) ?? '—'} (${ROLE_LABEL[s.role]})`).join(', ')}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
        </section>
      )}
    </div>
  );
}

export default EventHostPage;
