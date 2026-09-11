import { createClient } from '@supabase/supabase-js';
import { withRoomCodeHeader } from './room-capability';

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
    // The room codes this tab holds ride our REST requests — see room-capability.ts.
    // The arrow resolves the global fetch at call time.
    global: {
      fetch: withRoomCodeHeader(supabaseUrl, (input, init) => fetch(input, init)),
    },
  }
);
