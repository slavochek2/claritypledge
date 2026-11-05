/**
 * @file use-waitlist-state.ts
 * @description P1529 D24: whether the signed-in person is on this event's waiting list, and the quiet "Leave the waiting list".
 * Read only in a flow that asks, for someone without a place (one read of their own row), and whether or not the event is
 * still full: if the limit was raised they are still listed and see Register with their answers filled in. Joining sets it
 * from the registration step; a registration removes the entry on the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getMyWaitlistEntry, leaveWaitlist } from '@/app/data/event-waitlist';
import type { RegistrationAnswers } from '@/app/data/registration-answer-model';

export function useWaitlistState(event: { id: string; slug: string } | null | undefined, userId: string | undefined, enabled: boolean) {
  const [onList, setOnList] = useState(false);
  const [entry, setEntry] = useState<RegistrationAnswers | null>(null);
  const [leaving, setLeaving] = useState(false);
  const eventId = event?.id;
  const slug = event?.slug;

  useEffect(() => {
    if (!enabled || !eventId || !userId) { setOnList(false); setEntry(null); return; }
    let cancelled = false;
    getMyWaitlistEntry(eventId, userId)
      .then(e => { if (!cancelled) { setOnList(!!e); setEntry(e); } })
      .catch(() => { /* the button then offers the list again, which answers "already" */ });
    return () => { cancelled = true; };
  }, [enabled, eventId, userId]);

  const leave = useCallback(async () => {
    if (!slug) return;
    setLeaving(true);
    try {
      await leaveWaitlist(slug);
      setOnList(false);
      setEntry(null);
    } catch {
      toast.error("Couldn't take you off the waiting list. Please try again.");
    } finally {
      setLeaving(false);
    }
  }, [slug]);

  return { onList, setOnList, entry, leaving, leave };
}
