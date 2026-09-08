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

/**
 * Decision 6 ceiling 1. Founder-answered 2026-09-08: 180 minutes.
 *
 * A constant, not a column, and the migration says why: a settable-looking column on a
 * cost ceiling invites an UPDATE policy, and the point of Decision 6 is that these bounds
 * are not client-reachable. Three hours is far beyond any session length this format has
 * ("maximum once per week or so, and then maximum 10 people"), so it should never fire on
 * legitimate use — it exists for the FORGOTTEN room, not the long one.
 */
export const ROOM_MAX_DURATION_MINUTES = 180;

/**
 * Decision 6 ceiling 2. 180 minutes at Decision 1's 4-second cadence is 2700 slices; the
 * bound is 3000 so a rejoin or a burst of retries does not cut off a legitimate speaker
 * before the room's own hard stop does. The room clock is the primary bound — this one
 * catches a client that has stopped honouring the cadence.
 */
export const MAX_SLICES_PER_MEMBER = 3_000;

/**
 * Decision 6 ceiling 3. Nothing currently stops one profile creating N rooms and streaming
 * into all of them; a person genuinely in more than three live rooms at once is not a case
 * this product has.
 */
export const MAX_CONCURRENT_ROOMS_PER_USER = 3;

export interface SliceMembership {
  memberId: string;
  /** Room clock for the hard stop. */
  roomCreatedAt: string;
  roomEndedAt: string | null;
  /** NULL means REFUSE — see the migration's column comment. */
  consentGivenAt: string | null;
  sliceCount: number;
}

export interface HandlerDeps {
  corsHeaders: Record<string, string>;
  envReady: boolean;
  /** Resolves a Bearer token to a user id, or null when invalid/expired. */
  getUserId: (token: string) => Promise<string | null>;
  /** Service-role read: this user's seat in this room, with the room's clock and consent. */
  getMembership: (roomId: string, userId: string) => Promise<SliceMembership | null>;
  /** Service-role read: how many un-ended rooms this user is currently a member of. */
  countActiveRooms: (userId: string) => Promise<number>;
  /** Service-role write: stamp ended_at. Called when the room passes its hard stop. */
  endRoom: (roomId: string) => Promise<void>;
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
  insertMessage: (roomId: string, memberId: string, text: string) => Promise<void>;
  /** Injected so the room hard-stop is testable without waiting three hours. */
  now: () => Date;
}

export const ERR = {
  unauthorized: 'Unauthorized',
  notMember: 'Not a member of this room',
  noConsent: 'Recording consent has not been given for this room',
  roomEnded: 'This room has ended',
  roomTooLong: 'This room reached its maximum duration and has been ended',
  sliceCeiling: 'Slice limit reached for this member',
  tooManyRooms: 'Too many active rooms for this account',
  transcriber: 'Transcription failed',
  persist: 'Failed to store the transcript',
} as const;

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
  if (m.roomEndedAt) return json(410, { error: ERR.roomEnded });

  const ageMs = deps.now().getTime() - new Date(m.roomCreatedAt).getTime();
  if (ageMs > ROOM_MAX_DURATION_MINUTES * 60_000) {
    // The client cannot be the clock — endRoom() is caller-initiated only, so today a
    // joined member can stay indefinitely. Ending it HERE is what makes the hard stop
    // real: after this the room is closed for every member, not just this one.
    await deps.endRoom(parsed.roomId);
    return json(410, { error: ERR.roomTooLong });
  }

  if (m.sliceCount >= MAX_SLICES_PER_MEMBER) return json(429, { error: ERR.sliceCeiling });

  if (await deps.countActiveRooms(userId) > MAX_CONCURRENT_ROOMS_PER_USER) {
    return json(429, { error: ERR.tooManyRooms });
  }

  // ── Pre-warm (Decision 3/6): every gate above ran; there is simply nothing to send ──
  // It costs one edge invocation and takes the first real slice off the cold path. It is
  // an optimisation, not a mitigation — there is no ~30 s GPU cold start to hide any more.
  if (parsed.kind === 'warmup') return json(200, { warmed: true });

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

  try {
    await deps.insertMessage(parsed.roomId, m.memberId, text);
  } catch (err) {
    console.error('[transcribe-slice] insert failed:', err);
    return json(500, { error: ERR.persist });
  }

  return json(200, { text, stripped: deduped.strippedTokens });
}
