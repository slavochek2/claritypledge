import { supabase } from './supabase';

type EmailAction = 'rsvp' | 'cancel' | 'uncancel' | 'update';

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
      body: { action, eventId, userId },
    });
    if (error) {
      console.error('[event-emails] Edge function error:', error);
    }
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[event-emails] Invoke failed:', err);
  }
}
