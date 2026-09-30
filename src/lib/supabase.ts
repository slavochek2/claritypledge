import { createClient } from '@supabase/supabase-js';
import { withRoomCodeHeader } from './room-capability';
import { withNetworkOutcome } from './network-outcome';

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
