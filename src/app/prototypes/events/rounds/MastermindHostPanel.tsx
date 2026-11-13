/**
 * @file MastermindHostPanel.tsx
 * @description P1529 §3, §7: the pieces of the sales mastermind's host screen. The page places them; every person is shown ONCE per
 * phase of the evening (one list, never a list beside a grid):
 *   - before round 1: `MastermindPeople`, one row per person (canvas, mic, recording, Doors badge, participant or observer, mark out);
 *   - during a round: the tables (the page's grid), and `MastermindPeople` only for people with no table yet;
 *   - after the evening: nothing.
 * Also the one read-failure line and the silent-tables banner.
 * Every sentence is a draft: [FOUNDER DECISION: copy]. The page owns the round and the seating; this only shows and asks.
 * No sliders, scores or phases (D3).
 */
import { useState } from 'react';
import { AudioLines, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventRoomMember } from '@/app/types';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import { MIC_HINTS } from '../prep/PrepMarks';
import { Avatar } from './host-screen-parts';
import { shortName } from './use-event-rounds';
import type { MastermindHost } from './use-mastermind-host';
import type { RecordingState } from '@/app/data/event-mastermind-service';
import { NOT_REGISTERED_LINE, OPTED_OUT_MARK, PREVIEW_LOCK_LINE, RECORDING_WORDS, canvasLine, isObserver, isUnregistered, observerRefusal, READY_LABEL, READY_HINT } from './mastermind-host-helpers';

/** [FOUNDER DECISION: copy] */
const COPY = {
  participant: 'Participant',
  observer: 'Observer',
  ready: READY_LABEL,
  readyHint: READY_HINT,
  doors: 'Doors',
  doorsHint: 'Comes at the doors time to make their Clarity Canvas (or to prepare as an observer).',
  markOut: 'Mark out',
  silentTables: (nos: number[]) => `No words yet at table ${nos.join(', ')}`,
  retry: 'Retry',
};

const RECORDING_TONE = { off: 'text-muted-foreground', silent: 'text-blue-700', words: 'text-green-700' } as const;
/**
 * One person's recording state on their tile, replacing the red dot in this flow. Three shapes, not three colours alone:
 * a hollow ring (off), a solid blue dot (on, no words yet), waves in green (words arriving: success).
 */
export function RecordingMark({ state, lifted }: { state: RecordingState; lifted: boolean }) {
  const props = { title: RECORDING_WORDS[state], 'aria-label': RECORDING_WORDS[state], 'data-testid': 'mark-recording', 'data-state': state };
  if (state === 'words') return <AudioLines className={cn('h-3.5 w-3.5', lifted ? 'text-white' : 'text-green-600')} {...props} />;
  const ring = lifted ? 'ring-1 ring-white' : '';
  return state === 'silent'
    ? <span className={cn('h-2.5 w-2.5 rounded-full bg-blue-500', ring)} {...props} />
    : <span className={cn('h-2.5 w-2.5 rounded-full border border-muted-foreground', lifted && 'border-white')} {...props} />;
}

const PHONE_LETTER = { usbc: 'C', lightning: 'L', other: '?' } as const;

/** The one line when a read of the room failed (what is shown may be old), with Retry. Never two alerts for one failure. */
export function MastermindWarning({ host }: { host: MastermindHost }) {
  if (!host.warning) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-sm" data-testid="mm-warning">
      <span>{host.warning}</span>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void host.refresh()} data-testid="mm-warning-retry">{COPY.retry}</Button>
    </div>
  );
}

/** One compact line above the tables; the table's own number is red as well. */
export function SilentTablesBanner({ nos }: { nos: number[] }) {
  if (nos.length === 0) return null;
  return (
    <p role="status" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" data-testid="mm-silent-tables">
      {COPY.silentTables(nos)}
    </p>
  );
}

/**
 * One list of people, one row each: avatar and name with the Doors, Ready and not-registered marks, a line with the canvas, the mic and
 * the recording state, then the participant or observer switch and Mark out. `title` says which people these are in this phase.
 */
export function MastermindPeople({ title, members, host, onMarkOut, locked = false, connector = true, optedOut }: {
  title: string;
  members: EventRoomMember[];
  host: MastermindHost;
  onMarkOut: (memberId: string) => void;
  /** A seating preview is open: the switch and Mark out give way to one line (no dead disabled buttons). */
  locked?: boolean;
  /** Whether the mic connector (C / L / ?) shows: not while a round runs (UAT 2026-11-13 (d), H2). */
  connector?: boolean;
  /** H1: who opted out of the principle (a host-only mark, never a rule). */
  optedOut?: (memberId: string) => boolean;
}) {
  const [refusal, setRefusal] = useState<{ id: string; text: string } | null>(null);

  const flip = async (m: EventRoomMember, toObserver: boolean) => {
    setRefusal(null);
    const res = await host.setObserver(m.id, toObserver);
    if (!res.ok) {
      setRefusal({
        id: m.id,
        text: res.code === 'no_shared_canvas' ? observerRefusal(host.personOf(m.id), shortName(m.displayName)) : `Could not change ${shortName(m.displayName)}. Try again.`,
      });
    }
  };

  if (members.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-2" data-testid="mm-people">
      <h2 className="flex min-h-10 items-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} <span className="ml-1.5 tabular-nums">{members.length}</span>
      </h2>
      <ul className="divide-y divide-border">
        {members.map(m => {
          const person = host.personOf(m.id);
          const observer = isObserver(person);
          const recording = host.recordingOf(m.id);
          const name = shortName(m.displayName);
          const phone = person?.phone ?? null;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="mm-person" data-observer={observer ? 'true' : 'false'}>
              <Avatar member={m} />
              <div className="min-w-[8rem] flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                  <span className="truncate">{name}</span>
                  {person?.registered && comesAtDoors(person) && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title={COPY.doorsHint} data-testid="mm-doors">{COPY.doors}</span>
                  )}
                  {optedOut?.(m.id) && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" title="Opted out of the Clarity Meeting Principle" data-testid="mm-opted-out">{OPTED_OUT_MARK}</span>
                  )}
                  {host.isReady(m.id) && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title={COPY.readyHint} data-testid="mm-ready">{COPY.ready}</span>
                  )}
                </p>
                {isUnregistered(person) && <p role="status" className="text-xs font-medium text-red-600" data-testid="mm-not-registered">{NOT_REGISTERED_LINE}</p>}
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{canvasLine(person)}</span>
                  {connector && phone && (
                    <span className="inline-flex items-center" title={MIC_HINTS[phone]} aria-label={MIC_HINTS[phone]} data-testid="mm-mic">
                      <Mic className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-semibold leading-none">{PHONE_LETTER[phone]}</span>
                    </span>
                  )}
                  <span className={cn('inline-flex items-center', RECORDING_TONE[recording])} data-testid="mm-recording" data-state={recording}>
                    <RecordingMark state={recording} lifted={false} />
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {locked ? (
                  <p className="text-xs text-muted-foreground" data-testid="mm-locked">{PREVIEW_LOCK_LINE}</p>
                ) : (
                  <>
                    <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={`${name}: participant or observer`}>
                      {([[false, COPY.participant, 'mm-set-participant'], [true, COPY.observer, 'mm-set-observer']] as const).map(([toObserver, text, id]) => (
                        <Button
                          key={id}
                          type="button"
                          size="sm"
                          variant={observer === toObserver ? 'outline' : 'ghost'}
                          aria-pressed={observer === toObserver}
                          onClick={() => { if (observer !== toObserver) void flip(m, toObserver); }}
                          className={cn('h-10 min-h-10 px-2.5', observer === toObserver ? 'font-semibold' : 'font-normal text-muted-foreground')}
                          data-testid={id}
                        >
                          {text}
                        </Button>
                      ))}
                    </div>
                    {/* Design system rule 5: losing something is ghost with red text. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onMarkOut(m.id)}
                      className="h-10 min-h-10 px-2 font-medium text-red-600 hover:text-red-600"
                      data-testid="mm-mark-out"
                    >
                      {COPY.markOut}
                    </Button>
                  </>
                )}
              </div>
              {refusal?.id === m.id && <p role="alert" className="basis-full text-sm text-red-600" data-testid="mm-observer-refusal">{refusal.text}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
