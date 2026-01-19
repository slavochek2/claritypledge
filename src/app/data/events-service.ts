import { mockEventsService } from './events-service-mock';
import { realEventsService } from './events-service-real';

// P61.1: Service switch - components use this interface
// Feature flag controls which implementation is used
const USE_REAL_API = import.meta.env.VITE_USE_REAL_EVENTS_API === 'true';

export const eventsService = USE_REAL_API ? realEventsService : mockEventsService;

export type { EventsService, CreateEventInput, UpdateEventInput } from './events-service.interface';
