/**
 * P1429: the person's stored "show my photo" choice for topic votes — true / false, or null before
 * they ever chose (or while signed out). Read once per signed-in user; shared by the /topics page
 * and the topic list inside the evening close, so both start the photo box from the same truth.
 *
 * `remember(next)` records a choice the page just saved. Without it the first read stays as it was
 * and, the moment the votes come back with the new choice, re-applies the old one — the box flipped
 * back after Hide (review, Codex). It also drops a first read still in flight, which was sent before
 * the save and would otherwise land after it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyPhotoChoice } from '@/app/data/topic-voting';

export function useMyPhotoChoice(userId: string | undefined): { choice: boolean | null; remember: (next: boolean) => void } {
  const [choice, setChoice] = useState<boolean | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    setChoice(null);
    if (!userId) return;
    let live = true;
    const mine = ++seq.current;
    void getMyPhotoChoice().then((c) => { if (live && seq.current === mine) setChoice(c); });
    return () => { live = false; };
  }, [userId]);
  const remember = useCallback((next: boolean) => {
    seq.current++;
    setChoice(next);
  }, []);
  return { choice, remember };
}
