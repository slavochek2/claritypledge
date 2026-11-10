/**
 * @file CanvasLinkConfirm.tsx
 * @description P1653 F3: [Yes, this is my business] [Not mine] under the mirror's "Is this your business?" reply. Two secondary pills (the send slot is
 * the only main action here); while a tap is out the same spot is a status, never a disabled button. A tap sends only the fixed token (canvas-link-confirm),
 * never agent text, and a ref makes two fast taps send once. A reply the canvas moved on from has no buttons; a tap that still arrives stale (a second tab)
 * is refused by the server, changes nothing, and the send's own refusal sentence says so (stale_view).
 */
import { useRef, useState } from 'react';
import { CANVAS_SECONDARY_PILL, CANVAS_THREAD_TEXT_COLUMN } from '@/app/components/canvas/canvas-pill-styles';
import { LINK_NO_LABEL, LINK_NO_TOKEN, LINK_YES_LABEL, LINK_YES_TOKEN, type LinkTap } from './canvas-link-confirm';
import { SEND_SLOT_UPDATING } from './canvas-thread-copy';

const PLACE = `${CANVAS_THREAD_TEXT_COLUMN} py-1`; // under the words, as Undo and the offer rows

export function CanvasLinkConfirm({ live, send }: { live: boolean; send: ((body: string, tap: LinkTap) => Promise<boolean>) | null }) {
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false); // state lags a render: two clicks in one tick must send once
  if (!live || !send) return null; // answered or moved past: nothing to tap
  if (sending) return <p role="status" className={`${PLACE} flex h-10 items-center text-sm text-muted-foreground`} data-testid="canvas-link-confirm-status">{SEND_SLOT_UPDATING}</p>;
  const tap = async (token: string, which: LinkTap) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await send(token, which); // a refusal is said by the send itself (toast); the thread re-reads either way
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  return (
    <div className={`${PLACE} flex flex-wrap gap-2`} data-testid="canvas-link-confirm">
      <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-link-yes" onClick={() => void tap(LINK_YES_TOKEN, 'yes')}>{LINK_YES_LABEL}</button>
      <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-link-no" onClick={() => void tap(LINK_NO_TOKEN, 'no')}>{LINK_NO_LABEL}</button>
    </div>
  );
}
