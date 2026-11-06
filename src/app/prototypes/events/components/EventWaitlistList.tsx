/**
 * @file EventWaitlistList.tsx
 * @description P1529 D24: the waiting list of a full mastermind event, shown just below Participants to the host and to registered
 * attendees. The host adds a person with one tap (host_add_from_waitlist registers them with their stored answers and the normal
 * confirmation email goes out). Renders nothing when the list is empty or unreadable. Same card and PersonRow as Participants.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { getWaitlistPublic, hostAddFromWaitlist, type WaitlistEntry } from '@/app/data/event-waitlist';

export interface EventWaitlistListProps {
  eventId: string;
  isHost: boolean;
  /** Called after a person was added, so the page can re-read the participants. */
  onAdded?: () => void;
  /** Never listed: the host's own profile (the host runs the room and is not a participant). */
  excludeProfileId?: string;
}

export function EventWaitlistList({ eventId, isHost, onAdded, excludeProfileId }: EventWaitlistListProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await getWaitlistPublic(eventId);
      setEntries(excludeProfileId ? all.filter((p) => p.profileId !== excludeProfileId) : all);
    } catch {
      // A failed read leaves the last list on screen; the page's own reads report their own failures.
    }
  }, [eventId, excludeProfileId]);

  useEffect(() => { void load(); }, [load]);

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
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-11 w-11 shrink-0 p-0 text-slate-600 hover:text-blue-600 sm:mr-0 sm:h-10 sm:w-auto sm:px-3"
                  data-testid="event-waitlist-add"
                  aria-label={`Add ${entry.name} to the participants`}
                  title={`Add ${entry.name} to the participants`}
                  disabled={pending !== null}
                  onClick={() => void add(entry)}
                >
                  <UserPlus className="h-4 w-4 sm:hidden" aria-hidden="true" />
                  <span className="hidden sm:inline">{pending === entry.profileId ? 'Adding…' : 'Add'}</span>
                </Button>
              ) : (
                <span className="whitespace-nowrap text-xs text-muted-foreground">{entry.position}</span>
              )
            }
          />
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="event-waitlist-error">{error}</p>}
    </div>
  );
}
