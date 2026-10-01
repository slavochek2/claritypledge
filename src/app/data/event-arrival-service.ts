/**
 * P1380: self-reported arrival ("I'm here"). Written only through mark_event_arrival (registrants
 * of a non-cancelled event); read by the person themself and by the event's host (RLS).
 */
import { supabase } from '@/lib/supabase';

export interface EventArrival {
  profileId: string;
  arrivedAt: string;
}

/** Records arrival (idempotent — the first time is kept) and returns the stored time. */
export async function markEventArrival(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('mark_event_arrival', { p_event_id: eventId });
  if (error) throw error;
  return data as string;
}

export async function getMyArrival(eventId: string, profileId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_arrivals')
    .select('arrived_at')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return (data?.arrived_at as string | undefined) ?? null;
}

/** Host only (RLS returns nothing to anyone else). */
export async function getEventArrivals(eventId: string): Promise<EventArrival[]> {
  const { data, error } = await supabase
    .from('event_arrivals')
    .select('profile_id, arrived_at')
    .eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ profileId: r.profile_id as string, arrivedAt: r.arrived_at as string }));
}
