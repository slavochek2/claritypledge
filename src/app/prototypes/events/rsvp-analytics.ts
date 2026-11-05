/**
 * P1640: shared analytics shape for the RSVP events, so the three RSVP callers
 * (signed-in event page, post-signup callback, close page) cannot drift apart.
 */
import { analytics } from '@/lib/mixpanel';
import { supabase } from '@/lib/supabase';

export type RsvpPath = 'signed_in' | 'post_signup' | 'close_page';

/** The series slug, or 'standalone' when the event has none. */
export function eventTypeOf(event: { seriesSlug?: string | null }): string {
  return event.seriesSlug ?? 'standalone';
}

/** Call only after rsvpToEvent returned true. */
export function trackRsvpCompleted(event: { id: string; seriesSlug?: string | null }, path: RsvpPath): void {
  analytics.track('event_rsvp_completed', { event_id: event.id, event_type: eventTypeOf(event), path });
}

/** Post-signup success: the existing `event_rsvp_auto` (now with event_type) plus `event_rsvp_completed`. */
export async function trackPostSignupRsvp(eventId: string, eventSlug: string, registrationSource: unknown): Promise<void> {
  const event = { id: eventId, seriesSlug: await fetchSeriesSlug(eventId) };
  // Fired without being awaited: nothing here may reject into the auth callback.
  analytics.track('event_rsvp_auto', {
    event_slug: eventSlug,
    event_id: eventId,
    event_type: eventTypeOf(event),
    registration_source: registrationSource,
  });
  trackRsvpCompleted(event, 'post_signup');
}

/**
 * The legacy `getEventBySlug` in api.ts does not map `series_slug` and may not grow, so the
 * post-signup path reads it here. A failed read records 'unknown', never 'standalone' as if it were
 * a fact, and never throws.
 */
export async function fetchSeriesSlug(eventId: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase.from('events').select('series_slug').eq('id', eventId).maybeSingle();
    if (error) return 'unknown';
    return (data as { series_slug?: string | null } | null)?.series_slug ?? undefined;
  } catch {
    return 'unknown';
  }
}
