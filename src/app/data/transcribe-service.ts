/**
 * @file transcribe-service.ts
 * @description P1149: data layer for /transcribe — the live room transcription chat.
 * Rooms, membership, and the room's live chat text (transcribe_messages). Does not
 * touch clarity_sessions, transcription_jobs, or event_room_members directly beyond
 * calling the existing createClaritySession / createTranscriptionJob (A2).
 */
import { supabase } from '@/lib/supabase';
import { createClaritySession, createTranscriptionJob } from './api';

export interface TranscribeRoom {
  id: string;
  code: string;
  eventId: string | null;
  createdAt: string;
  endedAt: string | null;
}

export interface TranscribeRoomMember {
  id: string;
  roomId: string;
  profileId: string;
  displayName: string;
  sessionId: string;
  joinedAt: string;
}

export interface TranscribeMessage {
  id: string;
  roomId: string;
  memberId: string;
  text: string;
  spokenAt: string;
  isFinal: boolean;
}

interface DbRoom {
  id: string;
  code: string;
  event_id: string | null;
  created_at: string;
  ended_at: string | null;
}

interface DbMember {
  id: string;
  room_id: string;
  profile_id: string;
  display_name: string;
  session_id: string;
  joined_at: string;
}

interface DbMessage {
  id: string;
  room_id: string;
  member_id: string;
  text: string;
  spoken_at: string;
  is_final: boolean;
}

function mapRoom(row: DbRoom): TranscribeRoom {
  return { id: row.id, code: row.code, eventId: row.event_id, createdAt: row.created_at, endedAt: row.ended_at };
}

function mapMember(row: DbMember): TranscribeRoomMember {
  return {
    id: row.id,
    roomId: row.room_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    sessionId: row.session_id,
    joinedAt: row.joined_at,
  };
}

function mapMessage(row: DbMessage): TranscribeMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    memberId: row.member_id,
    text: row.text,
    spokenAt: row.spoken_at,
    isFinal: row.is_final,
  };
}

/** 6-char alphanumeric room code, same character set as clarity_sessions' generateRoomCode. */
function generateTranscribeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 — 32 chars
  // P1207 F2 / P1059: crypto.getRandomValues, NOT Math.random. This code is the join
  // credential for a transcription room, and Math.random is not cryptographically secure —
  // V8's xorshift128+ state can be recovered from a handful of observed outputs, so an attacker
  // who creates a few rooms of their own can predict the codes issued around them. Closing code
  // ENUMERATION (the RLS half of F2) while leaving codes PREDICTABLE would be half a fix.
  //
  // 32 is a power of two and 256 is a multiple of it, so masking a byte with 0x1f is uniform —
  // no modulo bias, and no rejection loop needed.
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) {
    code += chars.charAt(byte & 0x1f);
  }
  return code;
}

/**
 * Creates a new ad-hoc room (event_id null) and joins the caller as its first member.
 * The room field exists from day one, even for a single participant (spec §6).
 */
export async function createRoom(profileId: string, displayName: string, eventId?: string): Promise<{ room: TranscribeRoom; member: TranscribeRoomMember }> {
  let code = generateTranscribeRoomCode();
  let attempts = 0;
  const maxAttempts = 5;
  let roomRow: DbRoom | null = null;

  while (attempts < maxAttempts) {
    const { data, error } = await supabase
      .from('transcribe_rooms')
      .insert({ code, event_id: eventId ?? null })
      .select('id, code, event_id, created_at, ended_at')
      .single();

    if (!error && data) {
      roomRow = data as unknown as DbRoom;
      break;
    }
    if (error?.code === '23505') {
      code = generateTranscribeRoomCode();
      attempts++;
      continue;
    }
    throw new Error(error?.message || 'Failed to create room');
  }

  if (!roomRow) {
    throw new Error('Failed to generate unique room code after multiple attempts');
  }

  const room = mapRoom(roomRow);
  const member = await joinRoom(room.id, profileId, displayName);
  return { room, member };
}

/** Looks up an existing room by its code. Returns null if not found.
 *
 *  P1207 F2: goes through a SECURITY DEFINER RPC rather than selecting the table. `code` is a
 *  join credential, not an identifier — the table's SELECT policy used to be USING (true) for
 *  every authenticated user, which let anyone enumerate every live room's code and walk into
 *  any transcription session. The table read is now member-scoped, and a code must be
 *  PRESENTED (exact match) instead of listed. */
export async function getRoomByCode(code: string): Promise<TranscribeRoom | null> {
  const { data, error } = await supabase
    .rpc('get_transcribe_room_by_code', { p_code: code.toUpperCase() });

  if (error) throw new Error(error.message);
  const row = ((data ?? []) as unknown as DbRoom[])[0];
  return row ? mapRoom(row) : null;
}

/**
 * Joins a room: mints one clarity_sessions row for this participant (A2 — "one person's
 * recording"), then inserts the membership row that references it.
 */
export async function joinRoom(roomId: string, profileId: string, displayName: string): Promise<TranscribeRoomMember> {
  const session = await createClaritySession(displayName, profileId, false);

  // Deliberately NOT `.insert(...).select().single()` — that compiles to INSERT ...
  // RETURNING, and RETURNING is subject to the SELECT policy ("room members can see the
  // roster"), evaluated for THIS row inside the SAME command as its own INSERT. That
  // policy calls is_transcribe_room_member(), which queries transcribe_room_members
  // itself — and within one command, that inner query cannot see the row this very
  // INSERT is still writing, so RETURNING fails RLS even though the INSERT's own
  // WITH CHECK passes. Reproduced directly via SQL (SET LOCAL ROLE authenticated): the
  // identical INSERT with no RETURNING clause succeeds. Splitting into an insert, then a
  // separate read, gives the read its own fresh snapshot where the row genuinely exists.
  const { error: insertError } = await supabase
    .from('transcribe_room_members')
    .insert({ room_id: roomId, profile_id: profileId, display_name: displayName, session_id: session.id });

  // 23505 = unique_violation on (room_id, profile_id) — a page refresh or double "Join
  // room" click while already a member. Idempotent: fall through to the read below, which
  // finds the existing row. Any other error is real and still throws (P1149 finish-review
  // MEDIUM — this previously surfaced the raw Postgres constraint message to the user).
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message);

  const { data, error } = await supabase
    .from('transcribe_room_members')
    .select('id, room_id, profile_id, display_name, session_id, joined_at')
    .eq('room_id', roomId)
    .eq('profile_id', profileId)
    .single();

  if (error) throw new Error(error.message);
  return mapMember(data as unknown as DbMember);
}

export async function getRoomMembers(roomId: string): Promise<TranscribeRoomMember[]> {
  const { data, error } = await supabase
    .from('transcribe_room_members')
    .select('id, room_id, profile_id, display_name, session_id, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as DbMember[]).map(mapMember);
}

export async function getRoomMessages(roomId: string): Promise<TranscribeMessage[]> {
  const { data, error } = await supabase
    .from('transcribe_messages')
    .select('id, room_id, member_id, text, spoken_at, is_final')
    .eq('room_id', roomId)
    .order('spoken_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as DbMessage[]).map(mapMessage);
}

/**
 * Writes one finalized utterance. Interim (not-yet-final) text must NEVER be passed here —
 * the DB's is_final CHECK constraint enforces that as a second line of defense (A4, DW-4).
 */
export async function sendFinalMessage(roomId: string, memberId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { error } = await supabase
    .from('transcribe_messages')
    .insert({ room_id: roomId, member_id: memberId, text: trimmed, is_final: true });
  if (error) throw new Error(error.message);
}

/**
 * Full-refetch-on-event subscription, modeled on event-room-service.ts's
 * subscribeToRoomRoster: never patches payloads, always re-fetches on any change, plus a
 * reconciliation poll as the degrade path if the realtime channel drops.
 */
const RECONCILE_POLL_MS = 15000;

export function subscribeToRoomMembers(roomId: string, onUpdate: (members: TranscribeRoomMember[]) => void): () => void {
  let cancelled = false;
  const reload = async () => {
    try {
      const members = await getRoomMembers(roomId);
      if (!cancelled) onUpdate(members);
    } catch (err) {
      console.error('[transcribe-service] Failed to reload room members:', err);
    }
  };

  const channel = supabase
    .channel(`transcribe_room_members:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transcribe_room_members', filter: `room_id=eq.${roomId}` }, () => { void reload(); })
    .subscribe();

  void reload();
  const pollId = setInterval(() => { void reload(); }, RECONCILE_POLL_MS);

  return () => {
    cancelled = true;
    clearInterval(pollId);
    void supabase.removeChannel(channel);
  };
}

export function subscribeToRoomMessages(roomId: string, onUpdate: (messages: TranscribeMessage[]) => void): () => void {
  let cancelled = false;
  const reload = async () => {
    try {
      const messages = await getRoomMessages(roomId);
      if (!cancelled) onUpdate(messages);
    } catch (err) {
      console.error('[transcribe-service] Failed to reload room messages:', err);
    }
  };

  const channel = supabase
    .channel(`transcribe_messages:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcribe_messages', filter: `room_id=eq.${roomId}` }, () => { void reload(); })
    .subscribe();

  void reload();
  const pollId = setInterval(() => { void reload(); }, RECONCILE_POLL_MS);

  return () => {
    cancelled = true;
    clearInterval(pollId);
    void supabase.removeChannel(channel);
  };
}

/**
 * Ends the room and creates a transcription job for every participant's session
 * (A2/A6, DW-7). Reuses the existing createTranscriptionJob RPC path verbatim — it has
 * no diarization parameter at all, so "diarization off" holds by construction, not by an
 * extra flag this function has to remember to pass.
 */
export async function endRoom(roomId: string): Promise<void> {
  const members = await getRoomMembers(roomId);

  await supabase.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', roomId);

  await Promise.all(
    members.map((m) => createTranscriptionJob('', m.sessionId))
  );
}
