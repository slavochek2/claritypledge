/**
 * @file EventWaitlistList.tsx
 * @description P1529 D24: the waiting list of a full mastermind event, shown just below Participants to the host and to registered
 * attendees. The host adds a person with one tap (host_add_from_waitlist registers them with their stored answers and the normal
 * confirmation email goes out). Renders nothing when the list is empty or unreadable. Same card and PersonRow as Participants.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { getWaitlistPublic, hostAddFromWaitlist, type WaitlistEntry } from '@/app/data/event-waitlist';
import { whenVisible } from '../when-visible';

export interface EventWaitlistListProps {
  eventId: string;
  isHost: boolean;
  /** Called after a person was added, so the page can re-read the participants. */
  onAdded?: () => void;
  /** Never listed: the host's own profile (the host runs the room and is not a participant). */
  excludeProfileId?: string;
  /** When this value changes the list is read again (the host screen passes a value that moves with its poll). */
  refreshKey?: unknown;
}

export function EventWaitlistList({ eventId, isHost, onAdded, excludeProfileId, refreshKey }: EventWaitlistListProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [readFailed, setReadFailed] = useState(false);

  const [retrying, setRetrying] = useState(false);
  // Only the latest read's result is applied: an older response arriving late never overwrites a newer list.
  const generation = useRef(0);

  // The exclude filter is applied at render, so reads depend only on eventId and refreshKey.
  const [allEntries, setAllEntries] = useState<WaitlistEntry[]>([]);
  const entries = excludeProfileId ? allEntries.filter((p) => p.profileId !== excludeProfileId) : allEntries;
  const setEntries = setAllEntries;

  const load = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const all = await getWaitlistPublic(eventId);
      if (mine !== generation.current) return;
      setEntries(all);
      setReadFailed(false);
    } catch {
      if (mine !== generation.current) return;
      // The last list stays on screen, and the failure is said: an unreadable list is not an empty one.
      setReadFailed(true);
    }
  }, [eventId, setEntries]);

  const retry = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  // Metered rule 3: no request from a hidden tab; the read waits until the tab is seen.
  useEffect(() => whenVisible(() => { void load(); }), [load, refreshKey]);

  const add = async (entry: WaitlistEntry) => {
    setPending(entry.profileId);
    setError(null);
    try {
      await hostAddFromWaitlist(eventId, entry.profileId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not add this person';
      setError(message);
      toast.error(message);
      setPending(null);
      return;
    }
    setEntries((prev) => prev.filter((p) => p.profileId !== entry.profileId));
    setPending(null);
    toast.success(`${entry.name} is in.`);
    onAdded?.();
    void load();
  };

  if (readFailed && entries.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm p-6 flex items-center justify-between gap-3" data-testid="event-waitlist-read-error">
        {/* [FOUNDER DECISION: copy] */}
        <p className="text-sm text-destructive" role="alert">Could not read the waiting list just now.</p>
        <Button type="button" size="sm" className="h-11 min-h-11" disabled={retrying} onClick={() => void retry()} data-testid="event-waitlist-retry">{retrying ? 'Retrying…' : 'Retry'}</Button>
      </div>
    );
  }
  if (entries.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6" data-testid="event-waitlist">
      <h2 className="font-semibold text-sm text-muted-foreground mb-4">Waiting list ({entries.length})</h2>
      <div className="space-y-2">
        {entries.map((entry) => (
          <PersonRow
            key={entry.profileId}
            profileId={entry.profileId}
            slug={entry.slug}
            name={entry.name}
            avatarColor={entry.avatarColor}
            avatarUrl={entry.avatarUrl}
            isPledger={entry.hasPledged}
            showEarBadge={false}
            stackOnPhone={isHost}
            trailing={
              isHost ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="-mr-2 h-11 w-11 shrink-0 p-0 sm:mr-0 sm:h-10 sm:w-auto sm:px-3"
                  data-testid="event-waitlist-add"
                  aria-label={`Add ${entry.name}`}
                  title={`Add ${entry.name} to the participants`}
                  disabled={pending !== null}
                  onClick={() => void add(entry)}
                >
                  {pending === entry.profileId
                    ? <Loader2 className="h-4 w-4 animate-spin sm:hidden" aria-hidden="true" data-testid="event-waitlist-adding" />
                    : <UserPlus className="h-4 w-4 sm:hidden" aria-hidden="true" />}
                  <span className="hidden sm:inline">{pending === entry.profileId ? 'Adding…' : 'Add'}</span>
                </Button>
              ) : (
                <span className="whitespace-nowrap text-xs text-muted-foreground">{entry.position}</span>
              )
            }
          />
        ))}
      </div>
      {readFailed && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="event-waitlist-stale">
          Could not refresh the waiting list. <Button type="button" size="sm" className="ml-1 h-10 min-h-10 align-middle" disabled={retrying} onClick={() => void retry()} data-testid="event-waitlist-stale-retry">{retrying ? 'Retrying…' : 'Retry'}</Button>
        </p>
      )}
      {error && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="event-waitlist-error">{error}</p>}
    </div>
  );
}
