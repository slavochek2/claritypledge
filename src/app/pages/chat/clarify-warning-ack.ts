/**
 * P1722: drafts whose Public warning the owner confirmed in this session, keyed by draft AND the statement they saw (a changed statement asks again). Publish sends the
 * acknowledgement only for these. A reload forgets them (the server asks again), and so does a sign-out.
 */
import { supabase } from '@/lib/supabase';

const acked = new Set<string>();
const key = (draftId: string, statement: string) => `${draftId}\u0000${statement}`;
export const markWarningAcked = (draftId: string, statement: string) => void acked.add(key(draftId, statement));
export const isWarningAcked = (draftId: string, statement: string) => acked.has(key(draftId, statement));
export const resetWarningAcks = () => acked.clear();

// optional chaining: a test double of the client may carry no auth
supabase.auth?.onAuthStateChange?.((event) => { if (event === 'SIGNED_OUT') resetWarningAcks(); });
