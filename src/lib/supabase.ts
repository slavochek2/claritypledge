import { createClient } from '@supabase/supabase-js';
import { withRoomCodeHeader } from './room-capability';
import { withNetworkOutcome } from './network-outcome';
// P1297: imported BEFORE createClient runs, so its boot read of the stored token
// (authTokenStoredAtBoot) happens before auth-js's recovery can remove a refused session.
import { authStorageKey } from '@/auth/stored-session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: 'pkce',
      // P1297: the value supabase-js would derive anyway, named so the provider reads the same key.
      storageKey: authStorageKey(supabaseUrl) ?? undefined,
    },
    // P1302: the room codes this tab holds ride our REST requests as a guest's capability —
    // see room-capability.ts. The arrow resolves the global fetch at call time.
    // P1369: every request's outcome is recorded, because "offline" means a request failed,
    // not what navigator.onLine says — see network-outcome.ts.
    global: {
      fetch: withNetworkOutcome(withRoomCodeHeader(supabaseUrl, (input, init) => fetch(input, init))),
    },
  }
);
