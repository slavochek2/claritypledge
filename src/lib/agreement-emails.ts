import { supabase } from './supabase';

type AgreementEmailAction = 'invitation' | 'accepted' | 'declined' | 'terminated' | 'resend';

/**
 * Invoke the send-agreement-emails Edge Function.
 * Fire-and-forget: email failure does not block the caller.
 */
export async function invokeAgreementEmails(
  action: AgreementEmailAction,
  agreementId: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-agreement-emails', {
      body: { action, agreementId },
    });
    if (error) {
      console.error('[agreement-emails] Edge function error:', error);
    }
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[agreement-emails] Invoke failed:', err);
  }
}
