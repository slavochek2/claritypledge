/**
 * @file use-waitlist-state.ts
 * @description P1529 D24: whether the signed-in person is on this event's waiting list, read only while the event is full for
 * them (nobody else reads it), and the quiet "Leave the waiting list". Joining sets it from the registration step.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { isOnWaitlist, leaveWaitlist } from '@/app/data/event-waitlist';

export function useWaitlistState(event: { id: string; slug: string } | null | undefined, userId: string | undefined, enabled: boolean) {
  const [onList, setOnList] = useState(false);
  const eventId = event?.id;
  const slug = event?.slug;

  useEffect(() => {
    if (!enabled || !eventId || !userId) { setOnList(false); return; }
    let cancelled = false;
    isOnWaitlist(eventId, userId).then(v => { if (!cancelled) setOnList(v); }).catch(() => { /* the button then offers the list again, which answers "already" */ });
    return () => { cancelled = true; };
  }, [enabled, eventId, userId]);

  const leave = useCallback(async () => {
    if (!slug) return;
    try {
      await leaveWaitlist(slug);
      setOnList(false);
    } catch {
      toast.error("Couldn't take you off the waiting list. Please try again.");
    }
  }, [slug]);

  return { onList, setOnList, leave };
}
