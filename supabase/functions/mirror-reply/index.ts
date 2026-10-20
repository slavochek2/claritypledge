/**
 * P1520: the mirror answers one of its owner's messages — in the mirror chat, or privately for an
 * @mirror ask made in a channel.
 *
 * POST { message_id }  with the owner's JWT. The message must be the caller's own, in their own mirror
 * (a plain message, a Clarify copy, or an ask created by the mirror_ask RPC).
 *
 * Flow: mirror_request_reply (as the caller: proves ownership, creates or returns the one job for this
 * message) → _mirror_begin_job (service role: locks and reads the bounded context, reserves the spend,
 * marks it running) → one Gemini call → _mirror_complete_job (writes the agent row, settles the spend).
 * The reply reaches the client through Realtime like any message; the response also carries it.
 *
 * OFF unless MIRROR_AI_ENABLED is "true" and the mirror's own key is set. Both are set on the test
 * project only: no AI call may run on prod until the privacy policy covers sending other people's
 * messages to the model (founder, 2026-10-20). Both have explicit "off" defaults so the deploy-time
 * secrets check does not treat them as required on a project where the feature is off.
 *
 * Logging rule (as P1453): status codes and fixed codes only — never a prompt, a message, a reply or
 * the key. The key travels in the x-goog-api-key header, never in the URL.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { MIRROR_MODEL, MirrorRequestTooLarge, buildMirrorRequest, parseReply, type BeginRun } from '../_shared/mirror-agent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MIRROR_AI_ENABLED = (Deno.env.get('MIRROR_AI_ENABLED') ?? 'false') === 'true';
/** The mirror's own Gemini key with its own hard spend cap (never the banner or transcription keys). */
const MIRROR_KEY_OFF = 'not-configured';
const MIRROR_GEMINI_API_KEY = Deno.env.get('MIRROR_GEMINI_API_KEY') ?? MIRROR_KEY_OFF;

const CALL_TIMEOUT_MS = 45_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return json({ error: 'Service temporarily unavailable' }, 500, cors);
  }
  const enabled = MIRROR_AI_ENABLED && MIRROR_GEMINI_API_KEY !== MIRROR_KEY_OFF;

  // ── Caller identity ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors);
  const token = authHeader.slice('Bearer '.length);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await anon.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401, cors);

  let body: { message_id?: unknown; availability?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400, cors);
  }
  // The app asks once per session whether the mirror can answer here, so a project where it is off
  // (prod, until the privacy policy covers it) shows no AI controls and sends no further requests.
  if (body.availability === true) return json({ enabled }, 200, cors);
  if (!enabled) return json({ error: 'The mirror cannot answer yet', code: 'DISABLED' }, 503, cors);
  const messageId = typeof body.message_id === 'string' && UUID_RE.test(body.message_id) ? body.message_id : null;
  if (!messageId) return json({ error: 'message_id is required' }, 400, cors);

  // ── The job, created as the caller (the RPC proves the message is theirs) ──
  const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: jobRows, error: jobError } = await asCaller.rpc('mirror_request_reply', { p_message: messageId });
  const job = Array.isArray(jobRows) ? jobRows[0] as { job_id: string; state: string } | undefined : undefined;
  if (jobError || !job) return json({ error: 'Message not available', code: 'NOT_AVAILABLE' }, 404, cors);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: begun, error: beginError } = await service.rpc('_mirror_begin_job', { p_job: job.job_id });
  if (beginError || !begun) {
    console.error('mirror-reply: begin failed', { code: beginError?.code });
    return json({ error: 'Service temporarily unavailable' }, 503, cors);
  }
  const status = (begun as { status: string }).status;
  if (status === 'done') return json({ state: 'done', job_id: job.job_id }, 200, cors);
  if (status === 'capped') return json({ state: 'capped', job_id: job.job_id, code: 'CAPPED' }, 429, cors);
  if (status === 'busy') return json({ state: 'running', job_id: job.job_id }, 202, cors);
  if (status !== 'run') return json({ state: status, job_id: job.job_id }, 409, cors);
  const run = begun as BeginRun;

  // ── One model call ────────────────────────────────────────────────────────
  let request: ReturnType<typeof buildMirrorRequest>;
  try {
    request = buildMirrorRequest(run);
  } catch (e) {
    // Refused before any call: released, never charged (P1520 review).
    await service.rpc('_mirror_fail_job', { p_job: job.job_id, p_code: e instanceof MirrorRequestTooLarge ? 'too_large' : 'build', p_actual_usd: null, p_attempt: run.attempt });
    return json({ state: 'failed', job_id: job.job_id, code: 'TOO_LARGE' }, 422, cors);
  }
  let response: unknown = null;
  let httpStatus = 0;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MIRROR_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': MIRROR_GEMINI_API_KEY },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    httpStatus = res.status;
    if (res.ok) {
      response = await res.json();
    } else {
      await res.body?.cancel();
    }
  } catch (e) {
    console.error('mirror-reply: model request failed', { error: (e as Error).name });
  }

  if (!response) {
    // 429 (quota or the key's spend cap) and 403 (key refused) are the provider's cap: "capped".
    // Any 4xx was refused before generating, so it costs nothing; a network error or a 5xx leaves the
    // usage unknown, so the full reservation is charged (the Mira assistant's rule).
    const capped = httpStatus === 429 || httpStatus === 403;
    const refusedUpfront = httpStatus >= 400 && httpStatus < 500;
    if (httpStatus) console.error('mirror-reply: model error', { status: httpStatus });
    await service.rpc('_mirror_fail_job', {
      p_job: job.job_id,
      p_code: capped ? 'cap' : httpStatus ? `http_${httpStatus}` : 'network',
      p_actual_usd: refusedUpfront ? 0 : run.reserved_usd,
      p_attempt: run.attempt,
    });
    return json({ state: capped ? 'capped' : 'failed', job_id: job.job_id, code: capped ? 'CAPPED' : 'MODEL_ERROR' }, capped ? 429 : 502, cors);
  }

  const outcome = parseReply(response);
  if (!outcome.ok) {
    await service.rpc('_mirror_fail_job', { p_job: job.job_id, p_code: outcome.code, p_actual_usd: outcome.costUsd ?? run.reserved_usd, p_attempt: run.attempt });
    return json({ state: 'failed', job_id: job.job_id, code: outcome.code === 'blocked' ? 'BLOCKED' : 'EMPTY' }, 502, cors);
  }

  const { data: row, error: completeError } = await service.rpc('_mirror_complete_job', {
    p_job: job.job_id,
    p_body: outcome.text,
    p_actual_usd: outcome.costUsd ?? run.reserved_usd,
    p_attempt: run.attempt,
  });
  if (completeError) {
    console.error('mirror-reply: complete failed', { code: completeError.code });
    return json({ error: 'Service temporarily unavailable' }, 503, cors);
  }
  if (!row) return json({ state: 'cancelled', job_id: job.job_id }, 409, cors);

  console.log('mirror-reply: answered', { kind: run.kind, cost: outcome.costUsd });
  return json({ state: 'done', job_id: job.job_id, message: row }, 200, cors);
});
