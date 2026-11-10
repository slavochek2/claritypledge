/**
 * @file CanvasLinkConfirm.tsx
 * @description P1653 F3: [Yes, this is my business] [Not mine] under the mirror's "Is this your business?" reply. Two secondary pills (the send slot is
 * the only main action here); while a tap is out the same spot is a status, never a disabled button. A tap sends only the fixed token (canvas-link-confirm),
 * never agent text. A reply the canvas moved on from has no buttons; a tap that still arrives stale (a second tab) is refused by the server, changes
 * nothing, and the send's own refusal sentence says so (stale_view).
 */
import { useState } from 'react';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { LINK_NO_LABEL, LINK_NO_TOKEN, LINK_YES_LABEL, LINK_YES_TOKEN } from './canvas-link-confirm';
import { SEND_SLOT_UPDATING } from './canvas-thread-copy';

const PLACE = 'pl-[62px] pr-4 py-1'; // under the words, as the offer rows

export function CanvasLinkConfirm({ live, send }: { live: boolean; send: ((body: string) => Promise<boolean>) | null }) {
  const [sending, setSending] = useState(false);
  if (!live || !send) return null; // answered or moved past: nothing to tap. A tap that still arrives stale (another tab) is refused by the server and the send says so.
  if (sending) return <p role="status" className={`${PLACE} flex h-10 items-center text-sm text-muted-foreground`} data-testid="canvas-link-confirm-status">{SEND_SLOT_UPDATING}</p>;
  const tap = async (token: string) => {
    setSending(true);
    try {
      await send(token); // a refusal is said by the send itself (toast); the thread re-reads either way
    } finally {
      setSending(false);
    }
  };
  return (
    <div className={`${PLACE} flex flex-wrap gap-2`} data-testid="canvas-link-confirm">
      <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-link-yes" onClick={() => void tap(LINK_YES_TOKEN)}>{LINK_YES_LABEL}</button>
      <button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-link-no" onClick={() => void tap(LINK_NO_TOKEN)}>{LINK_NO_LABEL}</button>
    </div>
  );
}
