/**
 * @file use-event-share-offer.ts
 * @description P1529 (UAT 2026-11-13 (b), F7): after Publish succeeds on a canvas opened from an event, when that canvas is not yet shared with the
 * event, a dialog asks whether to share it. Share uses the event's existing share actions (the same two the preparation step uses:
 * `set_event_canvas`, or `share_canvas` once round 1 has started); Not now closes it. Either way the page then goes where Publish was going.
 * Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { canvasService } from '@/app/data/canvas-service';
import { getMyEventCanvas, setEventCanvas } from '@/app/data/event-mastermind-service';

export const EVENT_SHARE_COPY = {
  title: "Published. Share your Clarity Canvas with this event's attendees?",
  share: 'Share',
  notNow: 'Not now',
  failed: "Couldn't share your Clarity Canvas. Try again.",
};

interface Offer { eventId: string; name: string; fixed: boolean }

/** `leave` runs once the person has answered (or when nothing is to be asked): where Publish was going. */
export function useEventShareOffer(leave: () => void, onShared?: () => void) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A read that lands after the page is gone changes nothing (no state set, no navigation).
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ask = useCallback((eventId: string, name: string) => {
    setError(null); // a new offer never opens with the last offer's failure on it
    getMyEventCanvas(eventId)
      .then(c => { if (!alive.current) return; if (c?.shared && c.name === name) leave(); else setOffer({ eventId, name, fixed: !!c?.fixed }); })
      // An unreadable state is not "already shared": the question is asked anyway, and Share runs the normal path (set, then the share_canvas fallback).
      .catch(() => { if (alive.current) setOffer({ eventId, name, fixed: false }); });
  }, [leave]);

  const close = useCallback(() => { setOffer(null); setError(null); leave(); }, [leave]);
  const share = useCallback(async () => {
    if (!offer) return;
    setBusy(true);
    setError(null);
    try {
      // Before round 1 the choice is set; once it has started (or was refused meanwhile) the same canvas is shared through share_canvas, as the preparation step does.
      const refused = offer.fixed || (await setEventCanvas(offer.eventId, offer.name)).status === 'refused';
      if (refused) await canvasService.shareCanvas(offer.name, 'event', offer.eventId);
      onShared?.(); // the page re-reads: its Share status was read before this share
      if (!alive.current) return;
      setBusy(false);
      close();
    } catch {
      if (!alive.current) return;
      setBusy(false);
      setError(EVENT_SHARE_COPY.failed); // stays open: Share tries again, Not now leaves
    }
  }, [offer, close, onShared]);

  return { offer, ask, share, notNow: close, busy, error };
}
