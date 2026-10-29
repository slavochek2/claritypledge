/**
 * @file CloseInRoom.tsx
 * @description P1542 founder UAT round: "Share feedback" opens INSIDE the event room, the way Learn does — the room's
 * ?view=feedback entry draws the existing close flow (EventClosePage's CloseFlow, unchanged sequence) under the room's
 * own "Back to the event" and step bar. /events/:slug/close stays the direct way in (emails, the QR code).
 *
 * The close's own read (get_event_close), made once per opening and only from a visible tab (metered rule 3); no cache.
 * The close itself is drawn only from a visible tab too, so its follow-up reads never start from a hidden one.
 * Someone the close does not belong to (no registration) is sent back to the room, as /close sends them to the event.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getEventClose, type CloseState } from '@/app/data/event-close-service';
import { Button } from '@/components/ui/button';
import { ClarityContentLoader } from '@/components/ui/clarity-loader';
import type { EventWithHost } from '@/app/types';
import { whenVisible } from '../when-visible';
import { CloseFlow, type CloseRoom } from './EventClosePage';

/** Where the room's pinned head ends, measured from the page top: whatever is really drawn above the close (P1542
 *  review G5). Read with the page at the top (opening a view scrolls there); a later resize re-reads only while still
 *  there, so the layout never shifts under someone mid-scroll. */
function useRoomHeadBottom(): number {
  const [bottom, setBottom] = useState(0);
  useLayoutEffect(() => {
    const el = document.querySelector('[data-testid="room-sticky-head"]');
    if (!el) return;
    const read = () => { if (window.scrollY < 1) setBottom(Math.round(el.getBoundingClientRect().bottom)); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return bottom;
}

export function CloseInRoom({ event, viewerId, room }: { event: EventWithHost; viewerId: string; room: Omit<CloseRoom, 'chromeTop'> }) {
  // Founder (2026-10-29, decision B reversed): the close's centred screens fill what is left under the room's head.
  const headBottom = useRoomHeadBottom();
  const [close, setClose] = useState<CloseState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    let cancelShow = () => undefined as void;
    const cancelWait = whenVisible(() => {
      getEventClose(event.id)
        // Final review (Z2): the close is drawn — and so starts its own follow-up reads — only from a visible tab, even
        // when the tab hid while this read was out.
        .then((c) => { if (!cancelled) cancelShow = whenVisible(() => { if (!cancelled) setClose(c); }); })
        .catch(() => { if (!cancelled) setFailed(true); });
    });
    return () => { cancelled = true; cancelWait(); cancelShow(); };
  }, [event.id, attempt]);
  // Leave once: the room's callbacks are new on every render, and a second pop would walk past the room.
  const left = useRef(false);
  const { leave } = room;
  useEffect(() => {
    if (!close || close.isAttendee || left.current) return;
    left.current = true;
    leave();
  }, [close, leave]);

  if (failed) {
    // P1542 review G8: a retry in place, like the in-room learning's.
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center" data-testid="close-in-room-failed">
        <p className="text-base text-muted-foreground">We could not load the feedback.</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => setAttempt((n) => n + 1)} data-testid="close-in-room-retry">Try again</Button>
      </div>
    );
  }
  if (!close || !close.isAttendee) return <ClarityContentLoader />;
  return <CloseFlow event={event} initial={close} viewerId={viewerId} room={{ ...room, chromeTop: headBottom }} />;
}
