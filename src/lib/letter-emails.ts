import { supabase } from './supabase';

/**
 * Invoke the send-letter-emails Edge Function.
 * Fire-and-forget: email failure does not block the caller.
 */
export async function invokeLetterEmails(letterId: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-letter-emails', {
      body: { letterId },
    });
    if (error) {
      console.error('[letter-emails] Edge function error:', error);
    }
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[letter-emails] Invoke failed:', err);
  }
}
