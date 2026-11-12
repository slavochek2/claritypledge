/**
 * P1631: whether the point on screen is a private point published to a chat. Such a point has no link and takes no story, so the details page hides Share and "Add a story"
 * for it. Only a private point is asked about; every public point answers false at once. While the answer is on its way, or if the call fails, a private point reads as
 * shared (the caution is for the people it is shared with; the server is the gate either way).
 */
import { useEffect, useState } from 'react';
import { isPointChatShared } from '@/app/data/clarify-service';

export function usePointChatShared(pointId: string | undefined, isPrivate: boolean): boolean {
  const [answer, setAnswer] = useState<{ id: string; shared: boolean } | null>(null);
  useEffect(() => {
    if (!pointId || !isPrivate) return;
    let live = true;
    isPointChatShared(pointId).then(
      (shared) => { if (live) setAnswer({ id: pointId, shared }); },
      () => undefined,
    );
    return () => { live = false; };
  }, [pointId, isPrivate]);
  if (!isPrivate) return false;
  return answer && answer.id === pointId ? answer.shared : true;
}
