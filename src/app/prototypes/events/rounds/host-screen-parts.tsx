/**
 * @file host-screen-parts.tsx
 * @description The round clock, the phase strip, the projector's bell, the viewport and the table grouping that the host
 * panel and both projectors (Clarity Night's ScreenView and the mastermind's MastermindScreen) share. Moved here
 * unchanged from EventHostPage.tsx (P1529) so the two projectors do not import each other's page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { cn } from '@/lib/utils';
import { formatClock, roundClock, roundTiming, type RoundClock, type RoundPhase, type RoundTiming } from '@/lib/round-clock';
import type { Seat } from '@/lib/round-grouping';
import type { EventRound } from '@/app/data/event-rounds-service';
import type { EventRoomMember } from '@/app/types';
import { useNow } from './use-event-rounds';

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

export function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export interface Table {
  no: number;
  first?: Seat;
  second?: Seat;
  observers: Seat[];
}

export function groupByTable(seats: Seat[]): Table[] {
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

export function tableSeats(t: Table): Seat[] {
  return [t.first, t.second, ...t.observers].filter((s): s is Seat => !!s);
}

export function useClock(round: EventRound | null, seats: Seat[]) {
  const now = useNow(!!round);
  if (!round) return null;
  return roundClock(round.startedAt, now, seats.some(s => s.role === 'observer'), roundTiming(round));
}

export function Avatar({ member, className }: { member: EventRoomMember | undefined; className?: string }) {
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
export function ClockNumber({ clock, large }: { clock: RoundClock; large?: boolean }) {
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
export function PhaseStrip({
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

export function useBell() {
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
export function useRoundBell(round: EventRound | null, phase: RoundPhase | undefined, bell: ReturnType<typeof useBell>) {
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
