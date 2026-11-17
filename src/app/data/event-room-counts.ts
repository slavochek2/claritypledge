/**
 * @file event-room-counts.ts
 * @description P1675 section 6: the room's two counts, read from get_event_room_counts (numbers only, never names).
 * Everyone who can see the event gets `notHere` (registered, not in the room yet); only the host also gets in/out/undecided,
 * the merged population of registered people and room members. A failed read returns null and never throws to the UI.
 */
import { supabase } from '@/lib/supabase';
import { logDbError } from './db-error-logger';

export interface EventRoomCounts {
  notHere: number;
  /** Host only: absent for everyone else. */
  in?: number;
  out?: number;
  undecided?: number;
}

const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

export async function getEventRoomCounts(eventId: string): Promise<EventRoomCounts | null> {
  try {
    const { data, error } = await supabase.rpc('get_event_room_counts', { p_event: eventId });
    if (error) {
      logDbError('getEventRoomCounts', error, { eventId });
      return null;
    }
    const d = (data ?? {}) as Record<string, unknown>;
    const notHere = count(d.not_here);
    if (notHere === undefined) return null;
    const out: EventRoomCounts = { notHere };
    const i = count(d.in), o = count(d.out), u = count(d.undecided);
    if (i !== undefined) out.in = i;
    if (o !== undefined) out.out = o;
    if (u !== undefined) out.undecided = u;
    return out;
  } catch {
    return null;
  }
}
