/**
 * @file EventHostPage.tsx
 * @description P1337 §6 — `/events/:slug/host`, the host panel. Reached by "Run this event" on
 * the event page and in the room; gated on being the event's host (events.host_id), never on
 * is_admin.
 *
 * The host is standing, one-handed, in a dim room with people waiting. Two actions per round:
 * ring the (physical) bell, press the one button. Everything else is optional — swap two people
 * by hand, undo, regroup, mark someone out.
 *
 * Two views from one route:
 *   - default: the host panel — the people (tables, next round, out) and the controls (clock ·
 *     the one button · settings). On a desktop the people fill the left, the controls the right.
 *     Each tile also carries the host-only marks: prepared, recording volunteer and their mic,
 *     and whether their transcription is live right now.
 *   - `?view=screen`: the projector — round, clock, the round's parts in proportion, and every
 *     table with role cards and faces, scaled to fit one screen from 6 people to 40. No marks:
 *     who prepared or records is the host's business, not the room's.
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
 *
 * Roles are columns, not labels on every tile (founder: "if the first column is always speaker
 * and the second listener … mark it the right way"): a header with the printed cards' S / L / O,
 * which trades S and L when the speakers swap.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, BellOff, Check, ChevronDown, MapPin, Mic, Minus, Monitor, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { useEventRoomAccess } from '../components/EventRoomAccess';
import { subscribeToRoomRoster } from '@/app/data/event-room-service';
import { getPrepHostView, type HostPrepRow } from '@/app/data/event-prep-service';
import {
  MAX_ROUNDS,
  ROUNDS_PER_EVENING,
  ROUNDS_POLL_MS,
  currentRound,
  getRoundPresence,
  getTranscribingNow,
  hostExtendRound,
  hostSetRoundPresence,
  hostSetRoundSeats,
  hostShortenRound,
  hostEndRounds,
  roundExists,
  hostStartRound,
  DEFAULT_ROUND_MINUTES,
  type EventRound,
  type RoundMinutes,
  type RoundPresence,
  type RoundSeat,
} from '@/app/data/event-rounds-service';
import {
  DEFAULT_TOGGLES,
  groupNextRound,
  pairGap,
  seatLate,
  swapSeats,
  type GroupingToggles,
  type Seat,
  type SeatRole,
} from '@/lib/round-grouping';
import {
  formatClock,
  liveRole,
  roundClock,
  roundTiming,
  type RoundClock,
  type RoundPhase,
  type RoundTiming,
} from '@/lib/round-clock';
import type { EventRoomMember } from '@/app/types';
import { MIC_HINTS, PREPARED_HINT, prepMarksByProfile, type PrepMarkState } from '../prep/PrepMarks';
import { firstName, shortName, useEventRounds, useNow } from './use-event-rounds';
import { numericPositions, useTagPositions } from './use-tag-positions';
import { PairBadge, RoleBadge } from './RoleBadge';
import { SCREEN_CARD_MAX_EM, SCREEN_GAP, SCREEN_HEADER, SCREEN_PAD, screenLayout } from '@/lib/round-screen-layout';
import { FIXED_TOPIC_TAGS, getEventTopicTags } from '@/app/data/event-topic-tags';
import { knownSetTags, setLabel } from '@/lib/set-labels';
import { eventTopic } from '../prep/prep-plan';

const START_LOCK_MS = 10_000;
/** A save that has not answered by now is given up on (founder, 2026-10-05: "it just hangs on
 * Grouping…" while the venue network dropped). The page then asks whether it landed anyway. */
const SAVE_DEADLINE_MS = 15_000;
/** The write itself; the "did it land?" check gets what is left of SAVE_DEADLINE_MS (Codex review:
 * the whole interaction, not one request, is what must end within 15 s). */
const WRITE_DEADLINE_MS = 10_000;
/** The fresh board after a save; it never holds the button. */
const CHECK_DEADLINE_MS = 6_000;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('deadline')), ms);
    work.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}
const PREP_POLL_MS = 60_000;
const TRANSCRIBING_POLL_MS = 15_000;
const MIC_LETTER = { usbc: 'C', lightning: 'L', other: '?' } as const;

/**
 * The parts of a round, drawn in proportion to the round's own minutes (1 · 6 · 6 · 3 by default),
 * the table-finding minute first (walkthrough 8 reverses the earlier "not on the strip").
 */
function talkingParts(timing: RoundTiming): { phase: RoundPhase; label: string; ms: number }[] {
  // Walkthrough 8: the table-finding minute is its own labelled part, so the clock always says
  // what it counts (it read as a bare "25 seconds" on the projector).
  const seating = { phase: 'seating' as const, label: 'Find your table', ms: timing.seatingMs };
  // No swap at half time: the speakers' time is one part, "Talk" (secondMs is 0 and drops out).
  if (!timing.split) {
    return [
      seating,
      { phase: 'first', label: 'Talk', ms: timing.firstMs },
      { phase: 'observer', label: 'Observer', ms: timing.observerMs },
    ];
  }
  return [
    seating,
    { phase: 'first', label: 'Speaker 1', ms: timing.firstMs },
    { phase: 'second', label: 'Speaker 2', ms: timing.secondMs },
    { phase: 'observer', label: 'Observer', ms: timing.observerMs },
  ];
}

/** The name of the part running now, beside the host's clock. */
const PART_NAME: Record<Exclude<RoundPhase, 'over'>, string> = {
  seating: 'Finding tables',
  first: 'Speaker 1',
  second: 'Speaker 2',
  observer: 'Observer',
};

/** The fixed column names on the host grid; the badge beside each shows who speaks right now. */
const COLUMN_LABEL = { first: 'Speaker 1', second: 'Speaker 2', observer: 'Observer' } as const;

interface Settings {
  groupSize: 2 | 3 | 4;
  toggles: GroupingToggles;
  /** Minutes for the next round, stored with it when it starts (never moves a running round). */
  minutes: RoundMinutes;
  /** "Swap at half time" — off: one talking part, the pair trade the badges themselves. */
  splitSpeakers: boolean;
  /** "Match on #tag": the tag the next round is grouped on (empty = the event's statement tag). */
  matchTag: string;
}

const DEFAULT_SETTINGS: Settings = {
  groupSize: 3,
  toggles: DEFAULT_TOGGLES,
  minutes: DEFAULT_ROUND_MINUTES,
  splitSpeakers: true,
  matchTag: '',
};

/** The three minute settings: what they are called, and the range the database accepts. */
const MINUTE_FIELDS: { key: keyof RoundMinutes; label: string; min: number; max: number }[] = [
  { key: 'seatingS', label: 'Tables', min: 0, max: 30 },
  { key: 'speakerS', label: 'Speaker', min: 1, max: 60 },
  { key: 'observerS', label: 'Observer', min: 0, max: 60 },
];

/** Per-host convenience: survives a reload of the panel, never needed for the evening to run. */
function useSettings(eventId: string | undefined): [Settings, (s: Settings) => void] {
  const storageKey = eventId ? `p1337-host-settings:${eventId}` : null;
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Settings>;
        setSettings({ ...DEFAULT_SETTINGS, ...saved, minutes: { ...DEFAULT_ROUND_MINUTES, ...saved.minutes } });
      }
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

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

interface Table {
  no: number;
  first?: Seat;
  second?: Seat;
  observers: Seat[];
}

function groupByTable(seats: Seat[]): Table[] {
  const tables = new Map<number, Table>();
  for (const s of seats) {
    const t = tables.get(s.table) ?? { no: s.table, observers: [] };
    if (s.role === 'first') t.first = s;
    else if (s.role === 'second') t.second = s;
    else t.observers.push(s);
    tables.set(s.table, t);
  }
  return [...tables.values()].sort((a, b) => a.no - b.no);
}

function tableSeats(t: Table): Seat[] {
  return [t.first, t.second, ...t.observers].filter((s): s is Seat => !!s);
}

function useClock(round: EventRound | null, seats: Seat[]) {
  const now = useNow(!!round);
  if (!round) return null;
  return roundClock(round.startedAt, now, seats.some(s => s.role === 'observer'), roundTiming(round));
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
        className={cn('font-semibold leading-none text-foreground', large ? 'whitespace-nowrap text-5xl sm:text-6xl' : 'flex min-h-12 items-end text-4xl')}
        data-testid="round-clock"
        data-phase="over"
      >
        Time&rsquo;s up
        {clock.overByMs < 60 * 60_000 && (
          <span className={cn('ml-3 font-normal tabular-nums text-muted-foreground', large ? 'text-3xl sm:text-4xl' : 'text-lg')}>
            +{formatClock(clock.overByMs)}
          </span>
        )}
      </p>
    );
  }
  return (
    <p className={cn('font-semibold tabular-nums leading-none', large ? 'text-6xl sm:text-7xl' : 'min-h-12 text-5xl')} data-testid="round-clock" data-phase={clock.phase}>
      {formatClock(clock.phaseRemainingMs)}
    </p>
  );
}

/** The talking parts in proportion, the current one filling as it runs. Empty while people find tables. */
function PhaseStrip({
  clock,
  timing,
  hasObserver,
  large,
}: {
  clock: RoundClock;
  timing: RoundTiming;
  hasObserver: boolean;
  large?: boolean;
}) {
  const parts = talkingParts(timing).filter(p => (hasObserver || p.phase !== 'observer') && p.ms > 0);
  const current = parts.findIndex(p => p.phase === clock.phase);
  const over = clock.phase === 'over';
  return (
    <ol className={cn('flex', large ? 'gap-3' : 'gap-1.5')} aria-label="Round">
      {parts.map((p, i) => {
        const done = over || (current >= 0 && i < current);
        const active = i === current;
        const filled = done ? 100 : active ? Math.round(100 * (1 - clock.phaseRemainingMs / p.ms)) : 0;
        return (
          <li
            key={p.phase}
            className="min-w-0"
            // On the projector every part keeps room for its label ("Find your table" is one minute).
            style={{ flexGrow: p.ms / 60_000, flexBasis: 0, minWidth: large ? '11em' : undefined }}
            aria-current={active ? 'step' : undefined}
          >
            <div className={cn('overflow-hidden rounded-full bg-gray-200', large ? 'h-5' : 'h-2')}>
              <div className={cn('h-full rounded-full transition-[width] duration-1000 ease-linear', done ? 'bg-blue-300' : 'bg-blue-500')} style={{ width: `${filled}%` }} />
            </div>
            {/* Labelled on the projector only: on the host panel the part's name sits beside the
                clock, and "Obser…" truncated at 320px (visual QA). */}
            {large && (
              <p className={cn('mt-1 truncate text-lg sm:text-xl', active ? 'font-semibold text-blue-700' : 'text-muted-foreground')}>
                {p.label}
                {/* The finding minute needs no "· 1 min": the clock beside the strip counts it. */}
                {p.phase !== 'seating' && <span className="font-normal text-muted-foreground"> · {Math.round(p.ms / 60_000)} min</span>}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The projector's bell (founder: "the screen should make a sound … between speaker one and two,
 * between speaker two and the observer, and three times when I press Next round"; then "more like
 * a proper bell"). Synthesised with WebAudio — no file to load. A struck bell is not a stack of
 * harmonics: its partials sit at inharmonic ratios (hum, prime, minor third, fifth, nominal…) and
 * the high ones die first, after a short metallic strike. Each partial is a pair of slightly
 * detuned oscillators, which gives the slow beating a real bell has. Browsers allow sound only
 * after a tap on the page, so the screen starts muted and the host taps the bell once.
 */
const BELL_BASE_HZ = 587; // D5 — carries over a room's talk without being shrill
/** [ratio to the prime, level, seconds to fade] — church/hand-bell partials. */
const BELL_PARTIALS: [number, number, number][] = [
  [0.5, 0.1, 4.5],
  [1, 0.28, 3.6],
  [1.183, 0.12, 2.6],
  [1.506, 0.08, 2.2],
  [2, 0.12, 1.9],
  [2.514, 0.06, 1.3],
  [3.011, 0.04, 0.9],
  [4.166, 0.03, 0.6],
];
const BELL_STRIKE_GAP_S = 1.3;

function useBell() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(false);
  const ring = useCallback((times: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const master = ctx.createGain();
    master.gain.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter).connect(ctx.destination);
    for (let i = 0; i < times; i++) {
      const at = ctx.currentTime + 0.02 + i * BELL_STRIKE_GAP_S;
      for (const [ratio, level, fade] of BELL_PARTIALS) {
        for (const detune of [-0.8, 0.8]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = BELL_BASE_HZ * ratio + detune;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(level / 2, at + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + fade);
          osc.connect(gain).connect(master);
          osc.start(at);
          osc.stop(at + fade + 0.05);
        }
      }
      // The strike: a few milliseconds of filtered noise, the clapper hitting metal.
      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * (1 - j / data.length);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = BELL_BASE_HZ * 4;
      const hit = ctx.createGain();
      hit.gain.value = 0.25;
      src.connect(band).connect(hit).connect(master);
      src.start(at);
    }
  }, []);
  // Release the audio device when the projector closes (Codex review).
  useEffect(() => () => void ctxRef.current?.close().catch(() => {}), []);
  const toggle = useCallback(() => {
    if (on) return setOn(false);
    try {
      ctxRef.current ??= new AudioContext();
      void ctxRef.current.resume();
      setOn(true);
      ring(1);
    } catch {
      /* no audio on this device — stays muted */
    }
  }, [on, ring]);
  return { on, toggle, ring };
}

/** Rings on the transitions the room must hear, never on opening the screen mid-round. */
function useRoundBell(round: EventRound | null, phase: RoundPhase | undefined, bell: ReturnType<typeof useBell>) {
  const last = useRef<{ roundId?: string; phase?: RoundPhase }>({});
  useEffect(() => {
    const prev = last.current;
    last.current = { roundId: round?.id, phase };
    if (!bell.on || !round || !phase) return;
    if (prev.roundId && prev.roundId !== round.id) return bell.ring(3);
    if (prev.roundId !== round.id) return;
    if ((prev.phase === 'first' && phase === 'second') || (prev.phase === 'second' && phase === 'observer')) bell.ring(1);
  }, [round, phase, bell]);
}

/* ── The projector ───────────────────────────────────────────────────────── */

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
  const bell = useBell();
  useRoundBell(round, clock?.phase, bell);
  const { w, h } = useViewport();
  const hasObserver = seats.some(s => s.role === 'observer');
  const tables = groupByTable(seats);
  const maxSeats = Math.max(2, ...tables.map(t => tableSeats(t).length));
  const wide = w >= 768;
  const layout = wide ? screenLayout(tables.length, maxSeats, w, h) : { cols: 1, rows: tables.length, fontPx: 20 };
  const crowded = layout.fontPx < 26;
  const gridStyle: CSSProperties = wide
    ? {
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        // One or two tables: rows sized to the cards, centred — never stretched tall.
        gridTemplateRows: tables.length <= 2 ? `repeat(${layout.rows}, auto)` : `repeat(${layout.rows}, minmax(0, 1fr))`,
        alignContent: tables.length <= 2 ? 'center' : undefined,
        // A lone table or two: cards side by side at a card's width, centred — not stretched across.
        maxWidth: layout.cols * SCREEN_CARD_MAX_EM * layout.fontPx + SCREEN_GAP * (layout.cols - 1),
        width: '100%',
        marginInline: 'auto',
      }
    : {};

  return (
    // Fixed over the page so the projector carries no site chrome (header, menus).
    <div
      className={cn('fixed inset-0 z-[100] bg-white print:static', wide ? 'flex flex-col overflow-hidden' : 'overflow-auto')}
      style={{ padding: SCREEN_PAD }}
      data-testid="host-screen"
    >
      <button
        type="button"
        onClick={bell.toggle}
        className="absolute right-2 top-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted print:hidden"
        aria-pressed={bell.on}
        aria-label={bell.on ? 'Sound on — tap to mute' : 'Sound off — tap for the bell'}
        data-testid="screen-bell"
      >
        {bell.on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      </button>
      {round && clock ? (
        <>
          <div
            className={cn('flex gap-x-10 gap-y-4', wide ? 'items-center' : 'flex-col')}
            style={wide ? { height: SCREEN_HEADER - SCREEN_GAP } : undefined}
          >
            <h1 className="shrink-0 text-3xl sm:text-4xl font-semibold text-muted-foreground">Round {round.roundNo}</h1>
            <div className="min-w-0 flex-1 print:hidden">
              <PhaseStrip clock={clock} timing={roundTiming(round)} hasObserver={hasObserver} large />
            </div>
            <div className="shrink-0 print:hidden">
              <ClockNumber clock={clock} large />
            </div>
          </div>
          <div className={cn('grid', wide ? 'min-h-0 flex-1' : 'mt-6')} style={{ ...gridStyle, gap: SCREEN_GAP, marginTop: wide ? SCREEN_GAP : undefined }}>
            {tables.map(table => (
              <div
                key={table.no}
                className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border break-inside-avoid"
                style={{ fontSize: layout.fontPx, padding: '0.7em 0.8em' }}
                data-testid="screen-table"
              >
                <p className="text-[1.1em] font-semibold leading-tight">Table {table.no}</p>
                <ul className="mt-[0.5em] space-y-[0.45em]">
                  {tableSeats(table).map(s => {
                    const m = byId.get(s.id);
                    return (
                      <li key={s.id} className="flex items-center gap-[0.5em]">
                        {round.splitSpeakers || s.role === 'observer' ? (
                          <RoleBadge role={liveRole(s.role, clock.phase)} style={{ width: '1.6em', height: '1.6em', fontSize: '1em' }} />
                        ) : (
                          <PairBadge style={{ width: '1.6em', height: '1.6em', fontSize: '1em' }} />
                        )}
                        {/* The avatar's own wrapper is inline-block and unsized: stretch it so the face scales with the type. */}
                        <span
                          className="shrink-0 [&>div]:!block [&>div]:!h-full [&>div]:!w-full"
                          style={{ width: '2.67em', height: '2.67em', fontSize: '0.6em' }}
                        >
                          <Avatar member={m} className="!h-full !w-full !text-[1em] !ring-offset-1" />
                        </span>
                        <span className="min-w-0 font-medium leading-tight">{crowded ? shortName(m?.displayName ?? '—') : m?.displayName ?? '—'}</span>
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
              <ul className="mx-auto mt-10 flex max-w-5xl flex-wrap justify-center gap-4" aria-label="In the room">
                {room.map(m => (
                  <li key={m.id} className="flex w-24 flex-col items-center gap-2">
                    <Avatar member={m} className="!h-16 !w-16 !text-xl" />
                    <span className="w-full truncate text-lg">{firstName(m.displayName)}</span>
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

interface PersonMarks {
  prep?: PrepMarkState;
  transcribing: boolean;
}

/** Host-only, never on the screen: prepared · recording volunteer (+ the mic they need) · live transcription. */
function StatusMarks({ marks, lifted }: { marks?: PersonMarks; lifted: boolean }) {
  const prep = marks?.prep;
  const tone = lifted ? 'text-white' : '';
  return (
    <span className="mt-0.5 flex h-3.5 items-center justify-center gap-1">
      {prep?.prepared && (
        <Check className={cn('h-3.5 w-3.5', tone || 'text-green-600')} aria-label={PREPARED_HINT}>
          <title>{PREPARED_HINT}</title>
        </Check>
      )}
      {prep?.mic && (
        <span className={cn('inline-flex items-center', tone || 'text-muted-foreground')} title={MIC_HINTS[prep.mic]} aria-label={MIC_HINTS[prep.mic]}>
          <Mic className="h-3.5 w-3.5" />
          {prep.mic !== 'own' && <span className="text-[10px] font-semibold leading-none">{MIC_LETTER[prep.mic]}</span>}
        </span>
      )}
      {marks?.transcribing && (
        <span className={cn('h-2 w-2 rounded-full bg-red-500', lifted && 'ring-2 ring-white')} title="Transcribing now" aria-label="Transcribing now" data-testid="mark-transcribing" />
      )}
    </span>
  );
}

/**
 * One person. Tapped, the tile itself carries what can be done with them — Out (or Back in) and
 * Cancel — and every tile they could trade seats with says "Swap" (founder walkthrough 4: "Out
 * should appear on the card itself"). No bar at the bottom of the page to look for.
 */
function PersonTile({
  member,
  marks,
  lifted,
  out,
  tappedIn,
  swapHint,
  actions,
  onTap,
  testId,
}: {
  member: EventRoomMember | undefined;
  marks?: PersonMarks;
  lifted: boolean;
  out?: boolean;
  tappedIn?: boolean;
  /** Tapping this tile now trades seats with the lifted one. */
  swapHint?: boolean;
  /** Shown on the lifted tile: Out / Back in, and Cancel. */
  actions?: ReactNode;
  onTap?: () => void;
  testId: string;
}) {
  const face = (
    <>
      <span className="relative">
        <Avatar member={member} className="!h-8 !w-8 !text-xs lg:!h-12 lg:!w-12 lg:!text-sm" />
        {tappedIn && (
          <MapPin
            className="absolute -bottom-1 -right-1.5 h-4 w-4 rounded-full bg-blue-600 p-0.5 text-white"
            aria-label="at their table"
          />
        )}
      </span>
      <span className="mt-1 block w-full truncate text-xs min-[375px]:text-[13px] lg:text-sm font-medium">{firstName(member?.displayName ?? '—')}</span>
    </>
  );
  const sub = out ? (
    <span className={cn('block text-[11px] lg:text-xs', lifted ? 'text-white/80' : 'text-muted-foreground')}>Out</span>
  ) : swapHint ? (
    <span className="mt-0.5 block h-3.5 text-[11px] font-semibold leading-none text-blue-600 lg:text-xs">Swap</span>
  ) : (
    <StatusMarks marks={marks} lifted={lifted} />
  );
  const cls = cn(
    'flex w-full min-w-0 flex-col items-center rounded-lg px-0.5 py-1.5 text-center leading-tight',
    lifted
      ? 'bg-blue-600 text-white'
      : swapHint
        ? 'border border-dashed border-blue-400 bg-blue-50 text-foreground'
        : onTap
          ? 'border border-border bg-white text-foreground'
          : 'bg-muted/60 text-foreground',
    out && !lifted && 'opacity-60',
  );
  if (!onTap) {
    return (
      <div className={cls} data-testid={testId}>
        {face}
        {sub}
      </div>
    );
  }
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
  if (lifted && actions) {
    // A tile holding buttons cannot itself be a button: the face cancels, the row acts.
    return (
      <div className={cn(cls, 'relative min-h-[76px] lg:min-h-[104px] lg:py-2.5')} data-testid={testId} data-out={out ? 'true' : undefined}>
        <button type="button" onClick={onTap} aria-pressed className={cn('flex w-full flex-col items-center rounded-md', focus)}>
          {face}
        </button>
        {actions}
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
      className={cn(cls, 'min-h-[76px] lg:min-h-[104px] lg:py-2.5', focus)}
    >
      {face}
      {sub}
    </button>
  );
}

/** The tables of one round. Tappable for the current round; the same picture, fixed, for past ones. */
function TablesGrid({
  seats,
  byId,
  phase,
  split = true,
  marksFor,
  lifted,
  isOut,
  canSwap,
  actions,
  onTap,
}: {
  seats: Seat[];
  byId: Map<string, EventRoomMember>;
  phase: RoundPhase;
  /** false: no swap at half time — no column turns bold, the pair trade places themselves. */
  split?: boolean;
  marksFor?: (memberId: string) => PersonMarks;
  lifted?: string | null;
  isOut?: (id: string) => boolean;
  canSwap?: (id: string) => boolean;
  actions?: ReactNode;
  onTap?: (id: string) => void;
}) {
  const tables = groupByTable(seats);
  const hasObserver = tables.some(t => t.observers.length > 0);
  const cols = hasObserver
    ? 'grid-cols-[1.5rem_repeat(3,minmax(0,1fr))] min-[375px]:grid-cols-[1.75rem_repeat(3,minmax(0,1fr))] lg:grid-cols-[2.5rem_repeat(3,minmax(0,1fr))]'
    : 'grid-cols-[1.5rem_repeat(2,minmax(0,1fr))] min-[375px]:grid-cols-[1.75rem_repeat(2,minmax(0,1fr))] lg:grid-cols-[2.5rem_repeat(2,minmax(0,1fr))]';
  const columns: SeatRole[] = hasObserver ? ['first', 'second', 'observer'] : ['first', 'second'];
  const tile = (s: Seat) => {
    const out = isOut?.(s.id) ?? false;
    return (
      <PersonTile
        key={s.id}
        member={byId.get(s.id)}
        marks={marksFor?.(s.id)}
        lifted={lifted === s.id}
        out={out}
        tappedIn={!!(s as RoundSeat).confirmedAt}
        swapHint={canSwap?.(s.id)}
        actions={actions}
        onTap={onTap ? () => onTap(s.id) : undefined}
        testId="round-grid-name"
      />
    );
  };
  return (
    <div className={cn('grid gap-1 min-[375px]:gap-1.5 lg:gap-2', cols)} data-testid="round-grid">
      <span aria-hidden="true" />
      {columns.map(col => {
        const role = liveRole(col, phase);
        const speaking = split && role === 'speaker' && phase !== 'seating' && phase !== 'over';
        // No swap at half time: no starter is assigned — both speaker columns are "the pair".
        const pair = !split && col !== 'observer';
        return (
          <p
            key={col}
            className={cn('flex items-center justify-center gap-1.5 text-xs', speaking ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}
            data-testid="round-grid-role"
          >
            {pair ? <PairBadge className="h-5 w-5 text-[11px]" /> : <RoleBadge role={role} className="h-5 w-5 text-[11px]" />}
            <span className="hidden min-[375px]:inline">{pair ? 'Pair' : COLUMN_LABEL[col]}</span>
          </p>
        );
      })}
      {tables.map(table => (
        <div key={table.no} className="contents">
          <div
            className="grid place-items-center rounded-lg bg-muted text-sm lg:text-base font-semibold text-muted-foreground"
            aria-label={`Table ${table.no}`}
          >
            {table.no}
          </div>
          <div className="flex">{table.first ? tile(table.first) : null}</div>
          <div className="flex">{table.second ? tile(table.second) : null}</div>
          {/* Two observers stack: side by side at 320px each tile was ~36px wide (visual QA). */}
          {hasObserver && <div className="flex flex-col gap-1">{table.observers.map(tile)}</div>}
        </div>
      ))}
    </div>
  );
}

function PeopleGroup({
  title,
  people,
  lifted,
  marksFor,
  out,
  hideCount,
  action,
  actions,
  onTap,
}: {
  title: string;
  people: EventRoomMember[];
  lifted: string | null;
  marksFor: (memberId: string) => PersonMarks;
  out?: boolean;
  hideCount?: boolean;
  action?: ReactNode;
  /** Out / Back in and Cancel, shown on the lifted tile. */
  actions?: ReactNode;
  onTap: (id: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div data-testid={out ? 'host-out' : 'host-waiting'}>
      <div className="mb-1.5 flex min-h-10 items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title} {!hideCount && <span className="tabular-nums">{people.length}</span>}
        </p>
        {action}
      </div>
      <div className="grid grid-cols-3 gap-1 min-[375px]:grid-cols-4 min-[375px]:gap-1.5 lg:grid-cols-6 lg:gap-2">
        {people.map(m => (
          <PersonTile
            key={m.id}
            member={m}
            marks={marksFor(m.id)}
            lifted={lifted === m.id}
            actions={actions}
            onTap={() => onTap(m.id)}
            testId="host-member"
          />
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */


/**
 * "Match on" (founder walkthrough 7): a choice among the sets that already exist — the event's own
 * first (the default), then every event's topic and the fixed topic tags (P1401's list, so a new
 * Clarity Night topic appears without anyone editing code), then the named sets. No typing.
 */
function useMatchTagOptions(eventTag: string | null | undefined): string[] {
  const [topicTags, setTopicTags] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getEventTopicTags().then(tags => {
      if (!cancelled) setTopicTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(
    () => [...new Set([eventTag, ...topicTags, ...FIXED_TOPIC_TAGS, ...knownSetTags()].filter((t): t is string => !!t))],
    [eventTag, topicTags],
  );
}

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
  const [prepRows, setPrepRows] = useState<HostPrepRow[]>([]);
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const { state, loaded, refresh } = useEventRounds(eventId);
  const [settings, setSettings] = useSettings(eventId);
  const matchOptions = useMatchTagOptions(event?.statementTag);
  // Walkthrough 8: "End the evening" asks once, inline (no browser dialog), before every phone moves to Close.
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmNext, setConfirmNext] = useState(false);
  const [lifted, setLifted] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ roundId: string; seats: Seat[]; label: string }[]>([]);
  const [busy, setBusy] = useState<null | 'grouping' | 'saving'>(null);
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

  // The preparation (P1336/P1386): who prepared, who volunteers to record and with which mic —
  // and, for the grouping, who is a confirmed recorder. Re-read as the room grows and once a
  // minute, since people finish preparing in the room.
  useEffect(() => {
    if (!eventId || isScreen) return;
    let cancelled = false;
    const read = () =>
      getPrepHostView(eventId)
        .then(rows => { if (!cancelled) setPrepRows(rows); })
        .catch(() => { /* keep what is shown; group without the recorder signal */ });
    void read();
    const id = setInterval(read, PREP_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventId, isScreen, roster.length]);

  // Live transcription: who is being transcribed right now (host-only read, profile ids only).
  useEffect(() => {
    if (!eventId || isScreen) return;
    let cancelled = false;
    const read = () =>
      getTranscribingNow(eventId)
        .then(set => { if (!cancelled) setTranscribing(set); })
        .catch(() => { /* keep what is shown */ });
    void read();
    const id = setInterval(read, TRANSCRIBING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventId, isScreen]);

  // The host is not seated: they run the room (an odd person observes or makes a table of two).
  const members = useMemo(() => roster.filter(m => m.profileId !== event?.hostId), [roster, event?.hostId]);
  const names = useMemo(() => new Map(roster.map(m => [m.id, m.displayName])), [roster]);
  const byId = useMemo(() => new Map(roster.map(m => [m.id, m])), [roster]);
  const profileIds = useMemo(() => members.map(m => m.profileId).filter((p): p is string => !!p), [members]);
  // "Match on #tag" (founder walkthrough 6): the next round is grouped on this tag; empty = the event's.
  const matchTag = settings.matchTag.trim() || event?.statementTag || null;
  const positions = useTagPositions(isScreen ? null : matchTag, profileIds);
  // Showcase (founder walkthrough 6, option 7C): the host chooses who sits; everyone else watches.
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const recorderProfiles = useMemo(() => new Set(prepRows.filter(r => r.researchState === 'confirmed').map(r => r.profileId)), [prepRows]);
  const prepMarks = useMemo(() => prepMarksByProfile(prepRows), [prepRows]);
  const marksFor = useCallback(
    (memberId: string): PersonMarks => {
      const profileId = byId.get(memberId)?.profileId;
      return profileId ? { prep: prepMarks.get(profileId), transcribing: transcribing.has(profileId) } : { transcribing: false };
    },
    [byId, prepMarks, transcribing],
  );

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
    (roundNo: number, only: Set<string> | null = null) =>
      groupNextRound({
        people: poolFor(roundNo).filter(p => !only || only.has(p.id)),
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

  // Every save is bounded: no answer within SAVE_DEADLINE_MS and the request is dropped. A lost
  // answer is not a lost write, so `landed` (when given) asks the server whether it happened before
  // the host is told "That didn't save".
  const run = useCallback(
    async (write: (signal: AbortSignal) => Promise<unknown>, landed?: (signal: AbortSignal) => Promise<boolean>) => {
      setBusy('saving');
      setError(null);
      const save = new AbortController();
      const startedAt = Date.now();
      const timer = setTimeout(() => save.abort(), WRITE_DEADLINE_MS);
      let saved = false;
      try {
        // Let the busy label paint before the (synchronous, up to ~2s on a phone) search runs.
        await new Promise(resolve => setTimeout(resolve, 30));
        await withDeadline(write(save.signal), WRITE_DEADLINE_MS);
        saved = true;
      } catch {
        if (landed) {
          const check = new AbortController();
          const left = Math.max(1_000, SAVE_DEADLINE_MS - (Date.now() - startedAt));
          saved = await withDeadline(landed(check.signal), left).catch(() => {
            check.abort();
            return false;
          });
        }
        if (!saved) setError('That didn’t save. Try again.');
      } finally {
        clearTimeout(timer);
        save.abort();
      }
      setBusy(null);
      // The board catches up on its next poll if this read is slow; it never holds the button.
      if (saved) void withDeadline(refresh(), CHECK_DEADLINE_MS).catch(() => undefined);
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
    const pool = poolFor(nextNo).filter(p => !chosen || chosen.has(p.id));
    if (pool.length < 2) {
      setError(chosen ? 'Choose at least two people to sit.' : 'Waiting for at least two people in the room.');
      return;
    }
    const roundNo = nextNo;
    void run(
      async signal => {
        setBusy('grouping');
        await new Promise(resolve => setTimeout(resolve, 30));
        const grouped = compute(roundNo, chosen);
        setBusy('saving');
        const showcase = !!chosen;
        const roundTag = settings.matchTag.trim() && settings.matchTag.trim() !== event.statementTag ? settings.matchTag.trim() : null;
        const id = await hostStartRound(event.id, roundNo, settings.groupSize, grouped, settings.minutes, settings.splitSpeakers, signal, {
          matchTag: roundTag,
          showcase,
        });
        // A showcase is one round's choice; the next round seats the room again unless chosen again.
        setChosen(null);
        return id;
      },
      // A lost answer for a start that did land: the same reset (Codex review).
      signal => roundExists(event.id, roundNo, signal).then(ok => {
        if (ok) setChosen(null);
        return ok;
      }),
    );
  };

  const commitSeats = (next: Seat[] | (() => Seat[]), label: string) => {
    if (!round) return;
    const before = seats.map(({ id, table, role }) => ({ id, table, role }));
    void run(async signal => {
      await hostSetRoundSeats(round.id, typeof next === 'function' ? next() : next, signal);
      setUndoStack(stack => [...stack, { roundId: round.id, seats: before, label }]);
    });
  };

  const seatOf = new Map(seats.map(s => [s.id, s]));
  const isOut = (id: string) => !!presence.get(id)?.leftAt;
  const waiting = members.filter(m => !seatOf.has(m.id) && !isOut(m.id));
  const outside = members.filter(m => !seatOf.has(m.id) && isOut(m.id));
  const here = members.filter(m => !isOut(m.id));

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
    void run(async signal => {
      await hostSetRoundSeats(round.id, last.seats, signal);
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

  const hasObserver = seats.some(s => s.role === 'observer');
  const timing = round ? roundTiming(round) : null;
  const clock = round && timing ? roundClock(round.startedAt, now, hasObserver, timing) : null;
  // The whole round's time left, beside the part's (founder: "time left per sub-round vs total").
  const roundLeftMs = clock ? (clock.phase === 'seating' ? clock.phaseRemainingMs : 0) + clock.talkRemainingMs : 0;

  const extend = () => {
    if (!round || !clock || clock.phase === 'over') return;
    const phase = clock.phase;
    void run(signal => hostExtendRound(round.id, phase, signal));
  };
  // "−1 min" (founder walkthrough 6): the server takes a minute off the part running now, never
  // more than what is left of it.
  const shorten = () => {
    if (!round || !clock || clock.phase === 'over') return;
    void run(signal => hostShortenRound(round.id, signal));
  };

  const canSwap = (id: string) =>
    !!lifted && lifted !== id && seatOf.has(lifted) && seatOf.has(id) && !isOut(lifted) && !isOut(id);
  const liftedActions = lifted ? (
    <span className="mt-1.5 flex w-full items-center justify-center">
      <button
        type="button"
        onClick={() => {
          setOut(lifted, !isOut(lifted));
          setLifted(null);
        }}
        className={cn(
          'min-h-10 rounded-md bg-white px-2.5 text-xs font-semibold lg:text-sm',
          isOut(lifted) ? 'text-blue-700' : 'text-red-600',
        )}
        data-testid="host-mark-left"
      >
        {isOut(lifted) ? 'Back in' : 'Out'}
      </button>
      {/* Cancel sits in the tile's corner, away from Out — side by side, ✕ read as a second
          "remove" (visual QA). Tapping the face cancels too. */}
      <button
        type="button"
        onClick={() => setLifted(null)}
        className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-md text-white/80 hover:text-white"
        aria-label="Cancel"
        data-testid="host-lift-cancel"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  ) : null;
  // The host decides how many rounds to run; "End the evening" (walkthrough 8) sits at the
  // bottom of the controls column, away from this button (walkthrough 9).
  const hasNext = !ended && nextNo <= MAX_ROUNDS;
  const primary = hasNext ? { label: round ? 'Next round' : `Start round ${nextNo}`, action: startNext } : null;
  const pastRounds = state.rounds.filter(r => r.id !== round?.id);

  return (
    <div className="mx-auto w-full max-w-lg lg:max-w-6xl px-4 pt-4 pb-16" data-testid="host-panel">
      <div className="flex items-start justify-between gap-3">
        <FocusHeader onBack={() => navigate(`/events/${slug}`)} label="Back" aria-label="Back to the event" />
        {/* Outline, not filled: the one filled button on this page is Next round (founder asked). */}
        <Button asChild variant="outline" size="sm" className="min-h-10 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800">
          <a href={`/events/${slug}/host?view=screen`} target="_blank" rel="noopener noreferrer" data-testid="host-screen-link">
            <Monitor className="h-4 w-4" /> Screen
          </a>
        </Button>
      </div>

      {/* Desktop: the room on the left, the controls on the right (founder, 2026-10-04). On a
          phone the controls come first — the button is what the host reaches for. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        {/* On a phone the whole page scrolls as one (founder walkthrough 9: a pinned clock card
            took most of the screen and only parts moved). Settings live in their own card below. */}
        <section
          className="rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-[calc(6rem+env(safe-area-inset-top))] lg:order-2 lg:col-start-2"
          data-testid="host-controls"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {(ended || round) && <span data-testid="host-round-title">{ended ? 'Evening ended' : `Round ${round?.roundNo}`}</span>}
            {(ended || round) && !ended && ' · '}
            {!ended && <span data-testid="host-room-count">{here.length} in the room</span>}
          </p>
          {clock && timing && (
            <div className="mt-1 space-y-3">
              {/* Clock and −1/+1 share one row that never wraps; the part line sits below at full
                  width. When they shared a wrapping row, the ticking text's width moved the buttons
                  up and down every second (founder walkthrough 9). */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <ClockNumber clock={clock} />
                </div>
                {clock.phase !== 'over' && (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={shorten}
                      disabled={!!busy}
                      data-testid="host-shorten"
                    >
                      −1 min
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      onClick={extend}
                      disabled={!!busy}
                      data-testid="host-extend"
                    >
                      +1 min
                    </Button>
                  </div>
                )}
              </div>
              {clock.phase !== 'over' && (
                <p className="text-sm" data-testid="host-part">
                  <span className="font-medium">{clock.phase === 'first' && !timing.split ? 'Talk' : PART_NAME[clock.phase]}</span>
                  <span className="whitespace-nowrap text-muted-foreground"> · {formatClock(roundLeftMs)} left in round</span>
                </p>
              )}
              <PhaseStrip clock={clock} timing={timing} hasObserver={hasObserver} />
            </div>
          )}
          {primary && justStarted && !busy && round && (
            // The start lock: a few seconds with nothing to press, and the button's place says why.
            <p className="mt-4 flex min-h-12 items-center justify-center text-base text-muted-foreground" data-testid="host-just-started">
              Round {round.roundNo} started
            </p>
          )}
          {primary && round && confirmNext && clock && clock.phase !== 'over' && (
            // Walkthrough 9 (reviews): time is still on the clock — one more tap, never a dialog.
            <div className="mt-4 rounded-lg border border-border p-3 text-sm" data-testid="host-next-confirm">
              <p>{formatClock(roundLeftMs)} left in this round. Start the next one now?</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  className="min-h-11 bg-blue-500 hover:bg-blue-600 text-white"
                  disabled={!!busy}
                  onClick={() => { setConfirmNext(false); primary.action(); }}
                  data-testid="host-next-yes"
                >
                  Start next round
                </Button>
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirmNext(false)}>
                  Keep going
                </Button>
              </div>
            </div>
          )}
          {primary && (!justStarted || busy) && !(round && confirmNext && clock && clock.phase !== 'over') && (
            <Button
              type="button"
              className="mt-4 w-full min-h-12 text-base bg-blue-500 hover:bg-blue-600 text-white"
              onClick={round && clock && clock.phase !== 'over' ? () => setConfirmNext(true) : primary.action}
              disabled={!!busy || !loaded}
              data-testid="host-primary"
            >
              {busy === 'grouping' ? 'Grouping…' : busy === 'saving' ? 'Saving…' : primary.label}
            </Button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </section>

          {hasNext && (
            <details className="group mt-3 rounded-xl border border-border bg-card px-4 py-1 shadow-sm lg:order-3 lg:col-start-2" data-testid="host-settings">
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
                {/* Walkthrough 7: two named choices instead of a checkbox — the minutes below follow
                    it ("Speaker N min" each, or one "Talk N min"). */}
                <div
                  className="inline-flex w-full rounded-lg bg-muted p-1"
                  role="group"
                  aria-label="How the pair talk"
                  data-testid="host-split-speakers"
                  data-split={settings.splitSpeakers ? 'true' : 'false'}
                >
                  {([
                    [true, 'Swap at half time', 'host-split-on'],
                    [false, 'One talk', 'host-split-off'],
                  ] as const).map(([split, label, testId]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={settings.splitSpeakers === split}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          splitSpeakers: split,
                          // An odd "Talk" leaves half minutes per speaker; swapping shows whole
                          // minutes, so store what it shows (Codex review).
                          minutes: split
                            ? { ...settings.minutes, speakerS: Math.max(60, Math.round(settings.minutes.speakerS / 60) * 60) }
                            : settings.minutes,
                        })
                      }
                      data-testid={testId}
                      className={cn(
                        'min-h-10 flex-1 rounded-md px-2 text-sm',
                        settings.splitSpeakers === split ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1" data-testid="host-minutes">
                  {MINUTE_FIELDS.filter(f => f.key !== 'observerS' || settings.groupSize > 2).map(f => {
                    // One talk: the speaker row is the whole talk — both halves, stored as two equal
                    // parts so the round clock and the server keep one shape (roundTiming adds them).
                    const talk = f.key === 'speakerS' && !settings.splitSpeakers;
                    const factor = talk ? 2 : 1;
                    const label = talk ? 'Talk' : f.label;
                    const value = Math.round((settings.minutes[f.key] * factor) / 60);
                    const set = (next: number) =>
                      setSettings({
                        ...settings,
                        minutes: { ...settings.minutes, [f.key]: (Math.min(f.max * factor, Math.max(f.min * factor, next)) * 60) / factor },
                      });
                    return (
                      <div key={f.key} className="flex items-center justify-between gap-3">
                        <span className="text-sm">{label}</span>
                        <div className="inline-flex items-center gap-1">
                          <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => set(value - 1)} disabled={value <= f.min * factor} aria-label={`${label}: one minute less`}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-14 text-center text-sm tabular-nums">{value} min</span>
                          <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => set(value + 1)} disabled={value >= f.max * factor} aria-label={`${label}: one minute more`}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
                <label className="flex items-center gap-3 text-sm min-h-10">
                  <span className="shrink-0">Match on</span>
                  <select
                    className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base md:text-sm"
                    value={settings.matchTag.trim() || event.statementTag || ''}
                    onChange={e => setSettings({ ...settings, matchTag: e.target.value === event.statementTag ? '' : e.target.value })}
                    data-testid="host-match-tag"
                  >
                    {!event.statementTag && <option value="">Choose a set</option>}
                    {/* A tag stored from before the list (or since removed from it) stays selectable. */}
                    {[...new Set([...matchOptions, settings.matchTag.trim()].filter(Boolean))].map(tag => (
                      <option key={tag} value={tag}>
                        {tag === event.statementTag ? `${eventTopic(event.title)} (this event)` : setLabel(tag)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm min-h-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-500"
                    checked={!!chosen}
                    onChange={e => setChosen(e.target.checked ? new Set() : null)}
                    data-testid="host-choose-toggle"
                  />
                  Choose who sits
                </label>
                {chosen && (
                  <div className="space-y-2" data-testid="host-choose">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {chosen.size} chosen · everyone else watches
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10"
                        onClick={() => setChosen(new Set(here.filter(m => m.profileId && recorderProfiles.has(m.profileId)).map(m => m.id)))}
                        data-testid="host-choose-recorders"
                      >
                        Recorders
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {here.map(m => {
                        const on = chosen.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setChosen(prev => {
                                const next = new Set(prev ?? []);
                                if (on) next.delete(m.id);
                                else next.add(m.id);
                                return next;
                              })
                            }
                            className={cn(
                              'min-h-10 rounded-full border px-3 text-sm',
                              on ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-border bg-background text-muted-foreground',
                            )}
                            data-testid="host-choose-person"
                          >
                            {shortName(m.displayName)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
          {round && (
            // Walkthrough 9: away from Next round, so a thumb meant for it cannot land here.
            <div className="mt-3 px-1 lg:order-4 lg:col-start-2" data-testid="host-end-area">
          {round && !confirmEnd && (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              disabled={!!busy}
              className="mt-2 inline-flex min-h-10 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              data-testid="host-end-evening"
            >
              End the evening
            </button>
          )}
          {round && confirmEnd && (
            <div className="mt-2 rounded-lg border border-border p-3 text-sm" data-testid="host-end-confirm">
              <p>End the evening? Every phone moves to the closing screen.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  disabled={!!busy}
                  onClick={() => {
                    setConfirmEnd(false);
                    void run(() => hostEndRounds(event.id));
                  }}
                  data-testid="host-end-yes"
                >
                  End it
                </Button>
                <Button type="button" variant="ghost" className="min-h-10" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </Button>
              </div>
            </div>
          )}
            </div>
          )}

        <div className="min-w-0 lg:order-1 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {!ended && (
            <section className="mt-5 space-y-4 lg:mt-0" data-testid="host-people">
              {round && clock && seats.length > 0 && (
                <TablesGrid
                  seats={seats}
                  byId={byId}
                  phase={clock.phase}
                  split={timing?.split ?? true}
                  marksFor={marksFor}
                  lifted={lifted}
                  isOut={isOut}
                  canSwap={canSwap}
                  actions={liftedActions}
                  onTap={onTap}
                />
              )}
              <PeopleGroup
                title={round ? 'Next round' : 'Here'}
                people={waiting}
                lifted={lifted}
                marksFor={marksFor}
                hideCount={!round}
                actions={liftedActions}
                onTap={onTap}
                action={
                  round && waiting.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      disabled={!!busy}
                      onClick={() => commitSeats(seatLate(seats, waiting.map(m => m.id)), 'seat now')}
                      data-testid="host-seat-now"
                    >
                      Seat now
                    </Button>
                  ) : null
                }
              />
              <PeopleGroup title="Out" people={outside} lifted={lifted} marksFor={marksFor} out actions={liftedActions} onTap={onTap} />

              {!lifted && round && undoStack.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={undo} disabled={!!busy} data-testid="host-undo">
                    <Undo2 className="h-3.5 w-3.5" /> Undo {undoStack[undoStack.length - 1]?.label}
                  </Button>
                </div>
              )}
            </section>
          )}

          {pastRounds.length > 0 && (
            // One line until opened (founder walkthrough 6): the rounds behind are rarely needed.
            <details className="group/past mt-6 rounded-xl border border-border bg-card px-4 py-2" data-testid="host-past-rounds">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-medium">Past rounds</span>
                <span className="text-muted-foreground tabular-nums">{pastRounds.length}</span>
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open/past:rotate-180" />
              </summary>
              <div className="space-y-2 pb-2 pt-1">
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
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventHostPage;
