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

export function EventsPrototype() {
  return (
    <Routes>
      <Route path="/" element={<EventsRoot />} />
      <Route path="list" element={<EventsList />} />
      <Route path="webinar" element={<NextWebinarRedirect />} />
      <Route path="new" element={<CreateEvent />} />
      <Route path=":slug" element={<EventDetail />} />
      <Route path=":slug/edit" element={<EditEvent />} />
      <Route path=":slug/confirm" element={<RsvpConfirm />} />
    </Routes>
  );
}
