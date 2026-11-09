/**
 * P1652: message reactions, a thin typed wrapper over the reactions table and its two RPCs
 * (supabase/migrations/20261109120000_p1652_chat_reactions.sql).
 *
 * Reads are RLS-gated direct SELECTs (a reaction is visible exactly when its message is). Writes are the add / remove RPCs only: the table
 * grants no INSERT / UPDATE / DELETE and neither RPC takes "who am I". Realtime is a hint: callers re-read on subscribe and on every reconnect.
 */
import { supabase } from '@/lib/supabase';

/** [FOUNDER DECISION: the emoji set. Default built; this is the one constant to change. No free emoji picker.] */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export interface ChatReaction {
  id: string;
  messageId: string;
  profileId: string;
  emoji: string;
}

interface ReactionRow {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
}

const COLUMNS = 'id, message_id, profile_id, emoji';
const CHUNK = 80;
export const PAGE = 1000;

export const mapReactionRow = (r: ReactionRow): ChatReaction => ({ id: r.id, messageId: r.message_id, profileId: r.profile_id, emoji: r.emoji });

/** Every reaction on these messages that the reader may see; null when `keepGoing` said stop between requests (no partial answer). */
export async function listReactions(messageIds: string[], keepGoing: () => boolean = () => true): Promise<ChatReaction[] | null> {
  const out: ChatReaction[] = [];
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const ids = messageIds.slice(i, i + CHUNK);
    // A response is capped (1000 rows): read pages of a stable order until one comes back short.
    for (let from = 0; ; from += PAGE) {
      if ((i > 0 || from > 0) && !keepGoing()) return null;
      const { data, error } = await supabase.from('chat_message_reactions').select(COLUMNS).in('message_id', ids).order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(`chat listReactions failed: ${error.message}`);
      const page = (data ?? []) as unknown as ReactionRow[];
      out.push(...page.map(mapReactionRow));
      if (page.length < PAGE) break;
    }
  }
  return out;
}

/** Idempotent: adding the same reaction twice returns the same row. Null when a concurrent removal took the row before it was read back. */
export async function addReaction(messageId: string, emoji: string): Promise<ChatReaction | null> {
  const { data, error } = await supabase.rpc('add_chat_reaction', { p_message: messageId, p_emoji: emoji });
  if (error) throw new Error(`chat add_chat_reaction failed: ${error.message}`);
  const row = data as unknown as ReactionRow | null;
  return row && row.id ? mapReactionRow(row) : null;
}

/** Idempotent: removing a reaction that is not there changes nothing. */
export async function removeReaction(messageId: string, emoji: string): Promise<void> {
  const { error } = await supabase.rpc('remove_chat_reaction', { p_message: messageId, p_emoji: emoji });
  if (error) throw new Error(`chat remove_chat_reaction failed: ${error.message}`);
}

/**
 * Live changes. A DELETE carries only the row's generated id (Realtime does not apply RLS to deletes), so a removal is applied by id and an
 * unknown id is ignored (the store holds nothing it could match). `onSubscribed` fires on the first subscribe and on every reconnect: re-read there.
 */
export function subscribeToReactions(onInsert: (r: ChatReaction) => void, onDelete: (id: string) => void, onSubscribed: () => void): () => void {
  const channel = supabase
    .channel(`chat-reactions:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' }, (p) => onInsert(mapReactionRow(p.new as ReactionRow)))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' }, (p) => {
      const id = (p.old as { id?: string } | null)?.id;
      if (id) onDelete(id);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed();
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
