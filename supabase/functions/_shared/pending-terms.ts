/**
 * P1487: remember, server-side, which terms version a person accepted before they had a session.
 *
 * Stored in the account's app_metadata (writable only by the service role) when their one-time
 * sign-in link is minted; consumed once, after they sign in, by the
 * `consume_pending_terms_acceptance` RPC (migration 20261014171731), which writes the
 * terms_acceptances audit row. The caller passes a version it has already checked against its
 * own allowlist.
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
): Promise<boolean> {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { pending_terms: { version: termsVersion, issued_at: new Date().toISOString() } },
  });
  if (error) {
    console.error('[pending-terms] could not record the accepted terms version:', error.message);
    return false;
  }
  return true;
}
