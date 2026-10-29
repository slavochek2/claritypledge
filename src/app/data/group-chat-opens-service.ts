/**
 * @file group-chat-opens-service.ts
 * @description P1542 round 6 (decision 43): "has this person opened this event's group chat?" — the server half.
 * Both RPCs take the EVENT id; the chat key is hashed from the private link server-side
 * (migration 20261027170000_p1542_group_chat_opens.sql), so the client never sends or stores the link.
 *
 * Each call reports `ok: false` when the RPC is not available (migration not applied yet) or fails, so the caller can
 * fall back to the browser's own record instead of treating "unknown" as "never opened".
 */
import { supabase } from '@/lib/supabase';

/** `refused`: the server answered 42501 (not signed in, or not registered for this event) — a retry can never
 *  succeed, so the caller stops retrying. Every other failure (offline, function missing) is worth retrying. */
export async function markGroupChatOpenedOnServer(eventId: string): Promise<{ ok: boolean; refused: boolean }> {
  const { error } = await supabase.rpc('mark_group_chat_opened', { p_event_id: eventId });
  if (error) {
    console.warn('[group-chat] mark_group_chat_opened failed:', error.code, error.message);
    return { ok: false, refused: error.code === '42501' };
  }
  return { ok: true, refused: false };
}

export async function readGroupChatOpenedOnServer(eventId: string): Promise<{ ok: boolean; opened: boolean }> {
  const { data, error } = await supabase.rpc('group_chat_opened', { p_event_id: eventId });
  if (error) return { ok: false, opened: false };
  return { ok: true, opened: data === true };
}
