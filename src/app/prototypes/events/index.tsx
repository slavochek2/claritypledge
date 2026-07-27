import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { EventsList } from './components/EventsList';
import { EventDetail } from './components/EventDetail';
import { CreateEvent } from './components/CreateEvent';
import { EditEvent } from './components/EditEvent';
import { RsvpConfirm } from './components/RsvpConfirm';
import { NextWebinarRedirect } from './components/NextWebinarRedirect';

/**
 * P1010: `/events` lands on the Clarity Organization page, not the bare list. The nav
 * item already points at /org/cm; without this, the ~11 hardcoded `to="/events"` back
 * links scattered across EventDetail, RsvpConfirm, CreateEvent, EditEvent, settings,
 * my-sessions and the profile page all returned somewhere the nav no longer goes —
 * which is exactly how "Back" ended up on a page you can't reach from the menu.
 *
 * Redirecting HERE rather than editing all 11 call sites keeps one authority for
 * "where does Events live". No extra hop: /events already redirected (to `list`).
 *
 * `/events/list` deliberately stays live and unredirected — NextWebinarRedirect sends
 * the webinar funnel to `/events/list?series=lost-cofounders`, and that path must not
 * move. The query string is preserved here so a series-filtered /events still filters:
 * EventsList reads useSearchParams(), which is route-agnostic, so it honours ?series=
 * embedded in the org page exactly as it does standalone.
 */
function EventsRoot() {
  const { search } = useLocation();
  return <Navigate to={`/org/cm${search}`} replace />;
}

/**
 * P957: `/events/webinar` is the legacy registration URL, kept as a permanent redirect to the
 * canonical `/events/experiment` so links already in the wild never break. Preserves the query
 * string (e.g. `?utm=…`) the same way EventsRoot does.
 */
export function WebinarRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/events/experiment${search}`} replace />;
}

export function EventsPrototype() {
  return (
    <Routes>
      <Route path="/" element={<EventsRoot />} />
      <Route path="list" element={<EventsList />} />
      <Route path="experiment" element={<NextWebinarRedirect />} />
      <Route path="webinar" element={<WebinarRedirect />} />
      <Route path="new" element={<CreateEvent />} />
      <Route path=":slug" element={<EventDetail />} />
      <Route path=":slug/edit" element={<EditEvent />} />
      <Route path=":slug/confirm" element={<RsvpConfirm />} />
    </Routes>
  );
}
