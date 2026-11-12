/**
 * @file MastermindScreen.tsx
 * @description P1529 §5: the sales mastermind's projector (`?view=screen` while the event's flow is the mastermind).
 * It shows the round's name, the clock, every table (its number, the Clarity Canvas owner, their partner and the
 * observers). The rules are spoken and on the lanyard badges, so no rule line. It never shows a pair's phase or a half-time swap, and has no swap bell: the
 * round's end-of-round bell is the shared one. Readable from a distance.
 * Every sentence is a draft: [FOUNDER DECISION: copy].
 */
import { type CSSProperties } from 'react';
import { roundTiming } from '@/lib/round-clock';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventRoomMember } from '@/app/types';
import type { EventRound } from '@/app/data/event-rounds-service';
import type { Seat } from '@/lib/round-grouping';
import { SCREEN_CARD_MAX_EM, SCREEN_GAP, SCREEN_PAD, screenLayout } from '@/lib/round-screen-layout';
import { nextRoundLabel, roundLabel } from '@/lib/round-numbering';
import { Avatar, ClockNumber, PhaseStrip, groupByTable, tableSeats, useBell, useClock, useRoundBell, useViewport } from './host-screen-parts';
import { firstName, shortName } from './use-event-rounds';
import { SCREEN_PART_CAPTION } from './mastermind-host-helpers';
import { CanvasSetupScreen } from './CanvasSetupParts';

/** The header: the round name, the time left and the clock on one row, the phase strip full width on a row under it. */
const MASTERMIND_HEADER = 190;

/** screenLayout counts 2.1 type-heights per seat; a role word under the name makes it about 2.7. */
/** The small lowercase role word under each name. */
const SEAT_ROLE_WORD: Record<Seat['role'], string> = { first: 'Clarity Canvas owner', second: 'partner', observer: 'observer' };

const SEAT_HEIGHT_WITH_ROLE = 2.7 / 2.1;

export function MastermindScreen({ round, rounds, seats, byId, room, ended, setupLeftMs = null }: {
  round: EventRound | null;
  rounds: EventRound[];
  seats: Seat[];
  byId: Map<string, EventRoomMember>;
  room: EventRoomMember[];
  ended: boolean;
  /** P1529 E5: the "Make your Clarity Canvas" part is running (time left); null otherwise. */
  setupLeftMs?: number | null;
}) {
  const clock = useClock(round, seats);
  const hasObserver = seats.some(s => s.role === 'observer');
  const timing = round ? roundTiming(round) : null;
  const bell = useBell();
  useRoundBell(round, clock?.phase, bell);
  const { w, h } = useViewport();
  const tables = groupByTable(seats);
  const maxSeats = Math.max(2, ...tables.map(t => tableSeats(t).length));
  const wide = w >= 768;
  // Each seat carries a small role word under the name.
  const layout = wide
    ? screenLayout(tables.length, maxSeats * SEAT_HEIGHT_WITH_ROLE, w, h, MASTERMIND_HEADER)
    : { cols: 1, rows: tables.length, fontPx: 20 };
  const crowded = layout.fontPx < 26;
  const gridStyle: CSSProperties = wide
    ? {
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: tables.length <= 2 ? `repeat(${layout.rows}, auto)` : `repeat(${layout.rows}, minmax(0, 1fr))`,
        alignContent: tables.length <= 2 ? 'center' : undefined,
        maxWidth: layout.cols * SCREEN_CARD_MAX_EM * layout.fontPx + SCREEN_GAP * (layout.cols - 1),
        width: '100%',
        marginInline: 'auto',
        alignItems: 'start', // each table card is as tall as its people: no empty bottom
      }
    : {};
  return (
    <div
      className={cn('fixed inset-0 z-[100] bg-white print:static', wide ? 'flex flex-col overflow-hidden' : 'overflow-auto')}
      style={{ padding: SCREEN_PAD }}
      data-testid="host-screen"
      data-flow="sales-mastermind"
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
      {round && clock && timing ? (
        <>
          <div className={cn('flex flex-col justify-center gap-3', wide && 'overflow-hidden')} style={wide ? { height: MASTERMIND_HEADER - SCREEN_GAP } : undefined}>
            <div className={cn('flex gap-x-10 gap-y-4', wide ? 'items-center' : 'flex-col')}>
              <h1 className="min-w-0 flex-1 truncate text-3xl font-semibold text-foreground sm:text-4xl" data-testid="screen-part">
                {roundLabel(rounds, round)}
                {SCREEN_PART_CAPTION[clock.phase] ? ` \u00b7 ${SCREEN_PART_CAPTION[clock.phase]}` : ''}
              </h1>
              <div className="shrink-0 print:hidden">
                <ClockNumber clock={clock} large />
              </div>
            </div>
            {/* Full width on its own row; below 1024px the parts give up their label room (the labels truncate) instead of overflowing. */}
            {wide && <div className="min-w-0 print:hidden [&_li]:!min-w-0"><PhaseStrip clock={clock} timing={timing} hasObserver={hasObserver} large noLabels /></div>}
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
                      <li key={s.id} data-testid="screen-seat" data-role={s.role}>
                        <div className="flex items-center gap-[0.5em]">
                          <span className="shrink-0 [&>div]:!block [&>div]:!h-full [&>div]:!w-full" style={{ width: '2.67em', height: '2.67em', fontSize: '0.6em' }}>
                            <Avatar member={m} className="!h-full !w-full !text-[1em] !ring-offset-1" />
                          </span>
                          <span className="min-w-0 leading-tight">
                            <span className="block font-medium" style={{ fontSize: '1.75rem' }}>{crowded ? shortName(m?.displayName ?? '—') : m?.displayName ?? '—'}</span>
                            <span className="block text-foreground/70" style={{ fontSize: '1.25rem' }} data-testid="screen-seat-role">{SEAT_ROLE_WORD[s.role]}</span>
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
      ) : setupLeftMs !== null ? (
        <CanvasSetupScreen leftMs={setupLeftMs} />
      ) : (
        <div className="grid min-h-[80vh] place-items-center text-center">
          <div>
            <h1 className="text-5xl font-semibold sm:text-7xl">{ended ? 'Evening ended' : `${nextRoundLabel(rounds, false)} starts soon`}</h1>
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
