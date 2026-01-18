import { mockEventsService } from './events-service-mock';

// P61.0: Service abstraction layer - components use this interface
// P61 Phase 2: Real Supabase implementation will be added in events-service-real.ts
// import { realEventsService } from './events-service-real';

const USE_REAL_API = import.meta.env.VITE_USE_REAL_EVENTS_API === 'true';

// P61.0: Mock-only for now. Feature flag prepared for Phase 2 switchover.
// When realEventsService is implemented, change the first branch to use it.
export const eventsService = USE_REAL_API
  ? mockEventsService // Phase 2: Replace with realEventsService
  : mockEventsService;

export type { EventsService, CreateEventInput, UpdateEventInput } from './events-service.interface';
