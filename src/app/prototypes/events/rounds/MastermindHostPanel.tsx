/**
 * @file MastermindHostPanel.tsx
 * @description P1529 §3, §7: the pieces of the sales mastermind's host screen. The page places them; every person is shown ONCE per
 * phase of the evening (one list, never a list beside a grid):
 *   - before round 1: `MastermindPeople`, one row per person (canvas, mic, recording, Doors badge, participant or observer, mark out);
 *   - during a round: the tables (the page's grid), and `MastermindPeople` only for people with no table yet;
 *   - at the canvas-update step: `CanvasUpdateOwners` (the primary content), and `MastermindPeople` for the people who are not owners;
 *   - after the evening: nothing.
 * Also the one read-failure line, the silent-tables banner and the update step's start button.
 * Every sentence is a draft: [FOUNDER DECISION: copy]. The page owns the round and the seating; this only shows and asks.
 * No sliders, scores or phases (D3).
 */
import { useState } from 'react';
import { AudioLines, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventRoomMember } from '@/app/types';
import { formatClock } from '@/lib/round-clock';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import { MIC_HINTS } from '../prep/PrepMarks';
import { Avatar } from './host-screen-parts';
import { shortName } from './use-event-rounds';
import type { MastermindHost } from './use-mastermind-host';
import type { RecordingState } from '@/app/data/event-mastermind-service';
import { NOT_REGISTERED_LINE, PREVIEW_LOCK_LINE, RECORDING_WORDS, UPDATE_STATE_WORDS, canvasLine, isObserver, isUnregistered, observerRefusal, READY_LABEL, READY_HINT } from './mastermind-host-helpers';

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
  updateTitle: 'Canvas update',
  updatePublished: (done: number, all: number) => `${done} of ${all} published`,
  updateStart: 'Start canvas update',
  updateConfirm: (label: string, left: string) => `${label} has ${left} left. Starting the canvas update ends it now.`,
  updateEnd: (label: string) => `End ${label} & start update`,
  updateKeep: 'Keep going',
  updateNoOwners: 'No Clarity Canvases are shared with this event.',
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
 * The canvas-update step's start (the primary action while round 2 runs). The server ends the running round when the step starts
 * (its transcript is cut there): a round with time on the clock asks once, inline, and the button says what it ends.
 */
export function CanvasUpdateStart({ round, onStart, busy }: {
  round: { label: string; leftMs: number | null };
  onStart: () => void;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const ask = round.leftMs !== null && round.leftMs > 0;
  if (confirm && ask) {
    return (
      <div className="mt-4 rounded-lg border border-border p-3 text-sm" data-testid="mm-update-confirm">
        <p>{COPY.updateConfirm(round.label, formatClock(round.leftMs as number))}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={busy} onClick={() => { setConfirm(false); onStart(); }} data-testid="mm-update-yes">
            {COPY.updateEnd(round.label)}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirm(false)}>{COPY.updateKeep}</Button>
        </div>
      </div>
    );
  }
  return (
    <Button
      type="button"
      className="mt-4 min-h-12 w-full text-base"
      disabled={busy}
      onClick={ask ? () => setConfirm(true) : onStart}
      data-testid="mm-update-start"
    >
      {COPY.updateStart}
    </Button>
  );
}

const UPDATE_TONE: Record<string, string> = {
  failed: 'font-semibold text-red-600',
  published: 'text-green-700',
  ready: 'font-medium text-blue-700',
  drafting: 'text-blue-700',
  not_tapped: 'text-muted-foreground',
};
/** Who needs the host first: a failed run, then someone who has not started, drafting, ready, and published last. */
const UPDATE_ORDER: Record<string, number> = { failed: 0, not_tapped: 1, drafting: 2, ready: 3, published: 4 };

/** The owners of a Clarity Canvas and where each one is in the update: the whole content of the screen at the step. */
export function CanvasUpdateOwners({ host, members }: { host: MastermindHost; members: EventRoomMember[] }) {
  const owners = members
    .filter(m => m.profileId && host.updateStates.has(m.profileId))
    .map((m, i) => ({ m, i, state: host.updateStates.get(m.profileId as string) ?? 'not_tapped' }))
    .sort((a, b) => (UPDATE_ORDER[a.state] ?? 1) - (UPDATE_ORDER[b.state] ?? 1) || a.i - b.i);
  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="mm-update-step">
      <h2 className="text-sm font-semibold">
        {COPY.updateTitle}
        {owners.length > 0 && (
          <span className="font-normal text-muted-foreground" data-testid="mm-update-count"> · {COPY.updatePublished(owners.filter(o => o.state === 'published').length, owners.length)}</span>
        )}
      </h2>
      {owners.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{COPY.updateNoOwners}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border" data-testid="mm-update-states">
          {owners.map(({ m, state }) => (
            <li key={m.id} className="flex min-h-10 items-center justify-between gap-3 text-sm" data-testid="mm-update-owner" data-state={state}>
              <span className="min-w-0 truncate">{shortName(m.displayName)}</span>
              <span className={cn('shrink-0', UPDATE_TONE[state])}>{UPDATE_STATE_WORDS[state]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One list of people, one row each: avatar and name with the Doors, Ready and not-registered marks, a line with the canvas, the mic and
 * the recording state, then the participant or observer switch and Mark out. `title` says which people these are in this phase.
 */
export function MastermindPeople({ title, members, host, onMarkOut, locked = false }: {
  title: string;
  members: EventRoomMember[];
  host: MastermindHost;
  onMarkOut: (memberId: string) => void;
  /** A seating preview is open: the switch and Mark out give way to one line (no dead disabled buttons). */
  locked?: boolean;
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
                  {host.isReady(m.id) && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title={COPY.readyHint} data-testid="mm-ready">{COPY.ready}</span>
                  )}
                </p>
                {isUnregistered(person) && <p role="status" className="text-xs font-medium text-red-600" data-testid="mm-not-registered">{NOT_REGISTERED_LINE}</p>}
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{canvasLine(person)}</span>
                  {phone && (
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
