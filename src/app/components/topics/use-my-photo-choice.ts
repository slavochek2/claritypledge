/**
 * P1429: the person's stored "show my photo" choice for topic votes — true / false, or null before
 * they ever chose (or while signed out). Read once per signed-in user; shared by the /topics page
 * and the topic list inside the evening close, so both start the photo box from the same truth.
 */
import { useEffect, useState } from 'react';
import { getMyPhotoChoice } from '@/app/data/topic-voting';

export function useMyPhotoChoice(userId: string | undefined): boolean | null {
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => {
    setChoice(null);
    if (!userId) return;
    let cancelled = false;
    void getMyPhotoChoice().then((c) => { if (!cancelled) setChoice(c); });
    return () => { cancelled = true; };
  }, [userId]);
  return choice;
}
