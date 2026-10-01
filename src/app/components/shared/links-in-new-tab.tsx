/**
 * P1336 — opt-in "links leave in a new tab" for cards hosted inside another flow (event
 * onboarding embeds StakePage). Default false: every card navigates exactly as before.
 *
 * `useOpenPath()` returns the navigation a card uses for an in-app path: this tab
 * (react-router) by default, a new tab when the provider says so.
 */
import { createContext, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

export const LinksInNewTabContext = createContext(false);

export const useLinksInNewTab = () => useContext(LinksInNewTabContext);

export function useOpenPath() {
  const navigate = useNavigate();
  const newTab = useLinksInNewTab();
  return useCallback(
    (path: string) => {
      if (newTab) window.open(path, '_blank', 'noopener,noreferrer');
      else navigate(path);
    },
    [navigate, newTab],
  );
}
