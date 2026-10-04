/**
 * @file EventHostPage.tsx
 * @description P1337 §6 — `/events/:slug/host`, the host panel. Reached by "Run this event" on
 * the event page; gated on being the event's host (events.host_id), never on is_admin.
 *
 * The host is standing, one-handed, in a dim room with people waiting. Two actions per round:
 * ring the (physical) bell, press the one button. Everything else is optional — swap two people
 * by hand, undo, regroup, mark someone out.
 *
 * Two views from one route:
 *   - default: the phone panel (clock · the one button · the people grid · past rounds).
 *   - `?view=screen`: the projector — current tables, faces, live roles and the countdown.
 *     It is also the print view (the browser's own print/share sheet; no PDF download).
 *
 * The grouping is computed HERE, on the host's device (src/lib/round-grouping.ts), and written
 * through host-only RPCs. Seed = event id, so pressing Regroup with nothing changed gives the
 * same tables back.
 *
 * The override control is variant A, confirmed by the founder on a phone (prototype
 * /tree/host-controls): tap a name, tap who it trades with; a committed trade leaves an
 * "Undo X ↔ Y". The same tap offers Out / Back in: the founder folded the separate "who's here"
 * list into the grid, so every person appears once — at a table, in "Next round", or in "Out".
 * Adding someone needs no control at all — opening the event room puts them in the pool.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Monitor, RefreshCw, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { useEventRoomAccess } from '../components/EventRoomAccess';
import { subscribeToRoomRoster } from '@/app/data/event-room-service';
import { getPrepHostView } from '@/app/data/event-prep-service';
import {
  MAX_ROUNDS,
  ROUNDS_PER_EVENING,
  ROUNDS_POLL_MS,
  currentRound,
  getRoundPresence,
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
import {
  OBSERVER_MS,
  SEATING_MS,
  SPEAKER_MS,
  formatClock,
  liveRole,
  roundClock,
  type LiveRole,
  type RoundClock,
  type RoundPhase,
} from '@/lib/round-clock';
import type { EventRoomMember } from '@/app/types';
import { firstName, initial, shortName, useEventRounds, useNow } from './use-event-rounds';
import { numericPositions, useTagPositions } from './use-tag-positions';

const START_LOCK_MS = 10_000;

/** The parts of a round, in order — the strip under the clock. */
const PHASES: { phase: RoundPhase; label: string; ms: number }[] = [
  { phase: 'seating', label: 'Tables', ms: SEATING_MS },
  { phase: 'first', label: 'Speaker 1', ms: SPEAKER_MS },
  { phase: 'second', label: 'Speaker 2', ms: SPEAKER_MS },
  { phase: 'observer', label: 'Observer', ms: OBSERVER_MS },
];

const ROLE_WORD: Record<LiveRole, string> = { speaker: 'Speaker', listener: 'Listener', observer: 'Observer' };

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

function Avatar({ member, className }: { member: EventRoomMember | undefined; className?: string }) {
  return (
    <GravatarAvatar
      name={member?.displayName ?? '?'}
      photoUrl={member?.profileAvatarUrl ?? undefined}
      avatarColor={member?.profileAvatarColor ?? undefined}
      isPledger={member?.profileHasPledged ?? false}
      size="sm"
      className={className}
    />
  );
}

/**
 * The time left in the current part of the round. Past the end it reads "Time's up" —
 * "Over by 2204:35" said nothing a host could act on.
 */
function ClockNumber({ clock, large }: { clock: RoundClock; large?: boolean }) {
  if (clock.phase === 'over') {
    return (
      <p
        className={cn('font-semibold leading-none text-red-600', large ? 'text-6xl sm:text-8xl' : 'flex min-h-12 items-end text-4xl')}
        data-testid="round-clock"
        data-phase="over"
      >
        Time&rsquo;s up
        {clock.overByMs < 60 * 60_000 && (
          <span className={cn('ml-3 font-normal tabular-nums text-muted-foreground', large ? 'text-3xl sm:text-5xl' : 'text-lg')}>
            +{formatClock(clock.overByMs)}
          </span>
        )}
      </p>
    );
  }
  return (
    <p className={cn('font-semibold tabular-nums leading-none', large ? 'text-7xl sm:text-9xl' : 'min-h-12 text-5xl')} data-testid="round-clock" data-phase={clock.phase}>
      {formatClock(clock.phaseRemainingMs)}
    </p>
  );
}

/** The parts of the round, so "the speakers swap" is something you can see coming. */
function PhaseStrip({ clock, hasObserver, large }: { clock: RoundClock; hasObserver: boolean; large?: boolean }) {
  const parts = PHASES.filter(p => hasObserver || p.phase !== 'observer');
  const current = parts.findIndex(p => p.phase === clock.phase);
  const over = clock.phase === 'over';
  return (
    <ol className={cn('flex', large ? 'gap-3' : 'gap-1.5')} aria-label="Round">
      {parts.map((p, i) => {
        const done = over || i < current;
        const active = i === current;
        const filled = done ? 100 : active ? Math.round(100 * (1 - clock.phaseRemainingMs / p.ms)) : 0;
        return (
          <li key={p.phase} className="flex-1 min-w-0" aria-current={active ? 'step' : undefined}>
            <div className={cn('overflow-hidden rounded-full bg-gray-200', large ? 'h-3' : 'h-1.5')}>
              <div className={cn('h-full rounded-full', done ? 'bg-blue-200' : 'bg-blue-500')} style={{ width: `${filled}%` }} />
            </div>
            <p
              className={cn(
                'mt-1 truncate',
                large ? 'text-xl sm:text-3xl' : 'text-[11px] min-[375px]:text-xs',
                active ? 'font-semibold text-blue-700' : 'text-muted-foreground',
              )}
            >
              {p.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ── The projector / print view ──────────────────────────────────────────── */

function ScreenView({
  round,
  seats,
  byId,
  room,
  ended,
}: {
  round: EventRound | null;
  seats: Seat[];
  byId: Map<string, EventRoomMember>;
  room: EventRoomMember[];
  ended: boolean;
}) {
  const clock = useClock(round, seats);
  const hasObserver = seats.some(s => s.role === 'observer');
  return (
    // Fixed over the page so the projector carries no site chrome (header, menus).
    <div className="fixed inset-0 z-[100] overflow-auto bg-white px-4 py-6 sm:px-10 sm:py-8 print:static print:p-0" data-testid="host-screen">
      {round && clock ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
            <h1 className="text-5xl sm:text-7xl font-semibold">Round {round.roundNo}</h1>
            <div className="print:hidden">
              <ClockNumber clock={clock} large />
            </div>
          </div>
          <div className="mt-6 mb-10 print:hidden">
            <PhaseStrip clock={clock} hasObserver={hasObserver} large />
          </div>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(24rem,100%),1fr))]">
            {groupByTable(seats).map(table => (
              <div key={table.no} className="rounded-2xl border border-border p-5 break-inside-avoid">
                <p className="text-3xl font-semibold">Table {table.no}</p>
                <ul className="mt-3 space-y-3">
                  {table.seats.map(s => {
                    const m = byId.get(s.id);
                    const role = liveRole(s.role, clock.phase);
                    return (
                      <li key={s.id} className="flex items-center gap-4">
                        <Avatar member={m} className="!h-14 !w-14 !text-lg" />
                        <div className="min-w-0">
                          <p className="text-2xl sm:text-3xl font-medium leading-tight">{m?.displayName ?? '—'}</p>
                          <span
                            className={cn(
                              'mt-1 inline-block rounded-full px-3 py-0.5 text-base sm:text-lg',
                              role === 'speaker' ? 'bg-blue-500 text-white' : role === 'listener' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {ROLE_WORD[role]}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-[80vh] place-items-center text-center">
          <div>
            <h1 className="text-5xl sm:text-7xl font-semibold">{ended ? 'Evening ended' : 'Round 1 starts soon'}</h1>
            {!ended && room.length > 0 && (
              <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-4" aria-label="In the room">
                {room.map(m => (
                  <li key={m.id}>
                    <Avatar member={m} className="!h-16 !w-16 !text-xl" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── People: the round's tables, then who is waiting, then who is out ────── */

function PersonTile({
  member,
  sub,
  lifted,
  out,
  tappedIn,
  onTap,
  testId,
}: {
  member: EventRoomMember | undefined;
  sub: string;
  lifted: boolean;
  out?: boolean;
  tappedIn?: boolean;
  onTap?: () => void;
  testId: string;
}) {
  const body = (
    <>
      <span className="relative">
        <Avatar member={member} className="!h-8 !w-8 !text-xs lg:!h-12 lg:!w-12 lg:!text-sm" />
        {tappedIn && (
          <Check
            className="absolute -bottom-1 -right-1.5 h-4 w-4 rounded-full bg-green-600 p-0.5 text-white"
            aria-label="at their table"
          />
        )}
      </span>
      <span className="mt-1 block w-full truncate text-xs min-[375px]:text-[13px] lg:text-sm font-medium">{firstName(member?.displayName ?? '—')}</span>
      <span className={cn('block w-full truncate text-[11px] lg:text-xs', lifted ? 'text-white/80' : 'text-muted-foreground')}>{sub}</span>
    </>
  );
  const cls = cn(
    'flex flex-1 min-w-0 flex-col items-center rounded-lg px-0.5 py-1.5 leading-tight',
    lifted ? 'bg-blue-600 text-white' : onTap ? 'border border-border bg-white text-foreground' : 'bg-muted/60 text-foreground',
    out && !lifted && 'opacity-60',
  );
  if (!onTap) {
    return (
      <div className={cls} data-testid={testId}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid={testId}
      data-out={out ? 'true' : undefined}
      aria-pressed={lifted}
      className={cn(cls, 'min-h-[76px] lg:min-h-[104px] lg:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500')}
    >
      {body}
    </button>
  );
}

/** The tables of one round. Tappable for the current round; the same picture, fixed, for past ones. */
function TablesGrid({
  seats,
  byId,
  phase,
  lifted,
  isOut,
  onTap,
}: {
  seats: Seat[];
  byId: Map<string, EventRoomMember>;
  phase: RoundPhase;
  lifted?: string | null;
  isOut?: (id: string) => boolean;
  onTap?: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5" data-testid="round-grid">
      {groupByTable(seats).map(table => (
        <div key={table.no} className="flex items-stretch gap-1 min-[375px]:gap-1.5 lg:gap-2">
          <div className="w-6 min-[375px]:w-7 lg:w-10 shrink-0 grid place-items-center rounded-lg bg-muted text-sm lg:text-base font-semibold text-muted-foreground" aria-label={`Table ${table.no}`}>
            {table.no}
          </div>
          {table.seats.map(s => {
            const out = isOut?.(s.id) ?? false;
            return (
              <PersonTile
                key={s.id}
                member={byId.get(s.id)}
                sub={out ? 'Out' : ROLE_WORD[liveRole(s.role, phase)]}
                lifted={lifted === s.id}
                out={out}
                tappedIn={!!(s as RoundSeat).confirmedAt}
                onTap={onTap ? () => onTap(s.id) : undefined}
                testId="round-grid-name"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PeopleGroup({
  title,
  people,
  lifted,
  out,
  hideCount,
  onTap,
}: {
  title: string;
  people: EventRoomMember[];
  lifted: string | null;
  out?: boolean;
  hideCount?: boolean;
  onTap: (id: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div data-testid={out ? 'host-out' : 'host-waiting'}>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} {!hideCount && <span className="tabular-nums">{people.length}</span>}
      </p>
      <div className="grid grid-cols-3 gap-1 min-[375px]:grid-cols-4 min-[375px]:gap-1.5 lg:grid-cols-6 lg:gap-2">
        {people.map(m => (
          <PersonTile
            key={m.id}
            member={m}
            sub={initial(m.displayName) || '\u00a0'}
            lifted={lifted === m.id}
            onTap={() => onTap(m.id)}
            testId="host-member"
          />
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function EventHostPage() {
  const { slug, event, loading } = useEventRoomAccess();
  const { user, session, sessionChecked } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isScreen = params.get('view') === 'screen';
  // The signed-in id comes from the session, not the profile (as in EventRoomAccess): arriving
  // through a sign-in link, the profile loads after the event, and checking `user` alone showed
  // the host "Only the host can run this event" until a reload.
  const viewerId = session?.user?.id ?? user?.id ?? null;
  const isHost = !!viewerId && !!event && event.hostId === viewerId;
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
  const byId = useMemo(() => new Map(roster.map(m => [m.id, m])), [roster]);
  const profileIds = useMemo(() => members.map(m => m.profileId).filter((p): p is string => !!p), [members]);
  const positions = useTagPositions(isScreen ? null : event?.statementTag, profileIds);

  const round = currentRound(state);
  const seats: RoundSeat[] = round ? state.seatsByRound.get(round.id) ?? [] : [];
  const lastRound = state.rounds[state.rounds.length - 1];
  const evening = state.rounds.length === 0 ? 'before' : lastRound?.endedAt ? 'ended' : 'running';
  const nextNo = state.rounds.length + 1;
  // A double tap on "Start round 1" must not also start round 2: the button that just
  // changed label stays locked for the first seconds of a round.
  const now = useNow(!!round);
  const justStarted = !!round && now - new Date(round.startedAt).getTime() < START_LOCK_MS;

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
        // Plan three rounds ahead, or just this one past the third — there is no fixed count.
        totalRounds: Math.max(ROUNDS_PER_EVENING, roundNo),
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

  if (loading || !sessionChecked) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
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

  const ended = evening === 'ended';

  if (isScreen) {
    return <ScreenView round={round} seats={seats} byId={byId} room={members.filter(m => !presence.get(m.id)?.leftAt)} ended={ended} />;
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

  const seatOf = new Map(seats.map(s => [s.id, s]));
  const isOut = (id: string) => !!presence.get(id)?.leftAt;
  const waiting = members.filter(m => !seatOf.has(m.id) && !isOut(m.id));
  const outside = members.filter(m => !seatOf.has(m.id) && isOut(m.id));

  // Tap a name: it lifts, and the bar offers what can be done with it. Tapping a second seated
  // name trades the two seats (variant A); "Out" / "Back in" is the only presence control —
  // out until the host brings them back (founder: one state, not "sit out" plus "left").
  const onTap = (id: string) => {
    if (!lifted) return setLifted(id);
    if (lifted === id) return setLifted(null);
    if (seatOf.has(lifted) && seatOf.has(id) && !isOut(lifted) && !isOut(id)) {
      const label = `${shortName(names.get(lifted) ?? '')} ↔ ${shortName(names.get(id) ?? '')}`;
      commitSeats(swapSeats(seats, lifted, id), label);
      return setLifted(null);
    }
    setLifted(id);
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!round || !last || last.roundId !== round.id) return;
    void run(async () => {
      await hostSetRoundSeats(round.id, last.seats);
      setUndoStack(stack => stack.slice(0, -1));
    });
  };

  const setOut = (memberId: string, out: boolean) =>
    void (async () => {
      setError(null);
      try {
        await hostSetRoundPresence(event.id, memberId, out, null);
        await refreshPresence();
      } catch {
        setError('That didn’t save. Try again.');
      }
    })();

  const clock = round ? roundClock(round.startedAt, now, seats.some(s => s.role === 'observer')) : null;
  // No "End evening": the host decides how many rounds to run (founder, 2026-10-04). The last
  // round simply reads "Time's up", and the room page stops showing rounds once the event ends.
  const hasNext = !ended && nextNo <= MAX_ROUNDS;
  const primary = hasNext ? { label: round ? 'Next round' : `Start round ${nextNo}`, action: startNext } : null;
  const pastRounds = state.rounds.filter(r => r.id !== round?.id);
  const liftedName = lifted ? shortName(names.get(lifted) ?? '') : '';

  return (
    <div className="mx-auto w-full max-w-lg lg:max-w-6xl px-4 pt-4 pb-16" data-testid="host-panel">
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

      {/* Desktop: the clock and the one button stay put on the left; the room fills the right. */}
      <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4">
          <p className="text-sm font-medium text-muted-foreground" data-testid="host-round-title">
            {ended ? 'Evening ended' : round ? `Round ${round.roundNo}` : `${members.length} in the room`}
          </p>
          {clock && (
            <div className="mt-1 space-y-3">
              <ClockNumber clock={clock} />
              <PhaseStrip clock={clock} hasObserver={seats.some(s => s.role === 'observer')} />
            </div>
          )}
          {primary && justStarted && !busy && (
            // The start lock: nothing to press for a few seconds rather than a greyed-out button.
            <div className="mt-4 min-h-12" aria-hidden="true" />
          )}
          {primary && (!justStarted || busy) && (
            <Button
              type="button"
              className="mt-4 w-full min-h-12 text-base bg-blue-500 hover:bg-blue-600 text-white"
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
          {hasNext && (
            <details className="group mt-3" data-testid="host-settings">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
                Next round settings
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-3 border-t border-border pt-3">
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
                      className="h-4 w-4 accent-blue-500"
                      checked={settings.toggles[key]}
                      onChange={e => setSettings({ ...settings, toggles: { ...settings.toggles, [key]: e.target.checked } })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </details>
          )}
        </section>

        <div className="min-w-0">
          {!ended && (seats.length > 0 || waiting.length > 0 || outside.length > 0) && (
            <section className="mt-5 space-y-4 lg:mt-0" data-testid="host-people">
              <p className="text-[13px] text-muted-foreground">{round ? 'Tap a name to swap or mark out' : 'Tap a name to mark out'}</p>
              {round && clock && seats.length > 0 && (
                <TablesGrid seats={seats} byId={byId} phase={clock.phase} lifted={lifted} isOut={isOut} onTap={onTap} />
              )}
              <PeopleGroup title={round ? 'Next round' : 'Here'} people={waiting} lifted={lifted} hideCount={!round} onTap={onTap} />
              <PeopleGroup title="Out" people={outside} lifted={lifted} out onTap={onTap} />

              {lifted ? (
                <div className="sticky bottom-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2 pl-3 shadow-sm" aria-live="polite">
                  <span className="flex-1 min-w-0 text-sm">
                    {seatOf.has(lifted) && !isOut(lifted) ? `Swap ${firstName(liftedName)} with…` : liftedName}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 bg-white"
                    onClick={() => {
                      setOut(lifted, !isOut(lifted));
                      setLifted(null);
                    }}
                    data-testid="host-mark-left"
                  >
                    {isOut(lifted) ? 'Back in' : 'Out'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0" onClick={() => setLifted(null)} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                round && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {undoStack.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={undo} disabled={busy} data-testid="host-undo">
                        <Undo2 className="h-3.5 w-3.5" /> Undo {undoStack[undoStack.length - 1]?.label}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      disabled={busy}
                      onClick={() => commitSeats(() => compute(round.roundNo), 'regroup')}
                      data-testid="host-regroup"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Regroup
                    </Button>
                  </div>
                )
              )}
            </section>
          )}

          {pastRounds.length > 0 && (
            <section className="mt-6 space-y-2" data-testid="host-past-rounds">
              {[...pastRounds].reverse().map(r => {
                const past = state.seatsByRound.get(r.id) ?? [];
                const tapped = past.filter(s => s.confirmedAt).length;
                return (
                  <details key={r.id} className="group rounded-xl border border-border bg-card px-4 py-2">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-medium">Round {r.roundNo}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {tapped} of {past.length} tapped in
                      </span>
                      <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="pb-2 pt-1">
                      <TablesGrid seats={past} byId={byId} phase="seating" />
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventHostPage;
