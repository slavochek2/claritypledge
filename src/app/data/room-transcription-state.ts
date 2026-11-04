/**
 * @file room-transcription-state.ts
 * @description P1604 (founder live test, 2026-11-04): where is my transcript? Three reads, all member-scoped on the server (a room
 * the caller was not in is never returned): the state of each of my rooms for session history, and the sessions of one chat whose
 * text is still coming. The state is derived from the jobs that already exist; nothing here is stored or guessed on the client.
 * A failed read is "nothing known", never an error: history and the chat must load without it.
 */
import { supabase } from '@/lib/supabase';

export type TranscriptionState = 'processing' | 'ready' | 'failed' | 'none';

export interface RoomStateInfo {
  state: TranscriptionState;
  /** The chat's name for me (the other person of a DM, the group, the event); null for a plain /transcribe room. */
  chatName: string | null;
}

const STATES: readonly TranscriptionState[] = ['processing', 'ready', 'failed', 'none'];
const asState = (v: unknown): TranscriptionState => (STATES.includes(v as TranscriptionState) ? (v as TranscriptionState) : 'none');

export async function getMyRoomStates(roomIds: string[]): Promise<Map<string, RoomStateInfo>> {
  const out = new Map<string, RoomStateInfo>();
  if (roomIds.length === 0) return out;
  try {
    const { data, error } = await supabase.rpc('get_my_room_transcription_states', { p_room_ids: roomIds });
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ room_id: string; state: unknown; chat_name: string | null }>) {
      out.set(r.room_id, { state: asState(r.state), chatName: r.chat_name ?? null });
    }
  } catch (err) {
    console.warn('[sessions] transcription states could not be read, showing none:', err);
    out.clear();
  }
  return out;
}

export interface ChatProcessing {
  roomId: string;
  state: 'processing' | 'failed';
  endedAt: string;
}

/** The caller's own recent sessions in this chat whose transcript is still processing, or could not be prepared. */
export async function getChatTranscriptionProcessing(conversationId: string): Promise<ChatProcessing[]> {
  try {
    const { data, error } = await supabase.rpc('get_chat_transcription_processing', { p_conversation_id: conversationId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ room_id: string; state: string; ended_at: string }>)
      .filter((r) => r.state === 'processing' || r.state === 'failed')
      .map((r) => ({ roomId: r.room_id, state: r.state as 'processing' | 'failed', endedAt: r.ended_at }));
  } catch (err) {
    console.warn('[chat] transcription state could not be read:', err);
    return [];
  }
}
