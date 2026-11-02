/**
 * P1536 section 3c, X9: the canvas mode of chat-voice's `commit` (a voice note in a canvas thread).
 *
 * The stored bytes are validated exactly as for any voice note, then the DATABASE is asked once for the whole canvas send (the draft for a
 * first note, the thread, the message, its run and the audio row, in one transaction) through `commitCanvas`, acting for the user the
 * Bearer token resolved to. Nothing in the request names who that is. Kept out of handler.ts so that file stays under its size limit.
 */
import { checkStoredClip, pcmOf, waveformBars } from './clip.ts';
import { ERR } from './errors.ts';

/** What a voice note in a canvas thread asks of the canvas send (the fields of canvas_workspace_send, minus the text). */
export interface CanvasCommitInput {
  /** The verified caller (the Bearer token), never a body field. */
  userId: string;
  conversationId: string;
  objectKey: string;
  durationMs: number;
  /** The upload key's last segment: a retried commit returns the first result. */
  clientId: string;
  /** 50 peak bars 0..100 computed here from the stored PCM; null on a replay (the first row keeps its own). */
  waveform: number[] | null;
  canvasId: string | null;
  fromVersionId: string | null;
  expectedDraftId: string | null;
  expectedRevision: number | null;
  replace: boolean;
  boxRefs: string[] | null;
}
/** `result` is the database's answer as is: `{status:'ok', message_id, run_id, ..., replayed}` or `{status:'refused', code, revision}`. */
export type CanvasCommitResult =
  | { kind: 'ok'; result: Record<string, unknown> }
  | { kind: 'forbidden' }
  | { kind: 'unsupported' }
  | { kind: 'rate' }
  | { kind: 'invalid' };

export type CanvasFields = Omit<CanvasCommitInput, 'userId' | 'conversationId' | 'objectKey' | 'durationMs' | 'clientId' | 'waveform'>;

/** The part of the handler's dependencies this mode uses (HandlerDeps satisfies it). */
export interface CanvasDeps {
  isKeyCommitted: (objectKey: string) => Promise<boolean>;
  readObjectHead: (objectKey: string) => Promise<{ head: Uint8Array; size: number } | null>;
  readObject: (objectKey: string) => Promise<Uint8Array | null>;
  commitCanvas: (input: CanvasCommitInput) => Promise<CanvasCommitResult>;
  background: (task: Promise<unknown>) => void;
  transcribeMessage: (messageId: string) => Promise<unknown>;
}
type Json = (status: number, body: unknown) => Response;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A uuid, null for absent, undefined for anything else (malformed). */
const idOf = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : typeof v === 'string' && UUID_RE.test(v) ? v : undefined);
const MAX_REFS = 9;

function revisionOf(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : undefined;
}

function refsOf(v: unknown): string[] | null | undefined {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length > MAX_REFS || !v.every((r) => typeof r === 'string' && r.length > 0 && r.length <= 40)) return undefined;
  return v.length ? (v as string[]) : null;
}

/** The canvas fields of a commit, or undefined when any of them is malformed. The database validates what the boxes may be called. */
function parseCanvas(raw: unknown): CanvasFields | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  const canvasId = idOf(c.canvasId);
  const fromVersionId = idOf(c.fromVersionId);
  const expectedDraftId = idOf(c.expectedDraftId);
  const expectedRevision = revisionOf(c.expectedRevision);
  const boxRefs = refsOf(c.boxRefs);
  const replaceOk = c.replace === undefined || typeof c.replace === 'boolean';
  if ([canvasId, fromVersionId, expectedDraftId, expectedRevision, boxRefs].includes(undefined) || !replaceOk) return undefined;
  return {
    canvasId: canvasId as string | null, fromVersionId: fromVersionId as string | null, expectedDraftId: expectedDraftId as string | null,
    expectedRevision: expectedRevision as number | null, replace: c.replace === true, boxRefs: boxRefs as string[] | null,
  };
}

export type CanvasRequest =
  | { kind: 'none' }
  | { kind: 'refused'; status: number; error: string }
  | { kind: 'canvas'; fields: CanvasFields; commitCanvas: CanvasDeps['commitCanvas'] };

/**
 * Is this commit a canvas note, and may it be one? A canvas note has no thread or reply target to name (the database finds the draft's
 * thread), and a deployment without `commitCanvas` refuses it rather than posting a plain note that no run would ever read.
 */
export function canvasRequestOf(
  body: Record<string, unknown>, threadRootId: string | null, replyToId: string | null, commitCanvas: CanvasDeps['commitCanvas'] | undefined,
): CanvasRequest {
  if (body.canvas === undefined) return { kind: 'none' };
  const fields = parseCanvas(body.canvas);
  if (!fields || threadRootId !== null || replyToId !== null) return { kind: 'refused', status: 400, error: ERR.invalidId };
  if (!commitCanvas) return { kind: 'refused', status: 422, error: ERR.unsupported };
  return { kind: 'canvas', fields, commitCanvas };
}

function failure(r: Exclude<CanvasCommitResult, { kind: 'ok' }>, json: Json): Response {
  if (r.kind === 'unsupported') return json(422, { error: ERR.unsupported });
  if (r.kind === 'rate') return json(429, { error: ERR.rate });
  if (r.kind === 'invalid') return json(400, { error: ERR.invalidBody });
  return json(403, { error: ERR.notMember });
}

/**
 * The same stored-bytes checks as a plain note, then one database call that makes the message and its run for `who.userId`. A repeat (the
 * key already has an audio row) goes straight to the database, which returns the first result: nothing is read again and no second
 * transcription starts. A refused send (stale view, busy, cap) is the database's answer, passed on as is, with nothing written.
 */
export async function commitCanvasNote(
  key: string, clientId: string, who: { userId: string; conversationId: string; fields: CanvasFields }, deps: CanvasDeps, json: Json,
): Promise<Response> {
  const send = (durationMs: number, waveform: number[] | null) => deps.commitCanvas({
    userId: who.userId, conversationId: who.conversationId, objectKey: key, durationMs, clientId, waveform, ...who.fields,
  });

  if (await deps.isKeyCommitted(key)) {
    const replay = await send(1, null); // duration and waveform are ignored on a replay
    return replay.kind === 'ok' ? json(200, { canvas: replay.result }) : failure(replay, json);
  }

  const stored = await deps.readObjectHead(key);
  if (!stored) return json(404, { error: ERR.notFound });
  const clip = checkStoredClip(stored);
  if (!clip.ok) return clip.reason === 'too_long' ? json(413, { error: ERR.tooLong }) : json(400, { error: ERR.badAudio });
  const wav = await deps.readObject(key);
  if (!wav) return json(404, { error: ERR.notFound });
  if (wav.length !== stored.size) return json(400, { error: ERR.badAudio }); // the object changed between the two reads

  const sent = await send(clip.durationMs, waveformBars(pcmOf(wav)));
  if (sent.kind !== 'ok') return failure(sent, json);

  const messageId = sent.result.message_id;
  // Only the call that WROTE the note starts its transcription; a refusal wrote nothing, and a repeat's first call already started it.
  if (sent.result.status === 'ok' && sent.result.replayed === false && typeof messageId === 'string') {
    deps.background(
      deps.transcribeMessage(messageId).catch((e) =>
        console.error('chat-voice transcription crashed', e instanceof Error ? e.message : 'unknown')
      ),
    );
  }
  return json(200, { canvas: sent.result });
}
