import { supabase } from './supabase';

type EmailAction = 'rsvp' | 'cancel' | 'uncancel' | 'update' | 'removed';

/**
 * Invoke the send-event-emails Edge Function.
 * Fire-and-forget: email failure does not block the caller.
 */
export async function invokeEventEmails(
  action: EmailAction,
  eventId: string,
  userId?: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-event-emails', {
      // P1675 R11: the page's own address, so a confirmation on the shared TEST server links back to this page's port.
      body: { action, eventId, userId, origin: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) {
      console.error('[event-emails] Edge function error:', error);
    }
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[event-emails] Invoke failed:', err);
  }
}
