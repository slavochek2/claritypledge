/**
 * @file MastermindRegistrationNotes.tsx
 * @description P1529 D24: two small things the host reads about registration, in the mastermind panel: how many people come at the
 * doors time (improving at the event, or an observer who prepares at the event), and the waiting list's names in the order
 * people joined. Both come with the host state (one request, the panel's existing cadence); the list is read-only: the host
 * raises the limit by hand and writes to people, and nothing here promotes anyone. A failed read says so, with Retry, rather
 * than showing an empty list. Every sentence is a draft: [FOUNDER DECISION: copy].
 */
import { Button } from '@/components/ui/button';
import { comesAtDoors } from '@/app/data/registration-answer-model';
import type { MastermindPerson } from '@/app/data/event-mastermind-service';
import { shortName } from './use-event-rounds';

export const doorsCountLine = (n: number): string => `${n === 1 ? '1 person comes' : `${n} people come`} at the doors time`;
export const WAITLIST_READ_FAILED = 'Could not read the waiting list just now.';

export function MastermindRegistrationNotes({ people, failed, onRetry }: {
  people: MastermindPerson[];
  /** The last read of the host state failed: what is shown may be missing people. */
  failed: boolean;
  onRetry: () => void;
}) {
  const waiting = people.filter(p => p.waitingPosition !== null).sort((a, b) => (a.waitingPosition as number) - (b.waitingPosition as number));
  const doors = people.filter(p => p.registered && comesAtDoors(p)).length;
  if (doors === 0 && waiting.length === 0 && !failed) return null;
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="mm-registration-notes">
      {doors > 0 && <p data-testid="mm-doors-count">{doorsCountLine(doors)}</p>}
      {failed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="alert" data-testid="mm-waitlist-error">
          <span>{WAITLIST_READ_FAILED}</span>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry} data-testid="mm-waitlist-retry">Retry</Button>
        </div>
      )}
      {waiting.length > 0 && (
        <div className={doors > 0 || failed ? 'mt-3' : ''} data-testid="mm-waitlist">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting list</h2>
          <ol className="mt-1 list-decimal pl-5">
            {waiting.map(w => <li key={w.profileId} className="min-h-8" data-testid="mm-waitlist-person">{shortName(w.name ?? 'Someone')}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}
