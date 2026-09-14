/**
 * @file use-go-back.ts
 * @description "Go back" that returns to wherever the person came from — including a page
 * outside this app — and never strands someone who arrived cold.
 *
 * The logic is /stake's (main: src/app/pages/stake-page.tsx, P1296 + P1311), extracted so a
 * second page can share it instead of copying it. /stake still carries its own copy on main;
 * switching it to this hook is a follow-up once both are on main.
 *
 *   - The cold test reads the HISTORY POSITION (`history.state.idx`), not `location.key`:
 *     react-router mints a new key on every navigation, `replace` included, so a key test goes
 *     wrong after any replace navigation. Where there is no browser history index (an
 *     in-memory router) the mount-time `location.key === 'default'` answers the same question.
 *   - First entry in the APP is not first entry in the TAB. A reader who followed a link from an
 *     outside page arrives at app index 0 with that page still one step back in the tab, and
 *     `history.length > 1` tells that apart from a bookmark, a typed URL or a fresh tab (all
 *     length 1). Only those get the fallback route; everyone else goes back.
 */
import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useGoBack(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const arrivedColdRef = useRef<boolean | null>(null);
  if (arrivedColdRef.current === null) arrivedColdRef.current = location.key === 'default';

  return useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const atFirstEntry = typeof idx === 'number' ? idx === 0 : arrivedColdRef.current === true;
    if (atFirstEntry && window.history.length <= 1) navigate(fallbackPath, { replace: true });
    else navigate(-1);
  }, [navigate, fallbackPath]);
}
