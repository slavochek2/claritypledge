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
export async function createRoom(profileId: string, displayName: string, consentGiven: boolean, eventId?: string): Promise<{ room: TranscribeRoom; member: TranscribeRoomMember }> {
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
  const member = await joinRoom(room.id, profileId, displayName, consentGiven);
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
 * recording"), then records the membership through the join RPC.
 *
 * P1236 Decision 5: consent is a REQUIRED argument and is written by the server, in the
 * same statement as the member row. Before this, `consentGiven` was a React useState
 * boolean that never left the browser — so a valid member JWT replayed without ever
 * rendering the consent screen was indistinguishable server-side from a consented one.
 * That was survivable only while RECORD_AUDIO_WHILE_LIVE kept the capture branch dead;
 * P1236 turns capture back on, so it stops being survivable.
 *
 * `profileId` is still needed here — createClaritySession takes it — but it is NOT passed
 * to the RPC. The RPC derives the member's identity from auth.uid() itself, because a
 * SECURITY DEFINER function that accepts the identity it is about to write is an
 * impersonation primitive. Do not "helpfully" add it as an argument.
 *
 * The insert-then-read split this replaces existed because INSERT ... RETURNING is
 * evaluated under the SELECT policy, which cannot see the row its own INSERT is still
 * writing (42501 under `SET LOCAL ROLE authenticated`, reproduced in SQL). That reasoning
 * now lives with the code that acts on it, in the RPC's own migration comment.
 */
export async function joinRoom(roomId: string, profileId: string, displayName: string, consentGiven: boolean): Promise<TranscribeRoomMember> {
  const session = await createClaritySession(displayName, profileId, false);

  const { data, error } = await supabase.rpc('join_transcribe_room', {
    p_room_id: roomId,
    p_display_name: displayName,
    p_session_id: session.id,
    p_consent: consentGiven,
  });

  if (error) throw new Error(error.message);
  // RETURNS TABLE, so a set — the RPC upserts exactly one row, but an empty result would
  // otherwise surface as `undefined.id` three frames away from the cause.
  const row = ((data ?? []) as unknown as DbMember[])[0];
  if (!row) throw new Error('Join did not return a membership row');
  return mapMember(row);
}

/** P1236 Decision 2: the live transcription ingest. Not the GCS signed-URL route — see
 *  the decision for why four hops and ~900 signed-URL mints per member-hour was the wrong
 *  shape for a path with a ~6 s end-to-end budget. */
const TRANSCRIBE_SLICE_EDGE_FUNCTION = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/transcribe-slice`;

/** Chunked because String.fromCharCode(...bytes) on a ~160 KB slice exceeds the argument
 *  limit and throws — on the phone, mid-conversation, with no other symptom. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function postSlicePayload(body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const response = await fetch(TRANSCRIBE_SLICE_EDGE_FUNCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`transcribe-slice ${response.status}: ${(detail as { error?: string }).error ?? 'unknown'}`);
  }
}

/**
 * The wake-on-join POST (Decision 3/6). Carries no audio at all.
 *
 * It is an OPTIMISATION, not a mitigation, and should not be described as one: after the
 * engine decision there is no ~30 s GPU cold start to hide, only a sub-second edge-function
 * one. It costs a single request and takes the first real slice off the cold path. It runs
 * after joinRoom resolves — so it is gated on the authenticated join, never on a
 * client-callable "start" endpoint.
 */
export async function prewarmSlicePath(roomId: string): Promise<void> {
  await postSlicePayload({ roomId, warmup: true });
}

/**
 * Sends one 5-second WAV slice for transcription.
 *
 * Note what is NOT in the payload: no member id, no spoken_at, no text. The server derives
 * attribution from (roomId, auth.uid()) and lets the column DEFAULT assign spoken_at, which
 * is the de-duplication ordering key. The ingest function validates against an allow-list,
 * so adding any of them here would be rejected rather than quietly honoured — deliberately.
 *
 * `sequence` bounds and rejects replays. It is NOT the ordering key and must not become one.
 */
export async function sendAudioSlice(roomId: string, sequence: number, wav: Uint8Array): Promise<void> {
  await postSlicePayload({ roomId, sequence, audio: bytesToBase64(wav) });
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
 * P1236 removed `sendFinalMessage`.
 *
 * It was the client's insert path onto transcribe_messages, driven by the browser
 * recognizer. Decision 7 removes the recognizer, and Decision 2 makes the SERVER the
 * writer: transcribe-slice derives member_id from (room_id, auth.uid()) and inserts through
 * record_transcribe_slice() under the service role. This file now has zero writes to that
 * table, which is the property `p1149-interim-never-persists.test.ts` asserts.
 *
 * NOT closed by this: transcribe_messages still carries P1149's "room members can send
 * their own messages" INSERT policy, so a client could still write a row attributed to its
 * own seat by calling PostgREST directly. That predates P1236 and removing it is a
 * separate decision — deleting our own wrapper does not close a policy.
 */

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
