/**
 * @file room-clean-transcript.ts
 * @description P1604 Decision 7: the clean text of a room, for session history. One question: what cleaned text did the
 * cross-mic pass produce for the jobs THIS caller was a seat of in this room? The server (get_my_clean_transcript) only
 * returns those jobs, so history never shows another table's words. Kept out of api.ts, which may not grow.
 */
import { supabase } from '@/lib/supabase';
import { mergeConsecutiveSpeakerRows } from '@/app/components/session/transcript-merge';
import type { RoomTranscript, RoomTranscriptSegment } from './api';

interface CleanRow {
  job_id: string;
  member_id: string;
  display_name: string | null;
  chunk_ms: number | string;
  text: string;
  /** Decision 4: this speaker's audio did not all arrive. */
  incomplete?: boolean | null;
}

/** A segment of the clean text knows its seat and the clean job it came from (to name the speaker and head the block). */
export interface SpeakerSegment extends RoomTranscriptSegment {
  memberId?: string;
  jobId?: string;
}

/** One clean job the caller was a seat of: the round and table, or the place of an outside-rounds stretch. */
export interface TranscriptSection {
  jobId: string;
  kind: 'round' | 'room';
  place: string | null;
  roundNo: number | null;
  tableNo: number | null;
}

export interface SectionedTranscript {
  source: RoomTranscript['source'];
  segments: SpeakerSegment[];
  sections: TranscriptSection[];
}

/** The caller's jobs in time order. A failed read is "no headings", never an error. */
async function fetchSections(roomId: string): Promise<TranscriptSection[]> {
  try {
    const { data, error } = await supabase.rpc('get_my_clean_transcript_sections', { p_room_id: roomId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ job_id: string; kind: 'round' | 'room'; place: string | null; round_no: number | null; table_no: number | null }>)
      .map((r) => ({ jobId: r.job_id, kind: r.kind, place: r.place, roundNo: r.round_no, tableNo: r.table_no }));
  } catch (err) {
    console.warn('[Transcription API] sections could not be read, no headings:', err);
    return [];
  }
}

/**
 * The caller's clean transcript for a room, or null when there is none (the pass has not run, is switched off, or the
 * read failed). Null is never an error to the reader: history then shows the older per-person text, which keeps running.
 * `chunk_ms` is the chunk's start on the server clock; the first one is the transcript's origin.
 */
export async function fetchCleanRoomTranscript(roomId: string): Promise<SectionedTranscript | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_clean_transcript', { p_room_id: roomId });
    if (error) {
      console.warn('[Transcription API] clean transcript read failed, using the older text:', error.message);
      return null;
    }
    const rows = ((data ?? []) as CleanRow[])
      .map((r) => ({ ...r, at: Number(r.chunk_ms) }))
      .filter((r) => Number.isFinite(r.at) && typeof r.text === 'string' && r.text.trim() !== '')
      .sort((a, b) => a.at - b.at);
    if (rows.length === 0) return null;
    const origin = rows[0].at;
    return {
      source: 'final',
      sections: await fetchSections(roomId),
      segments: rows.map((r) => ({
        memberId: r.member_id,
        jobId: r.job_id,
        speakerLabel: r.display_name?.trim() || 'Someone',
        startMs: Math.max(0, r.at - origin),
        text: r.text,
        alsoHeardBy: [],
        fromIncompleteRecording: r.incomplete === true,
      })),
    };
  } catch (err) {
    console.warn('[Transcription API] clean transcript read failed, using the older text:', err);
    return null;
  }
}

/**
 * P1307 Decision 4: a transcribe room's ONE transcript, read by every member whose session
 * references the room. Never `session_transcripts` (one row per session, and a room session has
 * none). Both reads are member-scoped by RLS (P1207), so a non-member gets nothing, not even
 * whether a transcript exists.
 *
 * Before the whole-recording pass completes, the live rows are returned, merged by speaker the
 * same way the room view renders them.
 */
export async function fetchRoomTranscript(roomId: string): Promise<(RoomTranscript & { sections?: TranscriptSection[] }) | null> {
  // P1604 Decision 7: the cleaned text of the jobs this reader was part of, when any exists; otherwise the older text.
  const clean = await fetchCleanRoomTranscript(roomId);
  if (clean) return clean;
  const { data: saved, error: savedError } = await supabase
    .from('transcribe_room_transcripts')
    .select('segments, speaker_map, incomplete_member_ids')
    .eq('room_id', roomId)
    .maybeSingle();
  if (savedError) {
    console.error('[Transcription API] Error fetching room transcript:', savedError);
  }

  // P1339: an empty after-event transcript (a batch pass that found no audio) must not hide
  // the live one — fall through to transcribe_messages instead.
  if (saved && ((saved.segments ?? []) as unknown[]).length > 0) {
    const speakerMap = (saved.speaker_map ?? {}) as Record<string, string>;
    const incomplete = new Set((saved.incomplete_member_ids ?? []) as string[]);
    const rows = (saved.segments ?? []) as Array<{ member_id: string; start_ms: number; text: string; also_heard_by?: string[] }>;
    const origin = rows[0]?.start_ms ?? 0;
    const label = (memberId: string) => speakerMap[memberId] ?? 'Someone';
    return {
      source: 'final',
      segments: rows.map((row) => ({
        speakerLabel: label(row.member_id),
        startMs: Math.max(0, row.start_ms - origin),
        text: row.text,
        alsoHeardBy: (row.also_heard_by ?? []).map(label),
        fromIncompleteRecording: incomplete.has(row.member_id),
      })),
    };
  }

  const [{ data: members, error: membersError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase.from('transcribe_room_members').select('id, display_name').eq('room_id', roomId),
    supabase
      .from('transcribe_messages')
      .select('id, room_id, member_id, text, spoken_at, is_final')
      .eq('room_id', roomId)
      .order('spoken_at', { ascending: true }),
  ]);
  if (membersError || messagesError) {
    console.error('[Transcription API] Error fetching live room rows:', membersError ?? messagesError);
    return null;
  }
  const names = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]));
  const merged = mergeConsecutiveSpeakerRows(
    (messages ?? []).map((m) => ({
      id: m.id as string,
      roomId: m.room_id as string,
      memberId: m.member_id as string,
      text: m.text as string,
      spokenAt: m.spoken_at as string,
      isFinal: m.is_final as boolean,
    })),
  );
  const first = merged[0];
  const origin = first ? new Date(first.spokenAt).getTime() : 0;
  return {
    source: 'live',
    segments: merged.map((row) => ({
      speakerLabel: names.get(row.memberId) ?? 'Someone',
      startMs: Math.max(0, new Date(row.spokenAt).getTime() - origin),
      text: row.text,
      alsoHeardBy: [],
      fromIncompleteRecording: false,
    })),
  };
}

