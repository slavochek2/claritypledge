/**
 * @file transcribe-service.ts
 * @description P1149: data layer for /transcribe — the live room transcription chat.
 * Rooms, membership, and the room's live chat text (transcribe_messages). Does not
 * touch clarity_sessions, transcription_jobs, or event_room_members directly beyond
 * calling the existing createClaritySession / createTranscriptionJob (A2).
 */
import { supabase } from '@/lib/supabase';
import { createClaritySession, createTranscriptionJob } from './api';
// Shared with slice-recorder.ts: the same defect appeared at three layers of this feature,
// so the deadline lives in one place rather than three copies that drift.
import { withDeadline, RequestTimeoutError } from '@/lib/with-deadline';

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

/** The flattened row `create_transcribe_room` returns — room and member in one record,
 *  because they are written in one transaction. Not a DbRoom and not a DbMember. */
interface DbCreatedRoom {
  room_id: string;
  room_code: string;
  room_event_id: string | null;
  room_created_at: string;
  room_ended_at: string | null;
  member_id: string;
  member_profile_id: string;
  member_display_name: string;
  member_session_id: string;
  member_joined_at: string;
  member_consent_given_at: string | null;
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
 * Every network await on the room-entry path is deadlined. P1236, measured 2026-09-11 on a
 * physical phone whose traffic was going through a VPN tunnel.
 *
 * `fetch` has no timeout in any browser, and neither PostgREST calls nor
 * `supabase.auth.getSession()` take a signal. On a radio that accepts the connection and
 * then never answers, the promise simply never settles — so `handleJoin` sat on "Joining…"
 * FOREVER: no error, no timeout, no way back except reloading the page. The participant
 * cannot tell that apart from a slow server, and neither could we: the first diagnosis of
 * this looked at the room RPC, which was never reached and was never at fault.
 *
 * A hang is the failure mode worth engineering against here, not a 500. An error response
 * already surfaces correctly; silence is what has no bottom. Compare the sibling constant
 * SLICE_REQUEST_TIMEOUT_MS below, which exists for the same reason one layer up — an
 * unbounded await there jammed a serial queue for a whole session.
 *
 * 15 s because entry is a foreground action a person is actively waiting on, and because
 * it matches the slice deadline; there is no reason for the two to differ. Exceeding it
 * produces an honest "the server did not respond" instead of an indefinite spinner.
 */
const ROOM_ENTRY_TIMEOUT_MS = 15_000;

/** What a participant sees when a request got no answer at all. Deliberately names the
 *  connection: the cause is upstream of this app every time it has been observed (a VPN
 *  tunnel that completed the TCP connect and then swallowed the request, 2026-09-11), and
 *  "try again" alone sends people to retry a thing that cannot succeed.
 *  [FOUNDER DECISION: copy] — placeholder wording, not yet chosen by the founder. */
export const SERVER_UNREACHABLE_MESSAGE =
  'The server did not respond. Check your connection and try again.';

/**
 * Turns a fired deadline into the one sentence a participant can act on, and leaves every
 * other rejection exactly as it was. Returns `never`, so it type-checks as a `.catch()` on a
 * promise of any shape.
 *
 * Only a RequestTimeoutError is rewritten. A real server error already carries a message
 * worth reading, and flattening the two together is how "Could not start a room. Please try
 * again." came to be shown for a stalled VPN tunnel — advice that could not work, for a cause
 * it did not name.
 */
function rethrowAsUnreachable(logLabel: string): (err: unknown) => never {
  return (err: unknown): never => {
    if (err instanceof RequestTimeoutError) {
      console.error(`${logLabel} got no response:`, err.message);
      throw new Error(SERVER_UNREACHABLE_MESSAGE);
    }
    throw err;
  };
}

/**
 * Creates a new ad-hoc room (event_id null) and joins the caller as its first member.
 * The room field exists from day one, even for a single participant (spec §6).
 */
export async function createRoom(profileId: string, displayName: string, consentGiven: boolean, eventId?: string): Promise<{ room: TranscribeRoom; member: TranscribeRoomMember }> {
  // The seat's recording is minted first because the RPC verifies it belongs to the caller
  // before it will write anything — the check exists precisely so a caller cannot attach
  // someone else's recording to their own seat, and it needs a row to check against.
  // No discardSession() on this one: if the mint itself never answered we do not have a row
  // id to discard. The row may or may not exist server-side; that is the orphan case the
  // comment below is already about, and guessing an id does not improve it.
  const session = await withDeadline(
    createClaritySession(displayName, profileId, false),
    ROOM_ENTRY_TIMEOUT_MS,
    'creating the session record',
  ).catch(rethrowAsUnreachable('[transcribe] creating the session record'));

  // Every failure path below has already spent that row. Nothing else references it yet, and
  // clarity_sessions.creator_profile_id has no ON DELETE CASCADE, so an abandoned one outlives
  // the profile and blocks its deletion.
  //
  // THIS CLEANUP CANNOT CURRENTLY SUCCEED, AND THAT IS DELIBERATELY VISIBLE. clarity_sessions
  // has RLS enabled and NO DELETE policy — only INSERT, SELECT and UPDATE — so a delete issued
  // by `authenticated` is filtered to zero rows. PostgREST reports no error for a zero-row
  // delete, so an `if (error)` check here reports success forever. Measured 2026-09-09 against
  // the test database: the row's own creator deletes 0 rows, while the same statement as the
  // table owner deletes 1, so this is RLS and not a bad predicate.
  //
  // The statement is kept rather than removed for two reasons: it is already correct for the
  // day a DELETE policy exists, and asking for the deleted rows back turns a silent no-op into
  // a warning that names the orphan. Whether creators may delete their own sessions at all is a
  // product decision, not a mechanical fix — tracked separately.
  const discardSession = async () => {
    const { data, error } = await withDeadline(
      supabase.from('clarity_sessions').delete().eq('id', session.id).select('id'),
      ROOM_ENTRY_TIMEOUT_MS,
      'discarding the unused session',
    ).catch((err: unknown) => ({ data: null, error: err as { message: string } }));
    if (error) {
      console.error('[transcribe] could not discard the unused session:', error.message);
    } else if (!data || data.length === 0) {
      console.warn(
        `[transcribe] orphaned clarity_session ${session.id}: no DELETE policy on clarity_sessions, ` +
        'so the row could not be discarded. It will block this profile\'s deletion.',
      );
    }
  };

  const maxAttempts = 5;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    // P1236 (f): ONE shared room. Everyone arriving at /transcribe without a code lands in
    // the room that is already running, and only the first arrival creates one. Before this,
    // every visitor created a private room and sat alone in it — not because joining was
    // unimplemented, but because nothing ever showed a visitor a room code to share, so the
    // two-participant case the feature exists for was unreachable.
    //
    // The retry loop around this call is still the code-collision retry: `p_new_code` is only
    // consumed on the create branch, and a 23505 there is what a retry fixes. On the join
    // branch the generated code is simply unused.
    const { data, error } = await withDeadline(
      supabase.rpc('enter_transcribe_room', {
        p_display_name: displayName,
        p_session_id: session.id,
        p_consent: consentGiven,
        p_new_code: generateTranscribeRoomCode(),
        p_event_id: eventId ?? null,
      }),
      ROOM_ENTRY_TIMEOUT_MS,
      'entering the room',
    ).catch(async (err: unknown) => {
      // A fired deadline skips the `error` branch below, so the orphan cleanup has to be
      // re-stated here rather than fallen through to.
      await discardSession();
      return rethrowAsUnreachable('[transcribe] entering the room')(err);
    });

    if (!error) {
      // RETURNS TABLE, so a set. An empty one would otherwise surface as `undefined.room_id`
      // several frames from the cause.
      const row = ((data ?? []) as unknown as DbCreatedRoom[])[0];
      if (!row) {
        // transcribe-room-page.tsx renders err.message verbatim to the participant, so this
        // says the same thing every other failure here says. The diagnostic detail goes to
        // the console, where it is useful, rather than into the room's UI.
        await discardSession();
        console.error('[transcribe] enter_transcribe_room returned no row');
        throw new Error('Could not start a room. Please try again.');
      }
      return {
        room: mapRoom({
          id: row.room_id,
          code: row.room_code,
          event_id: row.room_event_id,
          created_at: row.room_created_at,
          ended_at: row.room_ended_at,
        }),
        // profile_id comes back from the RPC, which derived it from auth.uid(). The caller's
        // own `profileId` argument is NOT used here: the server's answer to "whose seat is
        // this" is the only one that governs attribution downstream.
        member: mapMember({
          id: row.member_id,
          room_id: row.room_id,
          profile_id: row.member_profile_id,
          display_name: row.member_display_name,
          session_id: row.member_session_id,
          joined_at: row.member_joined_at,
        }),
      };
    }

    // The RPC deliberately does not swallow a code collision, so the retry stays here where
    // the code is generated. Any other error is terminal — retrying it would only burn the
    // remaining attempts and report the collision message for an unrelated failure.
    if (error.code === '23505') continue;

    await discardSession();
    console.error('[transcribe] create_transcribe_room failed:', error.code, error.message);
    throw new Error('Could not start a room. Please try again.');
  }

  await discardSession();
  console.error(`[transcribe] ${maxAttempts} room-code collisions in a row — check the generator`);
  throw new Error('Could not start a room. Please try again.');
}

/** Looks up an existing room by its code. Returns null if not found.
 *
 *  P1207 F2: goes through a SECURITY DEFINER RPC rather than selecting the table. `code` is a
 *  join credential, not an identifier — the table's SELECT policy used to be USING (true) for
 *  every authenticated user, which let anyone enumerate every live room's code and walk into
 *  any transcription session. The table read is now member-scoped, and a code must be
 *  PRESENTED (exact match) instead of listed. */
export async function getRoomByCode(code: string): Promise<TranscribeRoom | null> {
  const { data, error } = await withDeadline(
    supabase.rpc('get_transcribe_room_by_code', { p_code: code.toUpperCase() }),
    ROOM_ENTRY_TIMEOUT_MS,
    'looking up the room',
  ).catch(rethrowAsUnreachable('[transcribe] looking up the room'));

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
  const session = await withDeadline(
    createClaritySession(displayName, profileId, false),
    ROOM_ENTRY_TIMEOUT_MS,
    'creating the session record',
  ).catch(rethrowAsUnreachable('[transcribe] creating the session record'));

  const { data, error } = await withDeadline(
    supabase.rpc('join_transcribe_room', {
      p_room_id: roomId,
      p_display_name: displayName,
      p_session_id: session.id,
      p_consent: consentGiven,
    }),
    ROOM_ENTRY_TIMEOUT_MS,
    'joining the room',
  ).catch(rethrowAsUnreachable('[transcribe] joining the room'));

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

/**
 * Every slice upload is deadlined. P1236, measured 2026-09-10 on a physical phone.
 *
 * `createSerialSender` chains sends strictly one at a time (`tail = tail.then(...)`) and
 * bounds the queue at `maxPending`. Both are correct, and together they make a send that
 * NEVER SETTLES fatal rather than slow: the chain never advances, `pending` never returns
 * below the cap, and from then on every slice for the rest of the session is dropped by
 * the `pending >= maxPending` guard. The user sees a room that says "Listening" and stores
 * nothing, with no error anywhere and HTTP 200 on the last request that got through.
 *
 * That is not hypothetical — it is the failure this constant was added for. A room
 * transcribed two utterances, then stored nothing for the next 2.5 minutes while the
 * microphone, the WAV assembly and Gemini were each proven healthy in isolation (the
 * captured slice transcribed correctly when replayed against the API by hand).
 *
 * There are TWO awaits here and both can hang, so both are covered:
 *   - `supabase.auth.getSession()` performs a NETWORK token refresh when the access token
 *     is near expiry. On a stalled radio that promise simply never resolves. It is the
 *     easier one to miss because it reads like a local cache lookup.
 *   - `fetch` without a signal has no timeout in any browser.
 *
 * A deadline that fires is a normal outcome, not an error condition: the slice is dropped
 * (never retried — see `sendAudioSlice`), the chain advances, and the NEXT slice is sent.
 * Losing one slice costs a few seconds of live text; losing the chain costs the session.
 */
export const SLICE_REQUEST_TIMEOUT_MS = 15_000;

async function postSlicePayload(body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await withDeadline(
    supabase.auth.getSession(),
    SLICE_REQUEST_TIMEOUT_MS,
    'auth.getSession',
  );
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in');

  const response = await fetch(TRANSCRIBE_SLICE_EDGE_FUNCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    // Belt and braces: the signal covers connect + response headers; withDeadline below
    // also covers a body that streams forever after a 200.
    signal: AbortSignal.timeout(SLICE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await withDeadline(
      response.json().catch(() => ({})),
      SLICE_REQUEST_TIMEOUT_MS,
      'transcribe-slice error body',
    ).catch(() => ({}));
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
 * `sequence` is a BOUND, not a replay defence — corrected 2026-09-08 after review found the
 * original wording ("bounds and rejects replays") described a check that does not exist.
 * The server range-checks it (0..MAX_SEQUENCE) and nothing else: there is no per-member
 * seen-sequence set and no monotonicity comparison anywhere in the ingest function. A
 * replayed slice IS transcribed, billed and inserted, bounded only by the per-member slice
 * ceiling and the room's hard stop.
 *
 * A monotonic check was considered and NOT built: rejoining a room restarts this counter at
 * 0 against the same member row, so `sequence <= last_seen` would refuse every slice after
 * a refresh. Making that work needs a reset signal the server can trust, which is a
 * mechanism — and the threat it would close is already bounded by the two ceilings. Left as
 * a founder decision rather than designed in at the end of a build.
 *
 * It is also NOT the ordering key and must not become one; `spoken_at` is DB-assigned.
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
  const members = await withDeadline(
    getRoomMembers(roomId), ROOM_ENTRY_TIMEOUT_MS, 'reading the roster',
  ).catch(rethrowAsUnreachable('[transcribe] reading the roster'));

  // `.is('ended_at', null)` is what makes this idempotent, and `.select('id')` is what lets
  // us find out. Without both, ending a room twice creates a SECOND transcription job for
  // every member — including members who are not present and whose job was created hours
  // earlier.
  //
  // Two ordinary sequences reach it, neither of them a race a user could be blamed for:
  //
  //   - The server ends the room when a slice arrives past the duration cap. Nothing tells
  //     the other members' browsers (they keep showing "Listening"), so when one of them
  //     later taps "End Session" the client path runs against an already-ended room and
  //     re-stamps `ended_at` to the later time — losing when the room actually ended.
  //   - Two members tap "End Session" within a moment of each other.
  //
  // The server's own endRoom (transcribe-slice/index.ts) already guards exactly this way.
  // This is the client half catching up, not a new idea.
  const { data: ended, error } = await withDeadline(
    supabase
      .from('transcribe_rooms')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', roomId)
      .is('ended_at', null)
      .select('id'),
    ROOM_ENTRY_TIMEOUT_MS,
    'ending the room',
  ).catch(rethrowAsUnreachable('[transcribe] ending the room'));

  if (error) throw new Error(error.message);

  // Zero rows means someone else ended it first. That is a normal outcome, not a failure:
  // their end already created the jobs, so creating them again is the bug this returns to
  // avoid. Logged rather than silent, because "my End Session did nothing" should be
  // findable when a transcript later turns up missing.
  if (!ended || ended.length === 0) {
    console.warn(`[transcribe] room ${roomId} was already ended — not creating duplicate jobs`);
    return;
  }

  await Promise.all(
    members.map((m) => createTranscriptionJob('', m.sessionId))
  );
}
