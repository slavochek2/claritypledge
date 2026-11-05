/**
 * @file use-edited-point-follow.ts
 * @description P1621: an edit made on the opened point in the panel gives the point a new id. The panel must stay open on it: `?point=` is replaced with the new id as soon as the
 * canvas has read it (never before, or the panel would close for the moment the new point is not on screen yet). Until then the old id stands in for the open point, and when the read
 * has replaced the old point with the new one the new id is the open one in the same render, so the panel never flashes shut.
 */
import { useCallback, useEffect, useState } from 'react';

export function useEditedPointFollow(
  requestedId: string | null,
  /** the ids of every point on screen now */
  onScreen: readonly string[],
  /** replaces `?point=` (no history entry) */
  replacePoint: (id: string) => void,
): { requestedId: string | null; follow: (from: string, to: string) => void } {
  const [moved, setMoved] = useState<{ from: string; to: string } | null>(null);
  const follow = useCallback((from: string, to: string) => { if (from !== to) setMoved({ from, to }); }, []);
  const arrived = !!moved && requestedId === moved.from && !onScreen.includes(moved.from) && onScreen.includes(moved.to);
  const resolved = arrived && moved ? moved.to : requestedId;
  useEffect(() => {
    if (!moved) return;
    if (requestedId === moved.to) setMoved(null);   // the address has caught up: nothing left to bridge
    else if (arrived) replacePoint(moved.to);   // until it does, the new id stands in (above), so the panel never shuts for a render
    else if (requestedId !== moved.from) setMoved(null);   // the person moved on (closed it, stepped elsewhere): nothing to follow
  }, [moved, arrived, requestedId, replacePoint]);
  return { requestedId: resolved, follow };
}
