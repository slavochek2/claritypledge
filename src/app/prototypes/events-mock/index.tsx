import { createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { mockEventsService } from '@/app/data/events-service-mock';
import type { EventsService } from '@/app/data/events-service.interface';
import { MockEventsList } from './components/MockEventsList';
import { MockEventDetail } from './components/MockEventDetail';

// Context to provide mock service
export const EventsServiceContext = createContext<EventsService>(mockEventsService);
export const useEventsService = () => useContext(EventsServiceContext);

export function EventsMockPrototype() {
  return (
    <EventsServiceContext.Provider value={mockEventsService}>
      <Routes>
        <Route path="/" element={<Navigate to="list" replace />} />
        <Route path="list" element={<MockEventsList />} />
        <Route path=":slug" element={<MockEventDetail />} />
      </Routes>
    </EventsServiceContext.Provider>
  );
}
