/**
 * @file chat-live-transcription.ts
 * @description P1604: is anyone transcribing in this chat right now? One read, member-scoped on the server
 * (get_chat_live_transcription returns nothing for a chat the caller cannot read, and the mirror has none).
 */
import { supabase } from '@/lib/supabase';
import { seatInChatQuery } from './chat-seat-query';

export interface ChatLiveTranscription {
  roomId: string;
  roomCode: string;
  /** The earliest-joined person still recording. */
  starterName: string;
  recordingCount: number;
  iAmRecording: boolean;
}

interface Row {
  room_id: string;
  room_code: string;
  starter_name: string | null;
  recording_count: number;
  i_am_recording: boolean;
}

/** Null when nobody is recording, or when the read fails (a missing line is the safe answer). */
export async function getChatLiveTranscription(conversationId: string): Promise<ChatLiveTranscription | null> {
  const { data, error } = await supabase.rpc('get_chat_live_transcription', { p_conversation_id: conversationId });
  if (error) {
    console.warn('[chat] live transcription read failed:', error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  if (!row?.room_id) return null;
  return {
    roomId: row.room_id,
    roomCode: row.room_code,
    starterName: row.starter_name?.trim() || 'Someone',
    recordingCount: row.recording_count ?? 1,
    iAmRecording: row.i_am_recording === true,
  };
}

/**
 * Has this person already had a seat in a transcription room of this chat? Derived from the server (their own member rows are
 * readable to them), so it holds across devices and reloads. It decides whether the first-time explanation is shown. A failed
 * read throws: the caller shows the box on doubt, never skips it.
 */
export async function hasTranscribedInChat(conversationId: string, profileId: string, eventId: string | null = null): Promise<boolean> {
  const { data, error } = await seatInChatQuery(supabase, conversationId, profileId, eventId);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
