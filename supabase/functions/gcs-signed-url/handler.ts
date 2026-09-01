/**
 * P1223 (G6): request handler for gcs-signed-url, separated from the Deno.serve wiring so
 * the authorization branches can be exercised with fakes (handler.test.ts).
 *
 * Order of gates — every one fails closed:
 *   env present → Bearer JWT resolves to a user → body parses → shapes valid (400) →
 *   caller is a participant of the named session / a member of the named room (403) →
 *   forward to the Cloud Function with the upload secret.
 */
import { isValidContentType, isValidFileName, parseUploadTarget } from './validate.ts';

export interface SessionParticipants {
  creatorProfileId: string | null;
  joinerProfileId: string | null;
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
  /** Service-role read: the two participant columns of the session with this code. */
  getSessionParticipants: (code: string) => Promise<SessionParticipants | null>;
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
  notParticipant: 'Not a participant of this session',
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
  if (!isValidFileName(body.fileName)) return json(400, { error: ERR.badFileName });
  if (!isValidContentType(body.contentType)) return json(400, { error: ERR.badContentType });

  // ── Bind the caller to the target ────────────────────────────────────────
  // Not-found and not-a-participant collapse to the same 403 so the endpoint cannot be
  // used to probe which codes exist.
  if (target.kind === 'session') {
    const s = await deps.getSessionParticipants(target.code);
    const isParticipant = !!s && (s.creatorProfileId === userId || s.joinerProfileId === userId);
    if (!isParticipant) return json(403, { error: ERR.notParticipant });
  } else {
    const m = await deps.getRoomMembership(target.memberId);
    const isMember = !!m && m.profileId === userId && m.roomCode === target.code;
    if (!isMember) return json(403, { error: ERR.notParticipant });
  }

  // ── Proxy to Cloud Function with secret ──────────────────────────────────
  try {
    const response = await deps.forward({
      sessionCode: body.sessionCode as string,
      fileName: body.fileName,
      contentType: body.contentType,
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
