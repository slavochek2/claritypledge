/**
 * @file app-route-effects.tsx
 * @description App-wide effects that render nothing and live inside the router and auth providers:
 * the offline pack preloader (P1369) and the named route view events (P1669, see
 * route-view-events.ts). Kept here so the app shell does not grow for each one.
 */
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth';
import { OfflinePackPreloader } from '@/app/components/offline/offline-pack-preloader';
import { useTrackView } from '@/hooks/use-track-view';
import { viewEventFor } from './route-view-events';

function RouteViewEvents() {
  const { pathname } = useLocation();
  const { user, sessionChecked } = useAuth();
  // Until the session is known, a signed-in-only route cannot be judged: wait rather than guess.
  const view = sessionChecked ? viewEventFor(pathname, { signedIn: !!user }) : null;
  useTrackView(view?.event ?? '', view?.props, view !== null, view?.viewKey);
  return null;
}

export function AppRouteEffects() {
  return (
    <>
      <OfflinePackPreloader />
      <RouteViewEvents />
    </>
  );
}
