import { Routes, Route, Navigate } from 'react-router-dom';
import { EventsList } from './components/EventsList';
import { EventDetail } from './components/EventDetail';
import { CreateEvent } from './components/CreateEvent';
import { EditEvent } from './components/EditEvent';
import { RsvpConfirm } from './components/RsvpConfirm';

export function EventsPrototype() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="list" replace />} />
      <Route path="list" element={<EventsList />} />
      <Route path="new" element={<CreateEvent />} />
      <Route path=":slug" element={<EventDetail />} />
      <Route path=":slug/edit" element={<EditEvent />} />
      <Route path=":slug/confirm" element={<RsvpConfirm />} />
    </Routes>
  );
}
