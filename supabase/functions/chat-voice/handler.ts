/**
 * P1576 Part B: request handler for chat-voice, separated from the Deno.serve wiring so every gate
 * can be exercised with fakes (handler.test.ts). index.ts owns env, clients and external calls.
 *
 * Modes (JSON body):
 *   upload    {conversationId, threadRootId?}                  → signed PUT for a server-derived key
 *                                                                 <conversation>/<caller>/<uuid>.wav
 *   commit    {conversationId, objectKey, threadRootId?, replyToId?} → validates the stored clip, inserts
 *                                                                 the message AS the caller, then
 *                                                                 transcribes in the background
 *   playback  {messageId}                                      → 2-minute signed GET
 *   sweep     (x-cron-secret only)                             → retry stuck transcripts, drain the purge queue
 *
 * Order of gates — every one fails closed, and the order is load-bearing:
 *   env → (sweep: secret) → Bearer JWT resolves to a user → body parses → ids are well-formed (400) →
 *   the DATABASE says the caller may post in that conversation (403; the owner's own mirror is allowed, P1576) →
 *   only then is storage touched. A non-member never causes a read, a sign or a delete.
 *
 * Duration is read from the stored object's own WAV header and compared with the stored size; a
 * client-sent duration does not exist in this API. A failed commit never deletes anything: see `reject`.
 */
import { bearerUserId } from '../_shared/bearer.ts';
import { BYTES_PER_SECOND, checkStoredClip, pcmOf, VOICE_MAX_MS, WAV_HEADER_BYTES, waveformBars } from './clip.ts';

export { VOICE_MAX_MS };

/** Playback URLs live 2 minutes: a deleted note is unplayable within that window of the delete. The client fetches again on each play. */
export const PLAYBACK_TTL_SECONDS = 120;
/** Upload URLs live 5 minutes: enough for a 2-minute clip on a poor link, and short enough that a URL cannot re-create an object after purge removed it. */
export const UPLOAD_TTL_SECONDS = 300;
/** Header slack a valid recorder may add (LIST chunks). */
export const HEADER_SLACK_BYTES = 1024;
/** The signed PUT refuses anything outside this range, so a long recording cannot be stored at all. */
export const MIN_UPLOAD_BYTES = WAV_HEADER_BYTES;
export const MAX_UPLOAD_BYTES = (VOICE_MAX_MS / 1000) * BYTES_PER_SECOND + WAV_HEADER_BYTES + HEADER_SLACK_BYTES;

export const ERR = {
  unauthorized: 'Unauthorized',
  invalidBody: 'Invalid request body',
  invalidMode: 'Invalid mode',
  invalidId: 'Invalid id',
  badKey: 'Invalid object key',
  notMember: 'Not a member of this conversation',
  notYours: 'That upload belongs to someone else',
  unsupported: 'Voice notes are not available in this chat',
  notFound: 'Upload not found',
  badAudio: 'The recording is not a valid 16 kHz mono WAV',
  tooLong: 'The recording is longer than the 2 minute limit',
  rate: 'Too many voice notes, try again in a minute',
  uploadRate: 'Too many uploads, try again in a few minutes',
  gone: 'The audio is no longer available',
  internal: 'Service temporarily unavailable',
} as const;

export type PostCheck = 'ok' | 'forbidden' | 'unsupported';
export type UploadCheck = PostCheck | 'rate';

export interface CommitInput {
  userId: string;
  conversationId: string;
  objectKey: string;
  durationMs: number;
  threadRootId: string | null;
  replyToId: string | null;
  /** The upload's own id: a retried commit returns the first row instead of posting twice. */
  clientId: string;
  /** 50 peak bars 0..100, computed here from the stored PCM; null on a replay (the first row keeps its own). */
  waveform: number[] | null;
}

export type CommitResult =
  | { kind: 'ok'; message: Record<string, unknown> }
  | { kind: 'forbidden' }
  | { kind: 'unsupported' }
  | { kind: 'rate' };

export type PlaybackTarget = { kind: 'ok'; objectKey: string } | { kind: 'gone' } | { kind: 'forbidden' };

export type SweepSummary = Record<string, number | boolean>;

export interface HandlerDeps {
  corsHeaders: Record<string, string>;
  envReady: boolean;
  /** The shared secret the cron tick sends in x-cron-secret. Empty means "sweep disabled". */
  cronSecret: string;
  getUserId: (token: string) => Promise<string | null>;
  newId: () => string;
  /** Database membership + kind check, acting as `userId` (same rules as send_chat_message). */
  checkPost: (userId: string, conversationId: string) => Promise<PostCheck>;
  /**
   * Upload mode: the same membership + kind check, and a slot in the per-user upload quota, in ONE
   * database call made before anything is signed. 'rate' means the quota is spent. An unlimited
   * signed-PUT dispenser would be a way to fill the bucket with 3.8 MB objects.
   */
  reserveUpload: (userId: string, conversationId: string) => Promise<UploadCheck>;
  signUpload: (objectKey: string) => Promise<{ uploadUrl: string; headers: Record<string, string> }>;
  /** First bytes of the stored object plus its total size; null when it does not exist. A cheap ranged read. */
  readObjectHead: (objectKey: string) => Promise<{ head: Uint8Array; size: number } | null>;
  /** The whole stored object, read ONLY after the header passed; throws if it exceeds MAX_UPLOAD_BYTES. */
  readObject: (objectKey: string) => Promise<Uint8Array | null>;
  /** True when a committed message already references this object (its audio row exists). */
  isKeyCommitted: (objectKey: string) => Promise<boolean>;
  commitMessage: (input: CommitInput) => Promise<CommitResult>;
  playbackTarget: (userId: string, messageId: string) => Promise<PlaybackTarget>;
  signPlayback: (objectKey: string) => Promise<string>;
  /** EdgeRuntime.waitUntil in production: keeps the isolate alive for the transcript job. */
  background: (task: Promise<unknown>) => void;
  transcribeMessage: (messageId: string) => Promise<unknown>;
  sweep: () => Promise<SweepSummary>;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
/** <conversation>/<uploader>/<upload>.wav — the uploader segment is what makes a key one person's. */
const KEY_RE = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.wav$`, 'i');

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const optionalUuid = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : isUuid(v) ? v : undefined;

/** Length-independent comparison so the secret check does not leak a prefix through timing. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!expected || given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function handleChatVoice(req: Request, deps: HandlerDeps): Promise<Response> {
  const { corsHeaders } = deps;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!deps.envReady) return json(500, { error: ERR.internal });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    // A sweep with no/garbled body is still not a user call; both paths below want an object.
    return json(400, { error: ERR.invalidBody });
  }

  const mode = body.mode;

  // ── sweep: the cron secret, never a user JWT ─────────────────────────────
  if (mode === 'sweep') {
    if (!secretMatches(req.headers.get('x-cron-secret'), deps.cronSecret)) {
      return json(401, { error: ERR.unauthorized });
    }
    try {
      return json(200, { ok: true, ...(await deps.sweep()) });
    } catch (err) {
      console.error('chat-voice sweep failed', err instanceof Error ? err.message : 'unknown');
      return json(500, { error: ERR.internal });
    }
  }

  // ── every other mode is a signed-in user ─────────────────────────────────
  const userId = await bearerUserId(req, deps.getUserId);
  if (!userId) return json(401, { error: ERR.unauthorized });

  try {
    if (mode === 'upload') return await upload(body, userId, deps, json);
    if (mode === 'commit') return await commit(body, userId, deps, json);
    if (mode === 'playback') return await playback(body, userId, deps, json);
  } catch (err) {
    // Message only: never the request, never anything that could carry audio or a transcript.
    console.error('chat-voice failed', mode, err instanceof Error ? err.message : 'unknown');
    return json(500, { error: ERR.internal });
  }
  return json(400, { error: ERR.invalidMode });
}

type Json = (status: number, body: unknown) => Response;

function refusal(check: PostCheck, json: Json): Response | null {
  if (check === 'forbidden') return json(403, { error: ERR.notMember });
  if (check === 'unsupported') return json(422, { error: ERR.unsupported });
  return null;
}

async function upload(body: Record<string, unknown>, userId: string, deps: HandlerDeps, json: Json) {
  const conversationId = body.conversationId;
  if (!isUuid(conversationId) || optionalUuid(body.threadRootId) === undefined) {
    return json(400, { error: ERR.invalidId });
  }
  const reserved = await deps.reserveUpload(userId, conversationId);
  if (reserved === 'rate') return json(429, { error: ERR.uploadRate });
  const refused = refusal(reserved, json);
  if (refused) return refused;

  // Server-derived and bound to the caller. The last segment is also the message's client_id at
  // commit, which makes a retried commit idempotent.
  const objectKey = `${conversationId.toLowerCase()}/${userId.toLowerCase()}/${deps.newId().toLowerCase()}.wav`;
  const { uploadUrl, headers } = await deps.signUpload(objectKey);
  return json(200, { uploadUrl, uploadHeaders: headers, objectKey, maxBytes: MAX_UPLOAD_BYTES, expiresInSeconds: UPLOAD_TTL_SECONDS });
}

async function commit(body: Record<string, unknown>, userId: string, deps: HandlerDeps, json: Json) {
  const { conversationId, objectKey } = body;
  const threadRootId = optionalUuid(body.threadRootId);
  const replyToId = optionalUuid(body.replyToId);
  if (!isUuid(conversationId) || threadRootId === undefined || replyToId === undefined) {
    return json(400, { error: ERR.invalidId });
  }
  const keyMatch = typeof objectKey === 'string' ? KEY_RE.exec(objectKey) : null;
  // The prefix must be THIS conversation: a member of two chats cannot commit one chat's upload into the other.
  if (!keyMatch || keyMatch[1].toLowerCase() !== conversationId.toLowerCase()) {
    return json(400, { error: ERR.badKey });
  }
  const key = objectKey as string;

  // A key is one person's. Checked before ANY storage call and before the failure paths below, which
  // delete: without it a member could name a fellow member's object and have the rejection delete it.
  if (keyMatch[2].toLowerCase() !== userId.toLowerCase()) return json(403, { error: ERR.notYours });

  const refused = refusal(await deps.checkPost(userId, conversationId), json);
  if (refused) return refused;

  const commitInput = (durationMs: number, waveform: number[] | null): CommitInput => ({
    userId,
    conversationId,
    objectKey: key,
    durationMs,
    threadRootId,
    replyToId,
    clientId: keyMatch[3].toLowerCase(),
    waveform,
  });
  const failure = (r: Exclude<CommitResult, { kind: 'ok' }>) =>
    r.kind === 'unsupported' ? { status: 422, error: ERR.unsupported }
      : r.kind === 'rate' ? { status: 429, error: ERR.rate }
      : { status: 403, error: ERR.notMember };

  // Already a message: replay it. The database returns the first row (same author, same upload id);
  // the stored object is referenced by that message, so no path from here may delete it.
  if (await deps.isKeyCommitted(key)) {
    const replay = await deps.commitMessage(commitInput(1, null)); // duration and waveform are ignored on a replay
    if (replay.kind !== 'ok') {
      const f = failure(replay);
      return json(f.status, { error: f.error });
    }
    return json(200, { message: replay.message });
  }

  // Cheap ranged header read first: a corrupt or oversized object never costs a full download.
  const stored = await deps.readObjectHead(key);
  if (!stored) return json(404, { error: ERR.notFound });

  // A failed commit NEVER deletes the object. The caller may retry the same key (the upload is
  // create-only, so it cannot have changed), and deleting from here would race a concurrent commit of
  // that key. Strays are bounded by the bucket's 31-day lifecycle rule and are the uploader's own bytes.
  const reject = (status: number, error: string) => json(status, { error });

  const clip = checkStoredClip(stored);
  if (!clip.ok) return clip.reason === 'too_long' ? reject(413, ERR.tooLong) : reject(400, ERR.badAudio);
  const durationMs = clip.durationMs;
  // The header passed and the declared size is within the 2-minute cap: only now the body is read.
  const wav = await deps.readObject(key);
  if (!wav) return json(404, { error: ERR.notFound });
  if (wav.length !== stored.size) return reject(400, ERR.badAudio); // the object changed between the two reads
  // Computed once, here, from the bytes just validated; the database keeps the bars, never the path.
  const waveform = waveformBars(pcmOf(wav));

  const result = await deps.commitMessage(commitInput(durationMs, waveform));
  if (result.kind !== 'ok') {
    const f = failure(result);
    return reject(f.status, f.error);
  }

  const messageId = String(result.message.id);
  deps.background(
    deps.transcribeMessage(messageId).catch((e) =>
      console.error('chat-voice transcription crashed', e instanceof Error ? e.message : 'unknown')
    ),
  );
  return json(200, { message: result.message });
}

async function playback(body: Record<string, unknown>, userId: string, deps: HandlerDeps, json: Json) {
  const { messageId } = body;
  if (!isUuid(messageId)) return json(400, { error: ERR.invalidId });
  const target = await deps.playbackTarget(userId, messageId);
  if (target.kind === 'forbidden') return json(403, { error: ERR.notMember });
  if (target.kind === 'gone') return json(410, { error: ERR.gone });
  return json(200, { url: await deps.signPlayback(target.objectKey), expiresInSeconds: PLAYBACK_TTL_SECONDS });
}
