/**
 * @file use-event-room-counts.ts
 * @description P1675 section 6: reads get_event_room_counts when enabled and every 30 s while mounted and the tab is visible
 * (the Cost Budget cadence; a hidden tab makes no request, metered-services rule 3, via startVisiblePoll); stops on unmount.
 * A failed read keeps what is shown.
 */
import { useEffect, useState } from 'react';
import { getEventRoomCounts, type EventRoomCounts } from '@/app/data/event-room-counts';
import { startVisiblePoll } from '@/lib/visible-poll';

export function useEventRoomCounts(eventId: string | undefined, enabled: boolean): EventRoomCounts | null {
  const [counts, setCounts] = useState<EventRoomCounts | null>(null);
  useEffect(() => {
    setCounts(null);
    if (!eventId || !enabled) return;
    let cancelled = false;
    const read = () => {
      void getEventRoomCounts(eventId).then((c) => { if (!cancelled && c) setCounts(c); });
    };
    if (document.visibilityState !== 'hidden') read();
    const stop = startVisiblePoll(read, 30_000);
    return () => { cancelled = true; stop(); };
  }, [eventId, enabled]);
  return counts;
}
