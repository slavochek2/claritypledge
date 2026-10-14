import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * P1487: ask the server to email an agreement invitee their one-time sign-in link.
 *
 * Invitation pages never call the auth server's own email sign-in directly: an account that
 * already exists at the invited address but never confirmed it must be reset before any link
 * can activate it, and only the server can do that (create-and-sign). The server also keeps the
 * terms version passed here, and records it once the invitee signs in.
 */
export async function requestAgreementSignIn(input: {
  agreementId: string;
  token: string;
  partnerName: string;
  termsVersion: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const fallback = "Couldn't send your sign-in link. Please try again.";
  try {
    const { data, error } = await supabase.functions.invoke('create-and-sign', { body: input });
    if (!error && data?.ok && data?.checkEmail) return { ok: true };
    let message: string | undefined = data?.message;
    if (!message && error instanceof FunctionsHttpError) {
      try {
        const body = await (error.context as Response).clone().json();
        message = body?.message ?? body?.error;
      } catch { /* not JSON */ }
    }
    return { ok: false, message: message || fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}
