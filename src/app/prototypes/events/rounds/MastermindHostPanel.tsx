/**
 * @file MastermindHostPanel.tsx
 * @description P1529 §3, §7: the sales mastermind's part of the host screen, beside Clarity Night's grid of people.
 *   - who is a participant and who an observer, one switch per person (host_set_observer), with what is missing in plain
 *     words when the server refuses;
 *   - each person's canvas, recording state (off · on, no words yet · words arriving) and the ready mark (D17);
 *   - the tables with nobody's words, which stand out;
 *   - the canvas-update step: start it, and each owner's state while it is on.
 * Every sentence is a draft: [FOUNDER DECISION: copy]. The page owns the round and the seating; this only shows and asks.
 * No sliders, scores or phases (D3).
 */
import { useState } from 'react';
import { AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EventRoomMember } from '@/app/types';
import { formatClock } from '@/lib/round-clock';
import { Avatar } from './host-screen-parts';
import { shortName } from './use-event-rounds';
import type { MastermindHost } from './use-mastermind-host';
import type { RecordingState } from '@/app/data/event-mastermind-service';
import { NOT_REGISTERED_LINE, RECORDING_WORDS, UPDATE_STATE_WORDS, canvasLine, isObserver, isUnregistered, observerRefusal } from './mastermind-host-helpers';
import { MastermindRegistrationNotes } from './MastermindRegistrationNotes';

/** [FOUNDER DECISION: copy] */
const COPY = {
  people: 'People',
  participant: 'Participant',
  observer: 'Observer',
  ready: 'Ready',
  readyHint: 'Their Clarity Canvas is shared and they have not owned a table yet. Setting up the next round seats them.',
  out: 'Out',
  silentTables: (nos: number[]) => `No words yet at table ${nos.join(', ')}`,
  updateOn: 'Canvas update is on',
  updateStart: 'Start canvas update',
  updateConfirm: (label: string, left: string) => `${label} has ${left} left. Starting the canvas update ends it now.`,
  updateKeep: 'Keep going',
  updateNoOwners: 'No Clarity Canvases are shared with this event.',
  lockedHint: 'Close the seating preview to change who observes.',
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

const UPDATE_TONE: Record<string, string> = {
  failed: 'font-semibold text-red-600',
  published: 'text-green-700',
  ready: 'font-medium text-blue-700',
  drafting: 'text-blue-700',
  not_tapped: 'text-muted-foreground',
};

function UpdateStep({ host, members, round, onStart, busy }: {
  host: MastermindHost;
  members: EventRoomMember[];
  round: { label: string; leftMs: number | null } | null;
  onStart: () => void;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  if (host.stepOn) {
    const owners = members.filter(m => m.profileId && host.updateStates.has(m.profileId));
    return (
      <section className="rounded-xl border border-border bg-card p-4" data-testid="mm-update-step">
        <h2 className="text-sm font-semibold">{COPY.updateOn}</h2>
        {owners.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{COPY.updateNoOwners}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border" data-testid="mm-update-states">
            {owners.map(m => {
              const state = host.updateStates.get(m.profileId as string) ?? 'not_tapped';
              return (
                <li key={m.id} className="flex min-h-10 items-center justify-between gap-3 text-sm" data-testid="mm-update-owner" data-state={state}>
                  <span className="min-w-0 truncate">{shortName(m.displayName)}</span>
                  <span className={cn('shrink-0', UPDATE_TONE[state])}>{UPDATE_STATE_WORDS[state]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }
  if (!round) return null;
  // The server ends the running round when the step starts (its transcript is cut there): a round with time on the
  // clock asks once, inline, like "End the evening".
  const ask = round.leftMs !== null && round.leftMs > 0;
  if (confirm && ask) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 text-sm" data-testid="mm-update-confirm">
        <p>{COPY.updateConfirm(round.label, formatClock(round.leftMs as number))}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setConfirm(false); onStart(); }} data-testid="mm-update-yes">
            {COPY.updateStart}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirm(false)}>{COPY.updateKeep}</Button>
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy} onClick={ask ? () => setConfirm(true) : onStart} data-testid="mm-update-start">
        {COPY.updateStart}
      </Button>
    </section>
  );
}

export function MastermindHostPanel({
  members,
  isOut,
  host,
  locked,
  updateRound,
  silentTableNos,
  busy,
  onStartUpdate,
}: {
  members: EventRoomMember[];
  isOut: (memberId: string) => boolean;
  host: MastermindHost;
  /** The seating preview is open: who observes is read-only meanwhile, so the preview is never stale. */
  locked: boolean;
  /** Offered after round 2 while a round is running; null otherwise. `leftMs` null = its clock is over. */
  updateRound: { label: string; leftMs: number | null } | null;
  silentTableNos: number[];
  busy: boolean;
  onStartUpdate: () => void;
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

  return (
    <div className="space-y-3" data-testid="mm-panel">
      {host.warning && <p role="status" className="text-sm text-muted-foreground" data-testid="mm-warning">{host.warning}</p>}
      {silentTableNos.length > 0 && (
        <p role="status" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" data-testid="mm-silent-tables">
          {COPY.silentTables(silentTableNos)}
        </p>
      )}
      <MastermindRegistrationNotes people={host.people ?? []} failed={!!host.warning} onRetry={() => void host.refresh?.()} />
      <UpdateStep host={host} members={members} round={updateRound} onStart={onStartUpdate} busy={busy} />
      <section className="rounded-xl border border-border bg-card px-4 py-2" data-testid="mm-people">
        <h2 className="flex min-h-10 items-center text-xs font-medium uppercase tracking-wide text-muted-foreground">{COPY.people}</h2>
        {locked && <p className="pb-1 text-xs text-muted-foreground">{COPY.lockedHint}</p>}
        <ul className="divide-y divide-border">
          {members.map(m => {
            const person = host.personOf(m.id);
            const observer = isObserver(person);
            const recording = host.recordingOf(m.id);
            const out = isOut(m.id);
            const name = shortName(m.displayName);
            return (
              <li key={m.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2', out && 'opacity-60')} data-testid="mm-person" data-observer={observer ? 'true' : 'false'}>
                <Avatar member={m} />
                <div className="min-w-[8rem] flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span className="truncate">{name}</span>
                    {out && <span className="text-xs font-normal text-muted-foreground">{COPY.out}</span>}
                    {host.isReady(m.id) && !out && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title={COPY.readyHint} data-testid="mm-ready">{COPY.ready}</span>
                    )}
                  </p>
                  {isUnregistered(person) && <p role="status" className="text-xs font-medium text-red-600" data-testid="mm-not-registered">{NOT_REGISTERED_LINE}</p>}
                  <p className="text-xs text-muted-foreground">{canvasLine(person)}</p>
                  <p className={cn('text-xs', RECORDING_TONE[recording])} data-testid="mm-recording" data-state={recording}>{RECORDING_WORDS[recording]}</p>
                </div>
                {locked ? (
                  <span className="text-xs text-muted-foreground">{observer ? 'Observer' : 'Participant'}</span>
                ) : (
                  <div className="inline-flex shrink-0 rounded-lg bg-muted p-1" role="group" aria-label={`${name}: participant or observer`}>
                    {([[false, COPY.participant, 'mm-set-participant'], [true, COPY.observer, 'mm-set-observer']] as const).map(([toObserver, text, id]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={observer === toObserver}
                        onClick={() => { if (observer !== toObserver) void flip(m, toObserver); }}
                        className={cn('min-h-10 rounded-md px-2.5 text-sm', observer === toObserver ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground')}
                        data-testid={id}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
                {refusal?.id === m.id && <p role="alert" className="basis-full text-sm text-red-600" data-testid="mm-observer-refusal">{refusal.text}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
