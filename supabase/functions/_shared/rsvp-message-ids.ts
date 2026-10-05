/**
 * P1425: the only way edge functions change `event_rsvps.mailgun_message_ids`, apart from
 * send-event-emails handleUpdate's deliberate reset.
 *
 * The column is ONE jsonb object shared by every scheduled email kind. Writers used to spread the
 * object as they had read it and write the whole thing back, so a writer holding an older read
 * erased whatever another writer had stored since (2026-10-03: one reminder sent 13 times).
 * `src/tests/p1425-message-ids-writers.test.ts` fails on any new whole-object write.
 */
import { type SupabaseClient } from './email-helpers.ts';

export type MessageKind = 'reminder' | 'feedback' | 'starting_soon';
type MessageKey = MessageKind | 'starting_soon_for';

/**
 * P1425: the only way edge functions change `event_rsvps.mailgun_message_ids` (besides
 * send-event-emails handleUpdate's deliberate reset). A per-key compare-and-set, executed by the
 * `set_rsvp_message_ids` database function in one UPDATE:
 *
 *   - applies only if `mailgun_message_ids->>key` still equals `expected` (null = absent)
 *   - changes only the keys in `patch` (string sets, null removes); every other key is untouched,
 *     so a caller holding an old read of the row cannot erase a sibling's id
 *   - `attemptedAt` (when given, even as null) is written to the kind's *_attempted_at column
 *   - `attemptedWas` (when given) additionally requires that column to still hold that value
 *
 * Returns true iff the row changed. An RPC error is logged and reported as false — "not claimed"
 * is the safe reading for a claim (nothing is sent), and a write-back that fails leaves PENDING,
 * which no tick re-sends.
 */
export async function setMessageIds(
  supabase: SupabaseClient,
  rsvpId: string,
  key: MessageKind,
  expected: string | null,
  patch: Partial<Record<MessageKey, string | null>>,
  opts: { attemptedAt?: string | null; attemptedWas?: string | null } = {},
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_rsvp_message_ids', {
    p_rsvp_id: rsvpId,
    p_key: key,
    p_expected: expected,
    p_patch: patch,
    p_set_attempted: opts.attemptedAt !== undefined,
    p_attempted_at: opts.attemptedAt ?? null,
    p_match_attempted: opts.attemptedWas !== undefined,
    p_attempted_was: opts.attemptedWas ?? null,
  });
  if (error) {
    console.error(`set_rsvp_message_ids(${rsvpId}, ${key}) failed: ${error.message}`);
    return false;
  }
  return data === true;
}
