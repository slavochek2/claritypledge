/**
 * P1544: the server-side terms gate for the functions that send chat text to a model.
 *
 * The blocking terms popup is a client control. A cached old client, or a direct API call, never
 * sees it. mirror-reply and mirror-portrait therefore read the caller's recorded acceptance here
 * and refuse, before any job is reserved and before any model call, unless it is the current
 * version (SERVER_CURRENT_TERMS_VERSION, the one place the server names it).
 *
 * The read uses the service client on the id taken from the verified JWT: a caller cannot name
 * another profile, and the column grants on profiles (P877) do not apply to the service role.
 * It fails closed: a missing row, a read error or any other value refuses.
 */

import { isCurrentTermsVersion } from './terms-version.ts';

/** A service-role supabase-js client; only `from('profiles').select().eq().maybeSingle()` is used. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileReader = { from(table: string): any };

export async function callerHasCurrentTerms(service: ProfileReader, userId: string): Promise<boolean> {
  const { data, error } = (await service.from('profiles').select('accepted_terms_version').eq('id', userId).maybeSingle()) as {
    data: { accepted_terms_version?: unknown } | null;
    error: unknown;
  };
  if (error || !data) return false;
  return isCurrentTermsVersion(data.accepted_terms_version);
}

/** The typed refusal the client turns into "Accept the updated terms". Nothing else is in the body. */
export const TERMS_NOT_ACCEPTED_BODY = { error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' } as const;
export const TERMS_NOT_ACCEPTED_STATUS = 409;
