/**
 * P1536: the two requests the canvas-draft function serves after its gates, both by RUN ID (Design v6): a run made by a user
 * RPC (`canvas_workspace_send`, a retry, a focus switch, a fork) is begun here, and the work runs after the response. The
 * runtime wiring (auth, the gates, the clients, the edge runtime) is canvas-draft/index.ts; everything here takes its seams as
 * arguments, so it carries no Deno or esm.sh import.
 *
 * Gate order inside each handler, pinned by src/tests/p1536-canvas-draft.test.ts:
 *   run:     the run id, then the run's begin (which proves the run is the caller's, checks its input is ready and
 *            reserves the spend), then the work after the response, then 202. A second call on a running run begins nothing.
 *   upload:  the declared size, then the form, then the begin (claim FIRST), then the file's size and type, then the one
 *            extraction call, then the material written for the running run, then the work after the response.
 *            A failure after the claim fails the run in the same invocation, so the draft never waits for a lease.
 *
 * Uploaded bytes are decoded or extracted in memory and never stored; only the text is kept.
 */

import { costUsd, type GeminiUsage } from './mirror-agent.ts';
import {
  MAX_STORED_TEXT_CHARS, MAX_UPLOAD_BYTES, classifyUpload, cleanLabel, decodeUploadText, uploadLengthRefusal,
} from './canvas-material.ts';
import { buildExtractRequest, extractedText, type ModelCaller } from './canvas-model.ts';
import { RUN_DEADLINE_MS, makeDeadline } from './canvas-deadline.ts';
import { WORDS } from './canvas-reply-table.ts';
import { postFailReply } from './canvas-nothing.ts';
import { executeRun, failRun, type CanvasRun, type MaterialRow, type RpcResult, type RunDeps } from './canvas-run.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What one extraction call is reserved at (`extract_max_usd`): charged when the model reports no usage. */
export const EXTRACT_MAX_USD = 0.35;
/** Posted in the thread when the daily cap stops a run. [FOUNDER DECISION: wording] */
export const CAP_REPLY = 'I have reached my daily limit for canvas updates, so nothing was changed. Please try again tomorrow.';

export interface DraftService {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
}
export interface HandlerCtx {
  service: DraftService;
  userId: string;
  model: ModelCaller;
  cors: Record<string, string>;
  readLink: RunDeps['readLink'];
  /** The model's token counter for the run's request bound (absent: the byte bound). */
  count?: RunDeps['count'];
  /** The run's deadline in ms (default RUN_DEADLINE_MS); a test sets a short one. */
  deadlineMs?: number;
  /** Hands work to the edge runtime so the response can go first. */
  afterResponse: (work: Promise<unknown>) => void;
}

const respond = (c: HandlerCtx, body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...c.cors } });
const unavailable = (c: HandlerCtx) => respond(c, { error: 'Service temporarily unavailable' }, 503);
const badRequest = (c: HandlerCtx, error: string) => respond(c, { error, code: 'BAD_REQUEST' }, 400);

type Begin = { status: string; run_id?: string; reason?: string; state?: string; error_code?: string } & Omit<Partial<CanvasRun>, 'status'>;

/** What a begin that did not start a run means for the caller. The run row is the caller's own (begin proves it), or it is `gone`. */
function refuseBegin(c: HandlerCtx, b: Begin, runId: string): Response {
  if (b.status === 'running') return respond(c, { state: 'running', run_id: runId }, 202); // a second invoke: no second model call
  if (b.status === 'not_ready') return respond(c, { state: 'queued', error: 'The input is not ready yet', code: 'NOT_READY', reason: b.reason ?? null }, 409);
  if (b.status === 'busy') return respond(c, { error: 'Try again in a moment', code: 'BUSY' }, 409);
  if (b.status === 'capped') return respond(c, { state: 'capped', error: 'The spending limit is reached', code: 'CAPPED' }, 429);
  return respond(c, { state: b.state ?? null, error: 'This update is no longer running', code: 'GONE', error_code: b.error_code ?? null }, 409);
}

async function beginRun(c: HandlerCtx, runId: string, hasFile: boolean): Promise<{ begin: Begin } | { refuse: Response }> {
  const { data, error } = await c.service.rpc('_canvas_draft_run_begin', { p_run: runId, p_owner: c.userId, p_has_file: hasFile, p_cap_reply: CAP_REPLY });
  const begin = data as Begin | null;
  if (error || !begin) {
    console.error('canvas-draft: begin failed', { code: (error as { code?: string } | null)?.code });
    return { refuse: unavailable(c) };
  }
  if (begin.status !== 'run' || !begin.run_id) {
    // P1653: the database failed a voice note's run for want of a transcript without a word; the thread gets the approved one (posted once, only on an open draft)
    if (begin.error_code === 'transcript_failed') await postFailReply(c.service.rpc, runId, c.userId, WORDS.transcriptFailed);
    return { refuse: refuseBegin(c, begin, runId) };
  }
  return { begin };
}

function runOf(begin: Begin, material?: MaterialRow[]): CanvasRun {
  return {
    ...(begin as CanvasRun),
    draft_points: begin.draft_points ?? [], material: material ?? begin.material ?? [], thread: begin.thread ?? [], other_names: begin.other_names ?? [],
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** What an extraction call is charged: the reported usage, else its reservation; a refused request costs nothing. */
function extractUsd(response: unknown, status: number): number {
  if (response) return costUsd((response as { usageMetadata?: GeminiUsage }).usageMetadata) ?? EXTRACT_MAX_USD;
  return status >= 400 && status < 500 ? 0 : EXTRACT_MAX_USD;
}

/** Ends the claimed run with a reason and answers the caller with the matching refusal. */
/** P1653: one approved sentence per cause of a failed upload (the reply names what failed and what to do; it used to be one sentence for all of them). */
const UPLOAD_WORDS: Record<string, string> = {
  unsupported: WORDS.unsupported, unreadable: WORDS.unreadable, too_large: WORDS.fileTooLarge, timeout: WORDS.fileTimeout, capped: WORDS.fileCapped,
  model_error: WORDS.fileModelError, limit: WORDS.fileLimit, write: WORDS.fileWrite, denied: WORDS.fileDenied, internal: WORDS.fileInternal,
};
async function failUpload(c: HandlerCtx, runId: string, code: string, label: string, usd: number, answer: { error: string; code: string; status: number }): Promise<Response> {
  await failRun(c.service, { run_id: runId }, { ownerId: c.userId }, code, UPLOAD_WORDS[code] ?? WORDS.fileInternal, usd);
  return respond(c, { error: answer.error, code: answer.code, label }, answer.status);
}

/** The text of the file, with the usd its extraction cost; or the run's failure. */
async function readUploadText(c: HandlerCtx, runId: string, file: File, label: string, signal: AbortSignal, spent: { usd: number }): Promise<{ text: string; usd: number } | { refuse: Response }> {
  const kind = classifyUpload(file.name, file.type);
  if (kind.kind === 'unsupported') return { refuse: await failUpload(c, runId, 'unsupported', label, 0, { error: 'That file type is not supported', code: 'UNSUPPORTED', status: 415 }) };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind.kind === 'text') {
    const text = decodeUploadText(bytes);
    return text ? { text, usd: 0 } : { refuse: await failUpload(c, runId, 'unreadable', label, 0, { error: 'Nothing readable in that file', code: 'UNREADABLE', status: 422 }) };
  }
  spent.usd = EXTRACT_MAX_USD; // the call is about to be out: until its cost is known, a crash settles the extraction at its reservation
  const { response, status } = await c.model({ kind: 'extract', request: buildExtractRequest(kind.mime, toBase64(bytes)), signal });
  const usd = extractUsd(response, status);
  spent.usd = usd;
  const text = response ? extractedText(response)?.slice(0, MAX_STORED_TEXT_CHARS) ?? null : null;
  if (text) return { text, usd };
  const capped = status === 429 || status === 403;
  // The deadline cut the call: it was sent, so it may have been billed. It is settled at the extraction's reservation (extractUsd: no response, no 4xx).
  if (!response && signal.aborted) return { refuse: await failUpload(c, runId, 'timeout', label, usd, { error: 'That took too long', code: 'TIMEOUT', status: 504 }) };
  // P1653: a provider limit is READING_LIMITED (not the owner's daily limit, CAPPED), and a failed reading service is READING_FAILED (not the file's fault, UNREADABLE)
  const answer = capped ? { error: 'I could not read that file', code: 'READING_LIMITED', status: 429 }
    : response ? { error: 'I could not read that file', code: 'UNREADABLE', status: 422 } : { error: 'I could not read that file', code: 'READING_FAILED', status: 502 };
  return { refuse: await failUpload(c, runId, response ? 'unreadable' : capped ? 'capped' : 'model_error', label, usd, answer) };
}

/** The material function's own answer to a kept file: the run's material now, or the reason it was refused. */
async function keepUpload(c: HandlerCtx, runId: string, label: string, text: string, usd: number): Promise<{ material: MaterialRow[] } | { refuse: Response }> {
  const { data, error } = await c.service.rpc('_canvas_draft_add_material', { p_run: runId, p_owner: c.userId, p_kind: 'file', p_label: label, p_text: text });
  const kept = data as { status?: string; material?: MaterialRow[] } | null;
  if (error || !kept) {
    // The write did not land and the run is still running: end it, paying for the extraction already made.
    return { refuse: await failUpload(c, runId, 'write', label, usd, { error: 'Service temporarily unavailable', code: 'UNAVAILABLE', status: 503 }) };
  }
  if (kept.status === 'ok') return { material: kept.material ?? [] };
  if (kept.status === 'gone') return { refuse: respond(c, { error: 'This update is no longer running', code: 'GONE' }, 409) }; // a late write touches nothing
  if (kept.status === 'limit') return { refuse: await failUpload(c, runId, 'limit', label, usd, { error: 'This draft has the most files it can hold', code: 'LIMIT', status: 409 }) };
  return { refuse: await failUpload(c, runId, 'denied', label, usd, { error: 'Not available', code: 'NOT_AVAILABLE', status: 404 }) };
}

type Deadline = ReturnType<typeof makeDeadline> & { handedOver: boolean };
const startDeadline = (c: HandlerCtx): Deadline => ({ ...makeDeadline(c.deadlineMs ?? RUN_DEADLINE_MS), handedOver: false });

/** The draft after the response, under the invocation's deadline; the deadline's timer ends with it. */
function draftLater(c: HandlerCtx, dl: Deadline, run: CanvasRun, extraUsd?: number): void {
  dl.handedOver = true;
  c.afterResponse(executeRun({ rpc: c.service.rpc, model: c.model, readLink: c.readLink, count: c.count, signal: dl.signal }, { ownerId: c.userId, extraUsd }, run).finally(dl.cancel));
}

/** upload: claim the run, then a file becomes text kept for it, then the draft runs after the response. */
export async function handleUpload(c: HandlerCtx, req: Request): Promise<Response> {
  const lengthRefusal = uploadLengthRefusal(req.headers.get('content-length'));
  if (lengthRefusal === 'missing') return respond(c, { error: 'Content-Length required', code: 'BAD_REQUEST' }, 411);
  if (lengthRefusal === 'too_large') return respond(c, { error: 'File too large', code: 'TOO_LARGE' }, 413);
  const dl = startDeadline(c);
  try {
    let form: FormData;
    try { form = await req.formData(); } catch { return badRequest(c, 'Invalid request body'); }
    const runId = form.get('run_id');
    const file = form.get('file');
    if (typeof runId !== 'string' || !UUID_RE.test(runId) || !(file instanceof File)) return badRequest(c, 'run_id and file are required');
    const claimed = await beginRun(c, runId, true);
    if ('refuse' in claimed) return claimed.refuse;
    const spent = { usd: 0 };
    try {
      return await readAndDraft(c, dl, claimed.begin, runId, file, spent);
    } catch (e) {
      // Every way out after the claim ends the run: a throw (an unreadable body, a failing model call) must not leave it running with its spend reserved.
      console.error('canvas-draft: upload crashed', { error: (e as Error).name });
      await failRun(c.service, { run_id: runId }, { ownerId: c.userId }, 'internal', WORDS.fileInternal, spent.usd); // what was actually spent: nothing before the extraction call, its cost after
      return unavailable(c);
    }
  } finally {
    if (!dl.handedOver) dl.cancel();
  }
}

/** After the claim: the size, the text, the kept material, then the draft after the response. */
async function readAndDraft(c: HandlerCtx, dl: Deadline, begin: Begin, runId: string, file: File, spent: { usd: number }): Promise<Response> {
  const label = cleanLabel(file.name);
  if (file.size > MAX_UPLOAD_BYTES) return await failUpload(c, runId, 'too_large', label, 0, { error: 'File too large', code: 'TOO_LARGE', status: 413 });
  const read = await readUploadText(c, runId, file, label, dl.signal, spent);
  if ('refuse' in read) return read.refuse;
  const kept = await keepUpload(c, runId, label, read.text, read.usd);
  if ('refuse' in kept) return kept.refuse;
  const run = runOf(begin, kept.material);
  draftLater(c, dl, run, read.usd);
  return respond(c, { state: 'running', run_id: run.run_id, label, chars: read.text.length }, 202);
}

/** run: 202 now, the work after the response. */
export async function handleRun(c: HandlerCtx, body: Record<string, unknown>): Promise<Response> {
  const runId = typeof body.run_id === 'string' && UUID_RE.test(body.run_id) ? body.run_id : null;
  if (!runId) return badRequest(c, 'run_id is required');
  const dl = startDeadline(c);
  const started = await beginRun(c, runId, false);
  if ('refuse' in started) { dl.cancel(); return started.refuse; }
  const run = runOf(started.begin);
  draftLater(c, dl, run);
  return respond(c, { state: 'running', run_id: run.run_id, kind: run.kind ?? 'message' }, 202);
}
