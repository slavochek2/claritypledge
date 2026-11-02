/**
 * @file use-canvas-root-card.ts
 * @description P1536 3c X11: what a canvas thread root's draft is, for the one place besides the card that needs it (its "N replies" link): the root's card, read
 * through its thread (getCanvasRootCard shares the read with the card's own, so a root asks once). `null` while unknown and when it cannot be read: neither
 * shows a link.
 */
import { useEffect, useState } from 'react';
import { getCanvasRootCard, type CanvasVersionCardData } from '@/app/data/canvas-draft-service';

export function useCanvasRootCard(rootId: string, versionId: string | null | undefined, viewerId: string): CanvasVersionCardData | null {
  const [read, setRead] = useState<{ key: string; card: CanvasVersionCardData | null } | null>(null);
  const key = `${viewerId}|${rootId}|${versionId ?? ''}`;
  useEffect(() => {
    if (!versionId) return;
    let live = true;
    getCanvasRootCard(rootId, versionId, viewerId).then(
      (card) => { if (live) setRead({ key, card }); },
      () => { if (live) setRead({ key, card: null }); },
    );
    return () => { live = false; };
  }, [rootId, versionId, viewerId, key]);
  return read && read.key === key ? read.card : null;
}
