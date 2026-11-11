/**
 * P1631: request handler for clarify-draft, separated from the Deno.serve wiring so every gate can be exercised with fakes
 * (src/tests/p1631-clarify-draft-handler.test.ts). index.ts owns env, clients and the model.
 *
 *   POST { availability: true }   -> 200 { enabled }
 *   POST { draft_id }             with the owner's JWT -> the draft is made synchronously and the answer carries its state:
 *     200 { state: 'done' | 'refused', draft_id }        the point is stored / the suggestions are stored
 *     200 { state: 'done' }                              already finished (a repeat call makes no second model call)
 *     202 { state: 'running' | 'queued' }                 another call is making it, or the context was locked: ask again
 *     429 { state: 'capped' }                             a spend cap or the provider's cap
 *     502 { state: 'failed', code }                       the draft is failed and says why; Retry makes a new run
 *     404 NOT_AVAILABLE | 409 TERMS_NOT_ACCEPTED | 503 DISABLED | 401 | 400
 *
 * Gate order: method, env, auth, body, availability, enabled, terms (P1544), the draft is the caller's, begin (reserves the spend), model, complete.
 * After begin, ANY failure records `_clarify_fail`: the model never ran -> the reservation is released; it may have run -> charged in full.
 * Logging: fixed codes only, never a row, a statement or a key.
 */

import { TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from '../_shared/terms-gate.ts';
import type { GeminiRequest } from '../_shared/mirror-agent.ts';
import { buildClarifyRequest, parseClarifyResponse, type ClarifyCaller, type ClarifyRun } from './clarify-model.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Cors = Record<string, string>;
type RpcResult = { data: unknown; error: { code?: string } | null };

export interface ClarifyDeps {
  cors: Cors;
  envReady: boolean;
  enabled: boolean;
  /** The user's id for a Bearer token, or null. */
  authUser(token: string): Promise<string | null>;
  hasTerms(userId: string): Promise<boolean>;
  /** The draft row (service role): who owns it. */
  loadDraft(draftId: string): Promise<{ owner_id: string } | null>;
  /** The service-role worker functions. */
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  callModel: ClarifyCaller;
  /** Waits between begin attempts that met lock contention (tests pass a spy; the default is a real timer). */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter source for the begin backoff, in [0, 1) (tests pass a fixed value; the default is Math.random). */
  random?: () => number;
  /** Overrides for the request builder (tests). */
  system?: string;
  inputLimit?: number;
}

function json(body: unknown, status: number, cors: Cors): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

/** Record a failure: p_usd null releases the reservation (the model never ran), a number charges it. */
async function failRun(d: ClarifyDeps, draftId: string, code: string, usd: number | null, token: string | null): Promise<void> {
  try {
    const { error } = await d.rpc('_clarify_fail', { p_draft: draftId, p_code: code, p_usd: usd, p_run: token });
    if (error) console.error('clarify-draft: fail record failed', { code: error.code });
  } catch (e) {
    console.error('clarify-draft: fail record threw', { error: (e as Error).name });
  }
}

type Outcome = ReturnType<typeof parseClarifyResponse>;
type GoodOutcome = Extract<Outcome, { ok: true }>;
type BadOutcome = Extract<Outcome, { ok: false }>;

const failedBody = (draftId: string, code: string) => ({ state: 'failed', draft_id: draftId, code });
const GONE_BODY = { error: 'Draft not available', code: 'GONE' };

/** The answer for a begin status that makes no model call, or null when this call should run the model. */
function beginAnswer(d: ClarifyDeps, draftId: string, status: string): Response | null {
  if (status === 'run') return null;
  const fixed: Record<string, [unknown, number]> = {
    done: [{ state: status, draft_id: draftId }, 200],
    refused: [{ state: status, draft_id: draftId }, 200],
    capped: [{ state: 'capped', draft_id: draftId, code: 'CAPPED' }, 429],
    busy: [{ state: 'running', draft_id: draftId }, 202],
    gone: [GONE_BODY, 409],
    failed: [failedBody(draftId, 'ABANDONED'), 502],
  };
  const [body, code] = fixed[status] ?? [{ state: status, draft_id: draftId }, 409];
  return json(body, code, d.cors);
}

/** Build the model request; a failure here releases the reservation (the model never ran). */
async function buildOrFail(d: ClarifyDeps, draftId: string, begunRun: ClarifyRun): Promise<{ request: GeminiRequest } | { response: Response }> {
  try {
    const built = buildClarifyRequest(begunRun, { system: d.system, limit: d.inputLimit });
    if (built) return { request: built.request };
    await failRun(d, draftId, 'too_large', null, begunRun.run_token);
    return { response: json(failedBody(draftId, 'TOO_LARGE'), 422, d.cors) };
  } catch (e) {
    console.error('clarify-draft: build failed', { error: (e as Error).name });
    await failRun(d, draftId, 'build', null, begunRun.run_token);
    return { response: json(failedBody(draftId, 'BUILD'), 500, d.cors) };
  }
}

/** The model answered with no body. */
async function modelFailed(d: ClarifyDeps, draftId: string, begunRun: ClarifyRun, httpStatus: number): Promise<Response> {
  // 429 (quota or the key's spend cap) and 403 (key refused) are the provider's cap. Any other 4xx was refused before generating and costs nothing;
  // a network error or a 5xx leaves the usage unknown, so the full reservation is charged.
  const capped = httpStatus === 429 || httpStatus === 403;
  const refusedUpfront = httpStatus >= 400 && httpStatus < 500;
  if (httpStatus) console.error('clarify-draft: model error', { status: httpStatus });
  await failRun(d, draftId, capped ? 'cap' : httpStatus ? `http_${httpStatus}` : 'network', refusedUpfront ? 0 : begunRun.reserved_usd, begunRun.run_token);
  return json({ state: capped ? 'capped' : 'failed', draft_id: draftId, code: capped ? 'CAPPED' : 'MODEL_ERROR' }, capped ? 429 : 502, d.cors);
}

/** The body came back but is not a usable answer. */
async function outputRejected(d: ClarifyDeps, draftId: string, begunRun: ClarifyRun, outcome: BadOutcome): Promise<Response> {
  await failRun(d, draftId, outcome.code, outcome.costUsd ?? begunRun.reserved_usd, begunRun.run_token);
  const codes: Record<string, string> = { blocked: 'BLOCKED', empty: 'EMPTY' };
  return json(failedBody(draftId, codes[outcome.code] ?? 'BAD_OUTPUT'), 502, d.cors);
}

/** Store the answer and say what state the draft ended in. */
async function storeAnswer(d: ClarifyDeps, draftId: string, begunRun: ClarifyRun, outcome: GoodOutcome): Promise<Response> {
  const usd = outcome.costUsd ?? begunRun.reserved_usd;
  const { data: done, error: completeError } = await d.rpc('_clarify_complete', { p_draft: draftId, p_result: outcome.result, p_usd: usd, p_run: begunRun.run_token });
  if (completeError || !done) {
    console.error('clarify-draft: complete failed', { code: completeError?.code });
    await failRun(d, draftId, 'complete', usd, begunRun.run_token);
    return json(failedBody(draftId, 'MODEL_ERROR'), 502, d.cors);
  }
  const result = done as { status: string; code?: string };
  if (result.status === 'gone') return json(GONE_BODY, 409, d.cors);
  if (result.status === 'failed') return json(failedBody(draftId, 'BAD_OUTPUT'), 502, d.cors);
  console.log('clarify-draft: answered', { state: result.status, cost: outcome.costUsd });
  return json({ state: result.status, draft_id: draftId }, 200, d.cors);
}

async function callAndStore(d: ClarifyDeps, draftId: string, begunRun: ClarifyRun, request: GeminiRequest): Promise<Response> {
  try {
    const { status: httpStatus, body } = await d.callModel(request);
    if (!body) return await modelFailed(d, draftId, begunRun, httpStatus);
    const outcome = parseClarifyResponse(body);
    if (!outcome.ok) return await outputRejected(d, draftId, begunRun, outcome);
    return await storeAnswer(d, draftId, begunRun, outcome);
  } catch (e) {
    console.error('clarify-draft: run threw', { error: (e as Error).name });
    // the model may have been called: charge the reservation
    await failRun(d, draftId, 'error', begunRun.reserved_usd, begunRun.run_token);
    return json(failedBody(draftId, 'MODEL_ERROR'), 502, d.cors);
  }
}

/** begin makes up to this many attempts when it meets lock contention (an erase or an edit holds a row it needs), pausing between them. */
const BEGIN_ATTEMPTS = 3;
const BEGIN_BACKOFF_MS = [250, 750];

async function beginWithRetry(d: ClarifyDeps, draftId: string): Promise<RpcResult> {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((go) => setTimeout(go, ms)));
  let result = await d.rpc('_clarify_begin', { p_draft: draftId });
  for (let attempt = 1; attempt < BEGIN_ATTEMPTS; attempt += 1) {
    const b = result.data as { status?: string; reason?: string } | null;
    if (result.error || b?.status !== 'busy' || b.reason !== 'locked') break;
    // jitter: each wait is the base scaled by 0.5..1.5, so callers that collided do not retry in step
    await sleep(Math.round((BEGIN_BACKOFF_MS[attempt - 1] ?? 750) * (0.5 + (d.random ?? Math.random)())));
    result = await d.rpc('_clarify_begin', { p_draft: draftId });
  }
  return result;
}

async function run(d: ClarifyDeps, draftId: string): Promise<Response> {
  const { data: begun, error: beginError } = await beginWithRetry(d, draftId);
  if (beginError || !begun) {
    console.error('clarify-draft: begin failed', { code: beginError?.code });
    return json({ error: 'Service temporarily unavailable' }, 503, d.cors);
  }
  const early = beginAnswer(d, draftId, (begun as { status: string }).status);
  if (early) return early;
  const begunRun = begun as ClarifyRun;

  // From here the spend is reserved: nothing below may leave without recording the outcome.
  const built = await buildOrFail(d, draftId, begunRun);
  if ('response' in built) return built.response;
  return await callAndStore(d, draftId, begunRun, built.request);
}

export async function handleClarifyDraft(req: Request, d: ClarifyDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: d.cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, d.cors);
  if (!d.envReady) return json({ error: 'Service temporarily unavailable' }, 500, d.cors);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, d.cors);
  const userId = await d.authUser(authHeader.slice('Bearer '.length));
  if (!userId) return json({ error: 'Unauthorized' }, 401, d.cors);

  let body: { draft_id?: unknown; availability?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400, d.cors);
  }
  if (body.availability === true) return json({ enabled: d.enabled }, 200, d.cors);
  if (!d.enabled) return json({ error: 'Drafting is not available yet', code: 'DISABLED' }, 503, d.cors);
  // P1544: no reservation and no model call for a caller who has not accepted the current terms.
  if (!(await d.hasTerms(userId))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS, d.cors);
  const draftId = typeof body.draft_id === 'string' && UUID_RE.test(body.draft_id) ? body.draft_id : null;
  if (!draftId) return json({ error: 'draft_id is required', code: 'BAD_REQUEST' }, 400, d.cors);
  const draft = await d.loadDraft(draftId);
  // one answer for "no such draft" and "not yours", so ids cannot be probed
  if (!draft || draft.owner_id !== userId) return json({ error: 'Draft not available', code: 'NOT_AVAILABLE' }, 404, d.cors);
  return await run(d, draftId);
}
