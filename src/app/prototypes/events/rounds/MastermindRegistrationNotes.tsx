/**
 * @file MastermindRegistrationNotes.tsx
 * @description P1529 D24: two small things the host reads about registration, in the mastermind panel: how many people come at the
 * doors time (improving at the event, or an observer who prepares at the event), and the waiting list's names in the order
 * people joined. The list is read-only: the host raises the limit by hand and writes to people; nothing here promotes anyone.
 * Every sentence is a draft: [FOUNDER DECISION: copy].
 */
import { useEffect, useState } from 'react';
import { getEventWaitlist, type WaitlistPerson } from '@/app/data/event-waitlist';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import { startVisiblePoll } from '@/lib/visible-poll';
import { shortName } from './use-event-rounds';

const WAITLIST_POLL_MS = 30_000;

export const doorsCountLine = (n: number): string => `${n === 1 ? '1 person comes' : `${n} people come`} at the doors time`;

export function useWaitlist(eventId: string | undefined, enabled: boolean): WaitlistPerson[] {
  const [list, setList] = useState<WaitlistPerson[]>([]);
  useEffect(() => {
    if (!enabled || !eventId) return;
    let cancelled = false;
    const read = () => getEventWaitlist(eventId).then(l => { if (!cancelled) setList(l); }).catch(() => { /* keep what is shown */ });
    // A hidden tab makes no request (metered services rule 3); it reads again when shown.
    if (document.visibilityState !== 'hidden') void read();
    const stop = startVisiblePoll(() => void read(), WAITLIST_POLL_MS);
    return () => { cancelled = true; stop(); };
  }, [eventId, enabled]);
  return list;
}

export function MastermindRegistrationNotes({ eventId, people }: { eventId: string | undefined; people: MastermindPerson[] }) {
  const waiting = useWaitlist(eventId, true);
  const doors = people.filter(p => p.registered && comesAtDoors(p)).length;
  if (doors === 0 && waiting.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="mm-registration-notes">
      {doors > 0 && <p data-testid="mm-doors-count">{doorsCountLine(doors)}</p>}
      {waiting.length > 0 && (
        <div className={doors > 0 ? 'mt-3' : ''} data-testid="mm-waitlist">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting list</h2>
          <ol className="mt-1 list-decimal pl-5">
            {waiting.map(w => <li key={w.profileId} className="min-h-8" data-testid="mm-waitlist-person">{shortName(w.name)}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}
