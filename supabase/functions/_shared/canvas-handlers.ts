/**
 * P1536: the two requests the canvas-draft function serves after its gates: an upload (a file becomes text)
 * and a run (202 now, the work after the response). The runtime wiring (auth, the gates, the clients, the
 * edge runtime) is canvas-draft/index.ts; everything here takes its seams as arguments, so it carries no
 * Deno or esm.sh import.
 *
 * Gate order inside each handler, pinned by src/tests/p1536-canvas-draft.test.ts:
 *   upload: size, then the form, then ownership of an open draft, then the file type, then an `extract` run
 *           (which reserves the spend) before the one model call.
 *   run:    ownership of an open draft, then the run's begin (which reserves the spend), then the work
 *           after the response, then 202. Every run is a draft run at the fast speed (no tensions pass).
 *
 * Uploaded bytes are decoded or extracted in memory and never stored; only the text is kept.
 */

import { costUsd, type GeminiUsage } from './mirror-agent.ts';
import {
  MAX_STORED_TEXT_CHARS, MAX_UPLOAD_BYTES, classifyUpload, cleanLabel, decodeUploadText, uploadLengthRefusal,
} from './canvas-material.ts';
import { buildExtractRequest, extractedText, type ModelCaller } from './canvas-model.ts';
import { executeRun, type CanvasRun, type RpcResult, type RunDeps, type RunKind } from './canvas-run.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Form overhead allowed on top of the file before the body is refused unread. */

export interface DraftRow { owner_id: string; state: string }
export interface DraftService {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** The draft row, read with the service role. */
  readDraft: (id: string) => Promise<{ data: DraftRow | null; error: unknown }>;
}
export interface HandlerCtx {
  service: DraftService;
  userId: string;
  model: ModelCaller;
  cors: Record<string, string>;
  readLink: RunDeps['readLink'];
  /** The model's token counter for the run's request bound (absent: the byte bound). */
  count?: RunDeps['count'];
  /** Hands work to the edge runtime so the response can go first. */
  afterResponse: (work: Promise<unknown>) => void;
}

const respond = (c: HandlerCtx, body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...c.cors } });
const unavailable = (c: HandlerCtx) => respond(c, { error: 'Service temporarily unavailable' }, 503);
const notAvailable = (c: HandlerCtx) => respond(c, { error: 'Not available', code: 'NOT_AVAILABLE' }, 404);
const badRequest = (c: HandlerCtx, error: string) => respond(c, { error, code: 'BAD_REQUEST' }, 400);

/** The caller's own open draft, or the refusal to send. The id comes from the verified JWT, never the body. */
async function ownDraft(c: HandlerCtx, draftId: string): Promise<{ draft: DraftRow } | { refuse: Response }> {
  const { data, error } = await c.service.readDraft(draftId);
  if (error) return { refuse: unavailable(c) };
  if (!data || data.owner_id !== c.userId) return { refuse: notAvailable(c) };
  if (data.state !== 'open') return { refuse: respond(c, { error: 'This draft is closed', code: 'DRAFT_CLOSED' }, 409) };
  return { draft: data };
}

/** What a refused begin means for the caller. */
function refuseBegin(c: HandlerCtx, status: string): Response {
  if (status === 'busy') return respond(c, { state: 'running', error: 'A run is already going', code: 'BUSY' }, 409);
  if (status === 'capped') return respond(c, { state: 'capped', error: 'The spending limit is reached', code: 'CAPPED' }, 429);
  if (status === 'cap_reached') return respond(c, { state: 'capped', error: 'This draft has reached its revision limit', code: 'REVISION_CAP' }, 429);
  return notAvailable(c);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The material function's own answer to a kept file. */
function keptAnswer(c: HandlerCtx, kept: unknown, label: string, chars: number): Response {
  const status = (kept as { status?: string } | null)?.status;
  if (!kept) return unavailable(c);
  if (status === 'limit') return respond(c, { error: 'This draft has the most files it can hold', code: 'LIMIT', label }, 409);
  if (status === 'denied') return notAvailable(c);
  return respond(c, { state: 'added', label, chars }, 200);
}

async function uploadText(c: HandlerCtx, draftId: string, label: string, bytes: Uint8Array): Promise<Response> {
  const text = decodeUploadText(bytes);
  if (!text) return respond(c, { error: 'Nothing readable in that file', code: 'UNREADABLE', label }, 422);
  const { data, error } = await c.service.rpc('_canvas_draft_add_material', { p_owner: c.userId, p_draft: draftId, p_kind: 'file', p_label: label, p_text: text });
  return error ? unavailable(c) : keptAnswer(c, data, label, text.length);
}

/** What an extraction call is charged: the reported usage, else the reservation; a refused request costs nothing. */
function extractUsd(response: unknown, status: number, reserved: number | null): number | null {
  if (response) return costUsd((response as { usageMetadata?: GeminiUsage }).usageMetadata) ?? reserved;
  return status >= 400 && status < 500 ? 0 : reserved;
}

/** The extraction produced no text: end the run and say why. */
async function extractFailed(c: HandlerCtx, runId: string, label: string, hadResponse: boolean, status: number, usd: number | null): Promise<Response> {
  const capped = status === 429 || status === 403;
  const code = hadResponse ? 'unreadable' : capped ? 'capped' : 'model_error';
  await c.service.rpc('_canvas_draft_run_fail', { p_run: runId, p_code: code, p_reply: null, p_actual_usd: usd });
  return respond(c, { error: 'I could not read that file', code: capped ? 'CAPPED' : 'UNREADABLE', label }, capped ? 429 : 422);
}

/** One extraction call under its own spend reservation (an 'extract' run). */
async function uploadExtract(c: HandlerCtx, draftId: string, label: string, mime: string, bytes: Uint8Array): Promise<Response> {
  const { data: begun, error: beginError } = await c.service.rpc('_canvas_draft_run_begin', { p_owner: c.userId, p_draft: draftId, p_kind: 'extract', p_speed: 'fast' });
  const begin = begun as { status: string; run_id?: string; reserved_usd?: number | null } | null;
  if (beginError || !begin) return unavailable(c);
  if (begin.status !== 'run' || !begin.run_id) return refuseBegin(c, begin.status);
  const { response, status } = await c.model({ kind: 'extract', request: buildExtractRequest(mime, toBase64(bytes)) });
  const text = response ? extractedText(response)?.slice(0, MAX_STORED_TEXT_CHARS) ?? null : null;
  const usd = extractUsd(response, status, begin.reserved_usd ?? null);
  if (!text) return await extractFailed(c, begin.run_id, label, Boolean(response), status, usd);
  const { data: kept, error } = await c.service.rpc('_canvas_draft_extract_complete', {
    p_run: begin.run_id, p_owner: c.userId, p_draft: draftId, p_label: label, p_text: text, p_usd: usd,
  });
  return error ? unavailable(c) : keptAnswer(c, kept, label, text.length);
}

/** upload: a file becomes text; the bytes are never stored. */
export async function handleUpload(c: HandlerCtx, req: Request): Promise<Response> {
  const lengthRefusal = uploadLengthRefusal(req.headers.get('content-length'));
  if (lengthRefusal === 'missing') return respond(c, { error: 'Content-Length required', code: 'BAD_REQUEST' }, 411);
  if (lengthRefusal === 'too_large') return respond(c, { error: 'File too large', code: 'TOO_LARGE' }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return badRequest(c, 'Invalid request body'); }
  const draftId = form.get('draft_id');
  const file = form.get('file');
  if (typeof draftId !== 'string' || !UUID_RE.test(draftId) || !(file instanceof File)) return badRequest(c, 'draft_id and file are required');
  if (file.size > MAX_UPLOAD_BYTES) return respond(c, { error: 'File too large', code: 'TOO_LARGE' }, 413);
  const own = await ownDraft(c, draftId);
  if ('refuse' in own) return own.refuse;
  const label = cleanLabel(file.name);
  const kind = classifyUpload(file.name, file.type);
  if (kind.kind === 'unsupported') return respond(c, { error: 'That file type is not supported', code: 'UNSUPPORTED', label }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return kind.kind === 'text' ? await uploadText(c, draftId, label, bytes) : await uploadExtract(c, draftId, label, kind.mime, bytes);
}

/** run: 202 now, the work after the response. */
export async function handleRun(c: HandlerCtx, body: Record<string, unknown>): Promise<Response> {
  const draftId = typeof body.draft_id === 'string' && UUID_RE.test(body.draft_id) ? body.draft_id : null;
  // One speed is offered: every run drafts straight away. A client that still says 'slow' (an old tab) is treated as
  // 'fast' rather than refused: it gets the draft, with "What I decided on my own", never a tensions pass. `phase`
  // is not read at all, so { phase: 'tensions' } cannot start one either.
  if (!draftId || (body.speed !== 'fast' && body.speed !== 'slow')) return badRequest(c, 'draft_id and speed are required');
  const own = await ownDraft(c, draftId);
  if ('refuse' in own) return own.refuse;
  const kind: RunKind = 'draft';

  const { data: begun, error } = await c.service.rpc('_canvas_draft_run_begin', { p_owner: c.userId, p_draft: draftId, p_kind: kind, p_speed: 'fast' });
  const begin = begun as ({ status: string; run_id?: string } & Partial<CanvasRun>) | null;
  if (error || !begin) {
    console.error('canvas-draft: begin failed', { code: (error as { code?: string } | null)?.code });
    return unavailable(c);
  }
  if (begin.status !== 'run' || !begin.run_id) return refuseBegin(c, begin.status);
  const run: CanvasRun = {
    ...(begin as CanvasRun),
    base_points: begin.base_points ?? [], material: begin.material ?? [], thread: begin.thread ?? [], other_names: begin.other_names ?? [],
  };
  c.afterResponse(executeRun({ rpc: c.service.rpc, model: c.model, readLink: c.readLink, count: c.count }, { ownerId: c.userId, draftId, kind }, run));
  return respond(c, { state: 'running', run_id: run.run_id, kind }, 202);
}
