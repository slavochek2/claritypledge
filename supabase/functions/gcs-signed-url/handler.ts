/**
 * P1223 (G6): request handler for gcs-signed-url, separated from the Deno.serve wiring so
 * the authorization branches can be exercised with fakes (handler.test.ts).
 *
 * Order of gates — every one fails closed:
 *   env present → Bearer JWT resolves to a user → body parses → shapes valid (400) →
 *   ext ↔ content-type consistent (400) →
 *   caller is a participant of the named session / the named member of the room (403) →
 *   the requested object name belongs to the caller (403) →
 *   forward to the Cloud Function with the upload secret.
 */
import { sanitizeParticipantName } from '../_shared/participant-name.ts';
import {
  isConsistentFileType,
  isValidContentType,
  isValidFileName,
  parseSessionObject,
  parseUploadTarget,
  ROOM_FILE_NAME_RE,
} from './validate.ts';

export interface SessionRow {
  creatorProfileId: string | null;
  joinerProfileId: string | null;
  creatorName: string | null;
  joinerName: string | null;
}

export interface RoomMembership {
  profileId: string;
  roomCode: string;
}

export interface HandlerDeps {
  corsHeaders: Record<string, string>;
  envReady: boolean;
  /** Resolves a Bearer token to a user id, or null when invalid/expired. */
  getUserId: (token: string) => Promise<string | null>;
  /** Service-role read: participant ids + display names of the session with this code. */
  getSession: (code: string) => Promise<SessionRow | null>;
  /** Service-role read: the caller's current profile display name (null if none). */
  getProfileName: (userId: string) => Promise<string | null>;
  /** Service-role read: the member row (by id) joined to its room's code. */
  getRoomMembership: (memberId: string) => Promise<RoomMembership | null>;
  /** POSTs the validated body to the Cloud Function; returns its raw response. */
  forward: (body: { sessionCode: string; fileName: string; contentType: string }) => Promise<Response>;
}

export const ERR = {
  unauthorized: 'Unauthorized',
  invalidBody: 'Invalid request body',
  missingFields: 'Missing required fields: sessionCode, fileName, contentType',
  badSessionCode: 'Invalid sessionCode',
  badFileName: 'Invalid fileName',
  badContentType: 'Invalid contentType',
  typeMismatch: 'contentType does not match fileName extension',
  notParticipant: 'Not a participant of this session',
  notYourObject: 'fileName does not belong to the caller',
  upstream: 'Failed to get signed upload URL',
} as const;

export async function handleGcsSignedUrl(req: Request, deps: HandlerDeps): Promise<Response> {
  const { corsHeaders } = deps;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!deps.envReady) {
    return json(500, { error: 'Service temporarily unavailable' });
  }

  // ── JWT validation ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: ERR.unauthorized });
  }
  const userId = await deps.getUserId(authHeader.slice('Bearer '.length));
  if (!userId) {
    return json(401, { error: ERR.unauthorized });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: ERR.invalidBody });
  }
  if (!body || typeof body !== 'object') {
    return json(400, { error: ERR.invalidBody });
  }
  if (!body.sessionCode || !body.fileName || !body.contentType) {
    return json(400, { error: ERR.missingFields });
  }

  // ── Shape validation (before any DB read) ────────────────────────────────
  const target = parseUploadTarget(body.sessionCode);
  if (!target) return json(400, { error: ERR.badSessionCode });
  const fileName = body.fileName;
  const contentType = body.contentType;
  if (!isValidFileName(fileName)) return json(400, { error: ERR.badFileName });
  if (!isValidContentType(contentType)) return json(400, { error: ERR.badContentType });
  if (!isConsistentFileType(fileName, contentType)) return json(400, { error: ERR.typeMismatch });

  // ── Bind the caller to the target AND to the object name ─────────────────
  // Not-found and not-a-participant collapse to the same 403 so the endpoint cannot be
  // used to probe which codes exist.
  if (target.kind === 'session') {
    const s = await deps.getSession(target.code);
    const role = !s ? null
      : s.creatorProfileId === userId ? 'creator'
      : s.joinerProfileId === userId ? 'joiner'
      : null;
    if (!s || !role) return json(403, { error: ERR.notParticipant });

    // Object names carry the participant's sanitised display name (api.ts). The client
    // takes that name from EITHER the session row (join name) OR the current profile
    // (clarity-live-page.tsx setName(user.name)), so both server-derived spellings are
    // admitted; nothing the caller sends is trusted for this decision.
    const obj = parseSessionObject(fileName);
    if (!obj) return json(400, { error: ERR.badFileName });
    if (obj.kind === 'owned') {
      const roleName = role === 'creator' ? s.creatorName : s.joinerName;
      const profileName = await deps.getProfileName(userId);
      const allowed = new Set(
        [roleName, profileName]
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
          .map(sanitizeParticipantName)
          .filter((n) => n.length > 0),
      );
      if (!allowed.has(obj.owner)) return json(403, { error: ERR.notYourObject });
    }
    // obj.kind === 'shared' (`events.json`): the session-level events file. Both
    // participants write it today (uploadSessionRecording runs on each side) and the last
    // writer wins, so it stays writable by either participant. [FOUNDER DECISION: keep
    // events.json writable by both participants, or creator-only? Creator-only would break
    // the joiner's end-of-session upload as shipped.]
  } else {
    const m = await deps.getRoomMembership(target.memberId);
    const isMember = !!m && m.profileId === userId && m.roomCode === target.code;
    if (!isMember) return json(403, { error: ERR.notParticipant });
    // The member identity is already in the prefix; the only object the room client
    // writes there is chunk_NNN.webm.
    if (!ROOM_FILE_NAME_RE.test(fileName)) return json(400, { error: ERR.badFileName });
  }

  // ── Proxy to Cloud Function with secret ──────────────────────────────────
  try {
    const response = await deps.forward({
      sessionCode: body.sessionCode as string,
      fileName,
      contentType,
    });
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('Error proxying to GCS Cloud Function:', err);
    return json(502, { error: ERR.upstream });
  }
}
