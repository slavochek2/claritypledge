/** A media query's live answer — moved here from the chat pages so the event room can share it (P1542). */
import { useEffect, useState } from 'react';

/** Live result of a media query (false where matchMedia does not exist). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches === true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches === true);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

/** Tailwind's lg: the two-pane desktop layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
