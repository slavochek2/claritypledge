/**
 * P1520: the mirror answers one of its owner's messages — in the mirror chat, or privately for an
 * @mirror ask made in a channel.
 *
 * The request handling lives in handler.ts (testable with fakes); this file is env, clients and the Gemini call.
 *
 * POST { message_id }  with the owner's JWT. The message must be the caller's own, in their own mirror
 * (a plain message, a Clarify copy, or an ask created by the mirror_ask RPC).
 *
 * Flow: mirror_request_reply (as the caller: proves ownership, creates or returns the one job for this
 * message) → _mirror_begin_job (service role: locks and reads the bounded context, reserves the spend,
 * marks it running) → a free countTokens check (P1547) → one Gemini call → _mirror_complete_job (writes the agent row, settles the spend).
 * The reply reaches the client through Realtime like any message; the response also carries it.
 *
 * Refuses (409 terms_not_accepted, P1544) unless the caller has accepted the current terms version.
 * OFF unless MIRROR_AI_ENABLED is "true" and the mirror's own key is set. Both are set on the test
 * project only: no AI call may run on prod until the privacy policy covers sending other people's
 * messages to the model (founder, 2026-10-20). Both have explicit "off" defaults so the deploy-time
 * secrets check does not treat them as required on a project where the feature is off.
 *
 * P1576: the database also calls this function itself (pg_net, header x-mirror-internal = MIRROR_INTERNAL_SECRET,
 * body { job_id }) when a voice note's transcript is done, so the browser never asks for a voice note's reply.
 * MIRROR_INTERNAL_SECRET has the same explicit "off" default; internal mode is refused while it is off.
 *
 * Logging rule (as P1453): status codes and fixed codes only — never a prompt, a message, a reply or
 * the key. The key travels in the x-goog-api-key header, never in the URL.
 */

import { createClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { callerHasCurrentTerms } from '../_shared/terms-gate.ts';
import { MIRROR_MODEL, fitMirrorRequest, geminiTokenCounter, type GeminiRequest } from '../_shared/mirror-agent.ts';
import { handleMirrorReply, INTERNAL_SECRET_OFF, type MirrorDeps } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MIRROR_AI_ENABLED = (Deno.env.get('MIRROR_AI_ENABLED') ?? 'false') === 'true';
/** The mirror's own Gemini key with its own hard spend cap (never the banner or transcription keys). */
const MIRROR_KEY_OFF = 'not-configured';
const MIRROR_GEMINI_API_KEY = Deno.env.get('MIRROR_GEMINI_API_KEY') ?? MIRROR_KEY_OFF;
/** The shared secret the voice-note trigger sends (vault: mirror_internal_secret). */
const MIRROR_INTERNAL_SECRET = Deno.env.get('MIRROR_INTERNAL_SECRET') ?? INTERNAL_SECRET_OFF;

const CALL_TIMEOUT_MS = 45_000;

async function callGemini(request: GeminiRequest): Promise<{ status: number; body: unknown | null }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MIRROR_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': MIRROR_GEMINI_API_KEY },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (res.ok) return { status: res.status, body: await res.json() };
    await res.body?.cancel();
    return { status: res.status, body: null };
  } catch (e) {
    console.error('mirror-reply: model request failed', { error: (e as Error).name });
    return { status: 0, body: null };
  }
}

Deno.serve((req: Request) => {
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const deps: MirrorDeps = {
    cors: buildCorsHeaders(req),
    envReady: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY),
    enabled: MIRROR_AI_ENABLED && MIRROR_GEMINI_API_KEY !== MIRROR_KEY_OFF,
    internalSecret: MIRROR_INTERNAL_SECRET,
    authUser: async (token) => {
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: { user }, error } = await anon.auth.getUser(token);
      return error || !user ? null : user.id;
    },
    hasTerms: (userId) => callerHasCurrentTerms(service, userId),
    requestReply: async (token, messageId) => {
      const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await asCaller.rpc('mirror_request_reply', { p_message: messageId });
      const job = Array.isArray(data) ? data[0] as { job_id: string | null; state: string } | undefined : undefined;
      return error || !job ? null : job;
    },
    loadJob: async (jobId) => {
      const { data } = await service.from('mirror_jobs').select('owner_id, kind').eq('id', jobId).maybeSingle();
      return (data as { owner_id: string; kind: string } | null) ?? null;
    },
    rpc: async (name, args) => await service.rpc(name, args),
    // P1547: the estimate selects; Gemini's free countTokens decides (UTF-8 bytes if it fails).
    fit: async (run) => (await fitMirrorRequest(run, geminiTokenCounter(MIRROR_GEMINI_API_KEY))).request,
    callModel: callGemini,
  };
  return handleMirrorReply(req, deps);
});
