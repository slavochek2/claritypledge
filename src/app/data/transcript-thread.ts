/**
 * @file transcript-thread.ts
 * @description P1604: where the session thread of one of MY rooms was posted (chat + root message), for the "Transcript ready" toast.
 * Null when the room belongs to no chat, the thread is not there yet, or the read fails: the toast then opens session history.
 */
import { supabase } from '@/lib/supabase';

export async function getMyTranscriptThread(roomId: string): Promise<{ conversationId: string; rootMessageId: string } | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_transcript_thread', { p_room_id: roomId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { conversation_id?: string; root_message_id?: string } | null | undefined;
    return row?.conversation_id && row.root_message_id ? { conversationId: row.conversation_id, rootMessageId: row.root_message_id } : null;
  } catch (err) {
    console.warn('[sessions] the transcript thread could not be read:', err);
    return null;
  }
}
