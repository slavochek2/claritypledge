/**
 * P1236: request handler for transcribe-slice, separated from the Deno.serve wiring so
 * every gate can be exercised with fakes (handler.test.ts).
 *
 * Order of gates — every one fails closed, and the order is load-bearing:
 *   env present → Bearer JWT resolves to a user → body parses → payload valid (400) →
 *   caller is a member of the named room (403) → that member has CONSENTED (403) →
 *   the room has not run past its hard stop, the member has not run past its slice
 *   ceiling, the user is not streaming into too many rooms at once (429/410) →
 *   Gemini, on exactly one slice → de-duplicate against this member's own previous row →
 *   ONE service-role insert with a server-derived member_id and a DB-assigned spoken_at.
 *
 * What is deliberately absent:
 *
 * - **No member_id, and no spoken_at, anywhere near the payload.** `validate.ts` enforces
 *   an allow-list, so neither is readable even by accident. member_id comes from
 *   (roomId, auth.uid()); spoken_at is the column's own DEFAULT now(). Handing a client
 *   the ordering column hands it the de-duplication merge order (Decision 4).
 * - **No interpolated variables in the Gemini prompt** — no display name, no prior
 *   transcript, no room code (Decision 8). The system instruction is a fixed string owned
 *   by index.ts, and this handler passes it audio and nothing else.
 * - **No persistence of the pre-dedup candidate.** The merged text is held in this
 *   function's locals and the ONLY row written is the de-duplicated one. There is no
 *   "insert then clean up" step, transient or otherwise.
 */
import { dedupeSliceText } from './dedup.ts';
import { validateSliceRequest, VERR } from './validate.ts';
import { storeLine, type SliceDestination } from './store-line.ts';

/**
 * Decision 6 ceiling 1. Founder-answered 2026-09-08: 180 minutes.
 *
 * P1604 rule 8: measured from the ROOM's creation (it replaces P1307 D11's per-person clock).
 * The sweep rolls a room into "Part 2" at 176 minutes, so a live room never legitimately reaches
 * this; it is the backstop for a roll that did not happen. The same number, measured the same way,
 * is enforced by gcs-signed-url, and the sweep's 176-minute roll sits just inside it — change them
 * together.
 *
 * A constant, not a column, and the migration says why: a settable-looking column on a
 * cost ceiling invites an UPDATE policy, and the point of Decision 6 is that these bounds
 * are not client-reachable. Three hours is far beyond any session length this format has
 * ("maximum once per week or so, and then maximum 10 people"), so it should never fire on
 * legitimate use — it exists for the FORGOTTEN page, not the long one.
 */
export const ROOM_MAX_DURATION_MINUTES = 180;

/**
 * Decision 6 ceiling 2, re-derived for P1307's 13-second cadence (Part 4): 180 minutes is
 * ~830 slices. The bound is 1,000 so a rejoin or a burst of retries does not cut off a
 * legitimate speaker before their own per-person cap does. It is NOT dropped: it also bounds
 * rejoin/replay, since `sequence` is range-checked only.
 */
export const MAX_SLICES_PER_MEMBER = 1_000;

/**
 * Decision 6 ceiling 3. Nothing currently stops one profile creating N rooms and streaming
 * into all of them; a person genuinely in more than three live rooms at once is not a case
 * this product has.
 */
export const MAX_CONCURRENT_ROOMS_PER_USER = 3;

export interface SliceMembership {
  memberId: string;
  /** P1604 rule 8: the room's clock. The 3-hour cap runs from here, for everyone in the room. */
  roomCreatedAt: string;
  /** This member's first Continue. Kept for diagnostics; no longer a clock. */
  memberJoinedAt: string;
  roomEndedAt: string | null;
  /** P1307: set once THIS member's capture has ended — their own End, or the sweep. */
  captureEndedAt: string | null;
  /** NULL means REFUSE — see the migration's column comment. */
  consentGivenAt: string | null;
  sliceCount: number;
}

export interface MovedTo {
  roomId: string;
  roomCode: string;
  memberId: string;
}

export interface HandlerDeps {
  corsHeaders: Record<string, string>;
  envReady: boolean;
  /** Resolves a Bearer token to a user id, or null when invalid/expired. */
  getUserId: (token: string) => Promise<string | null>;
  /** Service-role read: this user's seat in this room, with the room's clock and consent. */
  getMembership: (roomId: string, userId: string) => Promise<SliceMembership | null>;
  /** Service-role read: how many un-ended rooms this user is currently capturing in. */
  countActiveRooms: (userId: string) => Promise<number>;
  /**
   * P1604 rule 4/8: where the 3-hour roll moved this person, if it did: the room that continues this one and the
   * caller's seat in it. Optional so older callers keep working; a throw or null never changes the refusal.
   */
  getMovedTo?: (roomId: string, userId: string) => Promise<MovedTo | null>;
  /**
   * P1307 Decision 2: service-role write of this member's last_seen_at. Called for every
   * accepted REAL slice — silent ones included, warmups never — because the room-end sweep
   * reads it as "this device is still sending". A silent slice writes no message, so
   * transcribe_messages.spoken_at cannot answer that question.
   * P1604 rule 5: the same write CLEARS paused_since — any slice means the device is not paused.
   */
  touchLastSeen: (memberId: string) => Promise<void>;
  /**
   * ONE slice in, its transcript out. The signature is the RQ5 guarantee: there is no
   * shape of this call that accepts a session, a concatenation, or a list. A convenience
   * that "flushes everything pending as one request" cannot be added without changing this
   * type, which is the point.
   */
  transcribe: (audio: Uint8Array) => Promise<string>;
  /** Service-role read: this member's most recent transcribe_messages text, or null. */
  getPreviousText: (memberId: string) => Promise<string | null>;
  /** Service-role write: one row, plus the slice counter, in one call. spoken_at is the
   *  column DEFAULT and is never passed. */
  insertMessage: (roomId: string, memberId: string, text: string) => Promise<unknown>;
  /** P1592: service-role read of where the stored line was (or will be, on retry) posted.
   *  Optional so older callers keep working; a throw or null never fails the slice. */
  getDestination?: (messageId: string) => Promise<SliceDestination | null>;
  /** Injected so the room hard-stop is testable without waiting three hours. */
  now: () => Date;
}

export const ERR = {
  unauthorized: 'Unauthorized',
  notMember: 'Not a member of this room',
  noConsent: 'Recording consent has not been given for this room',
  roomEnded: 'This room has ended',
  captureEnded: 'This capture has ended',
  roomTooLong: 'This capture reached its maximum duration',
  sliceCeiling: 'Slice limit reached for this member',
  tooManyRooms: 'Too many active rooms for this account',
  transcriber: 'Transcription failed',
  persist: 'Failed to store the transcript',
} as const;

/** A failed lookup is "not moved": the refusal itself must never depend on it. */
async function movedTo(deps: HandlerDeps, roomId: string, userId: string): Promise<MovedTo | null> {
  if (!deps.getMovedTo) return null;
  try {
    return await deps.getMovedTo(roomId, userId);
  } catch (err) {
    console.error('[transcribe-slice] moved-to lookup failed:', err);
    return null;
  }
}

/**
 * The 410s: the room ended, this member's capture ended, or the room's clock ran out.
 * P1307: the same refusals gcs-signed-url makes. Without them, a member who pressed End (or whom the sweep ended) could keep
 * having slices transcribed until the whole room ended, while their archive uploads were already refused.
 * P1604 rule 8: the clock is the ROOM's. The 410 is the client's signal to hard stop (release the microphone, flush, clear
 * the bar); the sweep's roll normally moves the room on before this. An ended room says where the roll moved the caller.
 */
async function endedRefusal(
  deps: HandlerDeps, m: SliceMembership, roomId: string, userId: string,
): Promise<{ error: string; movedTo?: MovedTo | null } | null> {
  if (m.roomEndedAt || m.captureEndedAt) {
    return { error: m.roomEndedAt ? ERR.roomEnded : ERR.captureEnded, movedTo: await movedTo(deps, roomId, userId) };
  }
  const ageMs = deps.now().getTime() - new Date(m.roomCreatedAt).getTime();
  return ageMs > ROOM_MAX_DURATION_MINUTES * 60_000 ? { error: ERR.roomTooLong } : null;
}

export async function handleTranscribeSlice(req: Request, deps: HandlerDeps): Promise<Response> {
  const { corsHeaders } = deps;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!deps.envReady) return json(500, { error: 'Service temporarily unavailable' });

  // ── JWT ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: ERR.unauthorized });
  const userId = await deps.getUserId(authHeader.slice('Bearer '.length));
  if (!userId) return json(401, { error: ERR.unauthorized });

  // ── Body + payload bounds, before any DB read ────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: VERR.body });
  }
  const parsed = validateSliceRequest(body);
  if ('error' in parsed) return json(400, { error: parsed.error });

  // ── Membership, then consent ─────────────────────────────────────────────
  // Same ordering rule as gcs-signed-url: a non-member must not learn from the error
  // whether the room they named has a consented speaker in it.
  const m = await deps.getMembership(parsed.roomId, userId);
  if (!m) return json(403, { error: ERR.notMember });
  if (!m.consentGivenAt) return json(403, { error: ERR.noConsent });

  // ── Ceilings (Decision 6) ────────────────────────────────────────────────
  const ended = await endedRefusal(deps, m, parsed.roomId, userId);
  if (ended) return json(410, ended);

  if (m.sliceCount >= MAX_SLICES_PER_MEMBER) return json(429, { error: ERR.sliceCeiling });

  if (await deps.countActiveRooms(userId) > MAX_CONCURRENT_ROOMS_PER_USER) {
    return json(429, { error: ERR.tooManyRooms });
  }

  // ── Pre-warm (Decision 3/6): every gate above ran; there is simply nothing to send ──
  // It costs one edge invocation and takes the first real slice off the cold path. It is
  // an optimisation, not a mitigation — there is no ~30 s GPU cold start to hide any more.
  if (parsed.kind === 'warmup') return json(200, { warmed: true });

  // ── Presence (P1307 Decision 2) ──────────────────────────────────────────
  // After every gate, before Gemini: a slice that then fails to transcribe still proves the
  // device is sending. A failed stamp must not cost the speaker their live text, so it is
  // logged and the slice proceeds — the sweep's 10-minute window absorbs a missed stamp.
  try {
    await deps.touchLastSeen(m.memberId);
  } catch (err) {
    console.error('[transcribe-slice] last_seen_at stamp failed:', err);
  }

  // ── Gemini: exactly one slice, no interpolated variables ─────────────────
  let candidate: string;
  try {
    candidate = await deps.transcribe(parsed.audio);
  } catch (err) {
    console.error('[transcribe-slice] transcription failed:', err);
    return json(502, { error: ERR.transcriber });
  }
  if (!candidate.trim()) {
    // Silence, or a slice Gemini heard nothing in. Writing an empty row would violate the
    // text CHECK constraint anyway, but the reason to skip is that a silent second is not
    // an utterance and should leave no trace in the transcript.
    return json(200, { text: '', stripped: 0 });
  }

  // ── De-duplicate the lead-in overlap (Decision 4) ────────────────────────
  const previous = await deps.getPreviousText(m.memberId);
  const deduped = dedupeSliceText(previous, candidate);
  const text = deduped.text.trim();
  if (!text) {
    // The whole slice repeated the previous one. Nothing new was said.
    return json(200, { text: '', stripped: deduped.strippedTokens });
  }

  const stored = await storeLine(deps, parsed.roomId, m.memberId, text);
  if (!stored.ok) return json(500, { error: ERR.persist });
  return json(200, { text, stripped: deduped.strippedTokens, destination: stored.destination });
}
