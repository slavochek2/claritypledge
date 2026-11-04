/**
 * @file transcribe-capture-status.ts
 * @description P1307 / P1604: the two small reads a running capture makes about its room: the paused heartbeat (which now
 * returns the room's state) and the person's own capture status. Split out of transcribe-service.ts, which is at its size
 * limit; re-exported from there, so callers keep one import path.
 */
import { supabase } from '@/lib/supabase';
import { withDeadline } from '@/lib/with-deadline';
import type { MovedTo } from './transcribe-slice-destination';

/** Every network await on the room-entry path is deadlined (see transcribe-service.ts, P1236). */
export const ROOM_ENTRY_TIMEOUT_MS = 15_000;

/** P1604 rule 5: what the paused heartbeat learns about the room. */
export interface CaptureHeartbeat {
  /** The room has ended (the last Stop, ten minutes of everyone paused, or the roll). */
  roomEnded: boolean;
  /** The roll seated this person in the next room (Part 2). */
  movedTo: MovedTo | null;
}

/**
 * P1307 Decision 2 correction: the paused heartbeat. Carries no audio. Tells the room-end sweep
 * this person is deliberately not sending (a /live session, an explain-back recording)
 * rather than gone. P1604: it also returns the room's state, so a paused phone learns that the
 * room ended, or where the roll moved it. An answer with no row (an older server) is "nothing known".
 */
export async function touchRoomCapture(roomId: string): Promise<CaptureHeartbeat> {
  const { data, error } = await withDeadline(
    Promise.resolve(supabase.rpc('touch_transcribe_room_capture', { p_room_id: roomId })),
    ROOM_ENTRY_TIMEOUT_MS,
    'room heartbeat',
  );
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { room_ended?: boolean; moved_to_room_id?: string | null; moved_to_room_code?: string | null; moved_to_member_id?: string | null }
    | null
    | undefined;
  if (!row) return { roomEnded: false, movedTo: null };
  const movedTo = row.moved_to_room_id && row.moved_to_room_code && row.moved_to_member_id
    ? { roomId: row.moved_to_room_id, roomCode: row.moved_to_room_code, memberId: row.moved_to_member_id }
    : null;
  return { roomEnded: row.room_ended === true, movedTo };
}

export interface MyCaptureStatus {
  joinedAt: string;
  /** P1604 rule 8: the room's clock. */
  roomCreatedAt: string | null;
  captureEndedAt: string | null;
  roomEndedAt: string | null;
  /** The server holds this seat as paused (the paused heartbeat stamped it; any slice clears it): a reload must not reopen the mic. */
  pausedSince: string | null;
}

/**
 * P1307: whether this person's capture in a room is still live on the server — read before a
 * reload or a second visit re-attaches to a stored capture, so a capture the server has
 * already ended (their own End in another tab, the cap, the sweep) is never restarted. Both
 * reads are member-scoped by RLS (P1207); a non-member gets null.
 */
export async function getMyCaptureStatus(roomId: string, profileId: string): Promise<MyCaptureStatus | null> {
  const [{ data: member, error: memberError }, { data: room, error: roomError }] = await withDeadline(
    Promise.all([
      supabase
        .from('transcribe_room_members')
        .select('joined_at, capture_ended_at, paused_since')
        .eq('room_id', roomId)
        .eq('profile_id', profileId)
        .maybeSingle(),
      supabase.from('transcribe_rooms').select('ended_at, created_at').eq('id', roomId).maybeSingle(),
    ]),
    ROOM_ENTRY_TIMEOUT_MS,
    'reading your capture status',
  );
  if (memberError || roomError || !member || !room) return null;
  return {
    joinedAt: member.joined_at as string,
    roomCreatedAt: (room.created_at as string | null) ?? null,
    captureEndedAt: (member.capture_ended_at as string | null) ?? null,
    roomEndedAt: (room.ended_at as string | null) ?? null,
    pausedSince: (member.paused_since as string | null) ?? null,
  };
}


/**
 * P1604 rule 8: is my room over, and did the roll seat me in the next one? Plain reads, member-scoped by RLS (the next room is
 * visible only to someone seated in it), and no write: unlike the heartbeat it is safe in every phase. Used when an archive
 * upload is refused, on a timer while capturing, and after a reload.
 */
export async function getCaptureRoomState(roomId: string, profileId: string): Promise<{ ended: boolean; movedTo: MovedTo | null }> {
  const { data: room } = await withDeadline(
    Promise.resolve(supabase.from('transcribe_rooms').select('id, ended_at').eq('id', roomId).maybeSingle()),
    ROOM_ENTRY_TIMEOUT_MS,
    'reading the room',
  );
  const { data: next } = await withDeadline(
    Promise.resolve(supabase.from('transcribe_rooms').select('id, code').eq('continues_room_id', roomId).maybeSingle()),
    ROOM_ENTRY_TIMEOUT_MS,
    'reading the next room',
  );
  let movedTo: MovedTo | null = null;
  if (next) {
    const { data: seat } = await withDeadline(
      Promise.resolve(supabase.from('transcribe_room_members').select('id').eq('room_id', next.id as string).eq('profile_id', profileId).maybeSingle()),
      ROOM_ENTRY_TIMEOUT_MS,
      'reading my seat in the next room',
    );
    if (seat) movedTo = { roomId: next.id as string, roomCode: next.code as string, memberId: seat.id as string };
  }
  return { ended: !!room?.ended_at, movedTo };
}

/**
 * P1604: this seat's last archive chunk is done. The server starts the room's clean pass as soon as every seat has said so (the
 * 2-minute wait stays as the upper bound). Best effort: a failure only means the pass waits its full bound.
 */
export async function reportAudioFlushed(roomId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('report_audio_flushed', { p_room_id: roomId });
    if (error) console.warn('[room-capture] flush report failed (the pass waits its full bound):', error.message);
  } catch (err) {
    console.warn('[room-capture] flush report failed (the pass waits its full bound):', err);
  }
}
