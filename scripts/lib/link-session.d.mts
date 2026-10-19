// Types for link-session.mjs, so the TypeScript e2e specs that import it compile
// without an implicit any (same pattern as keyring.d.mts).
export interface LinkSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    created_at: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
  };
}
/** Mint a sign-in link with the service role and exchange it (anon key) for a user session. */
export function linkSession(o: { url: string; anonKey: string; serviceKey: string; email: string }): Promise<LinkSession>;
