import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { EventsList } from './components/EventsList';
import { EventDetail } from './components/EventDetail';
import { CreateEvent } from './components/CreateEvent';
import { EditEvent } from './components/EditEvent';
import { RsvpConfirm } from './components/RsvpConfirm';
import { NextWebinarRedirect } from './components/NextWebinarRedirect';

function EventsRoot() {
  const { search } = useLocation();
  return <Navigate to={`list${search}`} replace />;
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
