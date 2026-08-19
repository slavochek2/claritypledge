import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { EventsList } from './components/EventsList';
import { EventDetail } from './components/EventDetail';
import { CreateEvent } from './components/CreateEvent';
import { EditEvent } from './components/EditEvent';
import { RsvpConfirm } from './components/RsvpConfirm';
import { NextWebinarRedirect } from './components/NextWebinarRedirect';
import { WEBINAR_SERIES } from '@/app/data/webinar-series';
import { EventRoomPage } from './components/EventRoomPage';

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
 * `/events/list` deliberately stays live and unredirected — it is where the webinar
 * funnel lands (NextWebinarRedirect falls back to `/events/list?series=…`). Note this
 * is a CONVERSION choice, not a technical constraint: the query string survives the
 * redirect and EventsList reads useSearchParams(), which is route-agnostic, so a
 * redirected funnel visitor would still get the right filter. What they would ALSO get
 * is the org chrome — community name, member count, blurb, a blue "Join as member" CTA
 * and About/Members tabs — wrapped around a webinar list they arrived at from a cold
 * email. The bare list is the better landing for that traffic.
 *
 * Which is why series-filtered traffic is excluded from this redirect entirely. It
 * previously depended on which URL happened to be in the email: `/events/list?series=`
 * got the clean list while `/events?series=` got the community page, for the same
 * visitor in the same funnel. The rule is now uniform — community browsing goes to the
 * org page, funnel traffic goes to the bare list — rather than an accident of routing.
 */
function EventsRoot() {
  const { search } = useLocation();
  const isFunnelTraffic =
    new URLSearchParams(search).get('series') === WEBINAR_SERIES.SERIES_PARAM;
  return <Navigate to={`${isFunnelTraffic ? '/events/list' : '/org/cm'}${search}`} replace />;
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
      {/* P1114: one shared page, three doors (Architecture Decision 7) — standalone
          /ready and /meet (outside /events) are untouched and stay roomless. */}
      <Route path=":slug/room" element={<EventRoomPage focus="join" />} />
      <Route path=":slug/ready" element={<EventRoomPage focus="ready" />} />
      <Route path=":slug/meet" element={<EventRoomPage focus="principle" />} />
    </Routes>
  );
}
