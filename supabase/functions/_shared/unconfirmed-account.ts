/**
 * P1487: reset an UNCONFIRMED account before a mailbox sign-in link is minted for it.
 *
 * An account that has never confirmed its email has not been proven to belong to anyone, yet it
 * may already carry credentials or profile details from whoever created it. Opening a sign-in
 * link confirms the account, and anything left on it would become live at that moment. So
 * before a link is minted for such an account, everything a creator could have set is replaced:
 *   - the password, with a random value nobody holds;
 *   - user_metadata, with exactly the caller's values (every other key is removed);
 * and an account that has any sign-in identity other than email is refused (fail closed) —
 * those are confirmed by their provider and should never reach this path.
 *
 * Confirmed accounts are never touched. Returns false when the reset could not be completed;
 * the caller must then not mint a link.
 */

/** Structural slice of a service-role supabase-js client: only these two admin calls are used. */
interface AdminUser {
  email_confirmed_at?: string | null;
  identities?: Array<{ provider?: string }> | null;
  user_metadata?: Record<string, unknown> | null;
}
interface AdminClient {
  auth: {
    admin: {
      getUserById(id: string): PromiseLike<{ data: { user: AdminUser | null } | null; error: { message: string } | null }>;
      updateUserById(
        id: string,
        attributes: { password: string; user_metadata: Record<string, unknown> },
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

function randomSecret(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export async function resetUnconfirmedAccount(
  supabase: AdminClient,
  userId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user) {
    console.error('[unconfirmed-account] lookup failed:', error?.message);
    return false;
  }
  if (user.email_confirmed_at) return true;

  const identities = user.identities ?? [];
  if (identities.some((i) => i.provider && i.provider !== 'email')) {
    console.error('[unconfirmed-account] refusing: unconfirmed account has a non-email identity');
    return false;
  }

  // user_metadata updates MERGE; an explicit null removes a key. Null every existing key the
  // caller does not set, so nothing from the account's creator survives.
  const existing = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cleared = Object.fromEntries(Object.keys(existing).map((k) => [k, null]));

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: randomSecret(),
    user_metadata: { ...cleared, ...metadata },
  });
  if (updateError) {
    console.error('[unconfirmed-account] reset failed:', updateError.message);
    return false;
  }
  return true;
}
