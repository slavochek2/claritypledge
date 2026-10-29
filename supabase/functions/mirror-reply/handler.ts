/**
 * P1520/P1576: request handler for mirror-reply, separated from the Deno.serve wiring so each gate can
 * be exercised with fakes (handler.test.ts). index.ts owns env, clients and the Gemini call.
 *
 * Two entrances, ONE shared run (`runJob`: begin -> fit -> Gemini -> fail/complete):
 *   user      POST { message_id } with the owner's JWT. mirror_request_reply (as the caller) proves
 *             ownership and returns the one job; a voice note still being transcribed answers 202.
 *   internal  POST { job_id } with header x-mirror-internal (P1576): the database trigger that fires when
 *             a voice note's transcript is done. No user JWT. The job is loaded with the service role,
 *             must be kind 'reply', and runs as its own owner after the same terms gate.
 *
 * Internal mode is refused (401) when MIRROR_INTERNAL_SECRET is the off default, when the header is
 * wrong, and it never falls back to the JWT path: a request that carries the header is internal only.
 *
 * Logging rule (as P1453): status codes and fixed codes only, never a prompt, a message, a reply or a key.
 */
import { TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from '../_shared/terms-gate.ts';
import { MirrorRequestTooLarge, parseReply, type BeginRun, type GeminiRequest } from '../_shared/mirror-agent.ts';

export const INTERNAL_SECRET_OFF = 'not-configured';
export const INTERNAL_HEADER = 'x-mirror-internal';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cors = Record<string, string>;
type RpcResult = { data: unknown; error: { code?: string } | null };

export interface MirrorDeps {
  cors: Cors;
  envReady: boolean;
  enabled: boolean;
  internalSecret: string;
  /** The user's id for a Bearer token, or null. */
  authUser(token: string): Promise<string | null>;
  hasTerms(userId: string): Promise<boolean>;
  /** mirror_request_reply as the caller. */
  requestReply(token: string, messageId: string): Promise<{ job_id: string | null; state: string } | null>;
  /** The job row (service role) for internal mode. */
  loadJob(jobId: string): Promise<{ owner_id: string; kind: string } | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  /** Builds the request that fits the budget (counts tokens); throws MirrorRequestTooLarge. */
  fit(run: BeginRun): Promise<GeminiRequest>;
  /** One Gemini call: status 0 on a network error, `body` only when ok. */
  callModel(request: GeminiRequest): Promise<{ status: number; body: unknown | null }>;
}

function json(body: unknown, status: number, cors: Cors): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/** Constant-time string equality (length is not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** P1576: a voice note is answered only once its transcript exists (user path only). */
function transcriptGate(job: { job_id: string | null; state: string }, cors: Cors): Response | null {
  if (job.state === 'transcribing') return json({ state: 'transcribing' }, 202, cors);
  if (job.state === 'transcript_failed') return json({ state: 'transcript_failed', code: 'TRANSCRIPT_FAILED' }, 409, cors);
  if (!job.job_id) return json({ error: 'Message not available', code: 'NOT_AVAILABLE' }, 404, cors);
  return null;
}

/** No model response: record the failure and its charge, then answer. */
async function failModelCall(d: MirrorDeps, jobId: string, run: BeginRun, httpStatus: number): Promise<Response> {
  // 429 (quota or the key's spend cap) and 403 (key refused) are the provider's cap: "capped".
  // Any 4xx was refused before generating, so it costs nothing; a network error or a 5xx leaves the
  // usage unknown, so the full reservation is charged (the Mira assistant's rule).
  const capped = httpStatus === 429 || httpStatus === 403;
  const refusedUpfront = httpStatus >= 400 && httpStatus < 500;
  if (httpStatus) console.error('mirror-reply: model error', { status: httpStatus });
  await d.rpc('_mirror_fail_job', {
    p_job: jobId,
    p_code: capped ? 'cap' : httpStatus ? `http_${httpStatus}` : 'network',
    p_actual_usd: refusedUpfront ? 0 : run.reserved_usd,
    p_attempt: run.attempt,
  });
  return json({ state: capped ? 'capped' : 'failed', job_id: jobId, code: capped ? 'CAPPED' : 'MODEL_ERROR' }, capped ? 429 : 502, d.cors);
}

/** begin -> fit -> one Gemini call -> complete or fail. Shared by the user and the internal entrance. */
async function runJob(d: MirrorDeps, jobId: string): Promise<Response> {
  const { data: begun, error: beginError } = await d.rpc('_mirror_begin_job', { p_job: jobId });
  if (beginError || !begun) {
    console.error('mirror-reply: begin failed', { code: beginError?.code });
    return json({ error: 'Service temporarily unavailable' }, 503, d.cors);
  }
  const status = (begun as { status: string }).status;
  if (status === 'done') return json({ state: 'done', job_id: jobId }, 200, d.cors);
  if (status === 'capped') return json({ state: 'capped', job_id: jobId, code: 'CAPPED' }, 429, d.cors);
  if (status === 'waiting') return json({ state: 'transcribing' }, 202, d.cors);
  if (status === 'busy') return json({ state: 'running', job_id: jobId }, 202, d.cors);
  if (status !== 'run') return json({ state: status, job_id: jobId }, 409, d.cors);
  const run = begun as BeginRun;

  let request: GeminiRequest;
  try {
    request = await d.fit(run);
  } catch (e) {
    // Refused before any call: released, never charged (P1520 review).
    await d.rpc('_mirror_fail_job', { p_job: jobId, p_code: e instanceof MirrorRequestTooLarge ? 'too_large' : 'build', p_actual_usd: null, p_attempt: run.attempt });
    return json({ state: 'failed', job_id: jobId, code: 'TOO_LARGE' }, 422, d.cors);
  }
  return await callAndSettle(d, jobId, run, request);
}

/** One Gemini call, then complete or fail the job. */
async function callAndSettle(d: MirrorDeps, jobId: string, run: BeginRun, request: GeminiRequest): Promise<Response> {
  const { status: httpStatus, body } = await d.callModel(request);
  if (!body) return await failModelCall(d, jobId, run, httpStatus);

  const outcome = parseReply(body);
  if (!outcome.ok) {
    await d.rpc('_mirror_fail_job', { p_job: jobId, p_code: outcome.code, p_actual_usd: outcome.costUsd ?? run.reserved_usd, p_attempt: run.attempt });
    return json({ state: 'failed', job_id: jobId, code: outcome.code === 'blocked' ? 'BLOCKED' : 'EMPTY' }, 502, d.cors);
  }
  const { data: row, error: completeError } = await d.rpc('_mirror_complete_job', {
    p_job: jobId,
    p_body: outcome.text,
    p_actual_usd: outcome.costUsd ?? run.reserved_usd,
    p_attempt: run.attempt,
  });
  if (completeError) {
    console.error('mirror-reply: complete failed', { code: completeError.code });
    return json({ error: 'Service temporarily unavailable' }, 503, d.cors);
  }
  if (!row) return json({ state: 'cancelled', job_id: jobId }, 409, d.cors);
  console.log('mirror-reply: answered', { kind: run.kind, cost: outcome.costUsd });
  return json({ state: 'done', job_id: jobId, message: row }, 200, d.cors);
}

/** P1576: the database trigger asks for the reply to a voice note whose transcript is done. */
async function handleInternal(req: Request, d: MirrorDeps, header: string): Promise<Response> {
  if (d.internalSecret === INTERNAL_SECRET_OFF || d.internalSecret === '' || !safeEqual(header, d.internalSecret)) {
    return json({ error: 'Unauthorized' }, 401, d.cors);
  }
  let body: { job_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400, d.cors);
  }
  const jobId = typeof body.job_id === 'string' && UUID_RE.test(body.job_id) ? body.job_id : null;
  if (!jobId) return json({ error: 'job_id is required' }, 400, d.cors);
  if (!d.enabled) return json({ error: 'The mirror agent cannot answer yet', code: 'DISABLED' }, 503, d.cors);
  const job = await d.loadJob(jobId);
  if (!job || job.kind !== 'reply') return json({ error: 'Message not available', code: 'NOT_AVAILABLE' }, 404, d.cors);
  if (!(await d.hasTerms(job.owner_id))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS, d.cors);
  return await runJob(d, jobId);
}

async function handleUser(req: Request, d: MirrorDeps): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, d.cors);
  const token = authHeader.slice('Bearer '.length);
  const userId = await d.authUser(token);
  if (!userId) return json({ error: 'Unauthorized' }, 401, d.cors);

  let body: { message_id?: unknown; availability?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400, d.cors);
  }
  // The app asks once per session whether the mirror can answer here, so a project where it is off
  // (prod, until the privacy policy covers it) shows no AI controls and sends no further requests.
  if (body.availability === true) return json({ enabled: d.enabled }, 200, d.cors);
  if (!d.enabled) return json({ error: 'The mirror agent cannot answer yet', code: 'DISABLED' }, 503, d.cors);
  // P1544: no job, no reservation and no model call for a caller who has not accepted the current terms.
  if (!(await d.hasTerms(userId))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS, d.cors);
  const messageId = typeof body.message_id === 'string' && UUID_RE.test(body.message_id) ? body.message_id : null;
  if (!messageId) return json({ error: 'message_id is required' }, 400, d.cors);

  const job = await d.requestReply(token, messageId);
  if (!job) return json({ error: 'Message not available', code: 'NOT_AVAILABLE' }, 404, d.cors);
  // P1576: must stay BEFORE _mirror_begin_job (job_id is null for a voice note still being transcribed).
  const gated = transcriptGate(job, d.cors);
  if (gated) return gated;
  return await runJob(d, job.job_id as string); // transcriptGate refused a null job_id
}

export async function handleMirrorReply(req: Request, d: MirrorDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: d.cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, d.cors);
  if (!d.envReady) return json({ error: 'Service temporarily unavailable' }, 500, d.cors);
  const internal = req.headers.get(INTERNAL_HEADER);
  if (internal !== null) return await handleInternal(req, d, internal);
  return await handleUser(req, d);
}
