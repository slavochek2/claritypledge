/**
 * @file chat-points-service.ts
 * @description P1631: the live point cards in one chat ("Points in this chat"). One read of `list_chat_points`, which the database restricts
 * to cards the caller can read (the chat's own history rule applies; a non-member gets []). The client adds no rule of its own.
 */
import { supabase } from '@/lib/supabase';

export interface ChatPointRow {
  pointId: string;
  /** The chat message that carries the card (the reveal target). */
  messageId: string;
  /** Null once the publisher has erased their account and the point was kept (others hold positions on it). */
  sharedBy: string | null;
  createdAt: string;
}

interface ChatPointRaw {
  point_id: string;
  message_id: string;
  shared_by: string | null;
  created_at: string;
}

/** In the database's order (oldest first); the panel shows them newest first. */
export async function listChatPoints(conversationId: string): Promise<ChatPointRow[]> {
  const { data, error } = await supabase.rpc('list_chat_points', { p_conversation: conversationId });
  if (error) throw new Error(`chat list_chat_points failed: ${error.message}`);
  return ((data ?? []) as unknown as ChatPointRaw[]).map((r) => ({ pointId: r.point_id, messageId: r.message_id, sharedBy: r.shared_by, createdAt: r.created_at }));
}
