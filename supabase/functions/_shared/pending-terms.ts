/**
 * P1487: remember, server-side, which terms version a person accepted before they had a session.
 *
 * Stored in the account's app_metadata (writable only by the service role) when their one-time
 * sign-in link is minted — only for an account that link will activate (created or reset), never
 * for an already-confirmed one. Consumed once, after they sign in through THAT link, by
 * `consume_pending_terms_acceptance(p_nonce)` (migration 20261014183307), which writes the
 * terms_acceptances audit row. The caller passes a version it has already checked.
 */

interface AppMetadataClient {
  auth: {
    admin: {
      updateUserById(
        id: string,
        attributes: { app_metadata: Record<string, unknown> },
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export async function setPendingTermsAcceptance(
  supabase: AppMetadataClient,
  userId: string,
  termsVersion: string,
): Promise<string | null> {
  // The nonce travels ONLY in the emailed link (as `terms_nonce`); the RPC records the acceptance
  // only when the signed-in caller presents it, so a sign-in by any other route records nothing.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { pending_terms: { version: termsVersion, issued_at: new Date().toISOString(), nonce } },
  });
  if (error) {
    console.error('[pending-terms] could not record the accepted terms version:', error.message);
    return null;
  }
  return nonce;
}
