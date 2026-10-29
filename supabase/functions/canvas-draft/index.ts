/**
 * P1536: the mirror drafts the owner's Clarity Canvas from their own material, as a DRAFT VERSION.
 *
 * Three actions, all with the owner's JWT:
 *
 *   POST { availability: true }                                -> 200 { enabled }
 *   POST multipart: draft_id (uuid) + file (<= 8 MB)           -> 200 { state: 'added', label, chars }
 *        a text/markdown file is decoded; a PDF, image, DOCX or PPTX goes through ONE extraction call.
 *        Only the extracted text is kept (`canvas_draft_material`); the bytes are never stored anywhere.
 *   POST { draft_id, speed: 'fast' | 'slow' }
 *                                                              -> 202 { state: 'running', run_id, kind }
 *        The work runs after the response (EdgeRuntime.waitUntil). The run's state lives in
 *        `canvas_draft_runs`, so a reload loses nothing and a second press cannot start a second run.
 *        Every run is kind 'draft' at the fast speed: it drafts straight away and its reply ends with "What I
 *        decided on my own". 'slow' is still accepted (an old tab may send it) and means 'fast'; a `phase` in
 *        the body is ignored. There is no tensions pass any more.
 *        A draft writes points only: no story is created (the model is not asked for one).
 *   Errors: { error, code } with 400 BAD_REQUEST | 401 | 404 NOT_AVAILABLE | 409 TERMS_NOT_ACCEPTED |
 *   409 DRAFT_CLOSED | 409 BUSY | 409 LIMIT | 413 TOO_LARGE | 415 UNSUPPORTED | 422 UNREADABLE |
 *   429 CAPPED | 429 REVISION_CAP | 503 DISABLED.
 *
 * Gate order: availability, then the enabled gate, then terms (P1544), then ownership of the draft, then the
 * run's begin (which reserves the spend), then 202. OFF unless CANVAS_DRAFT_AI_ENABLED is "true" and its own
 * spend-capped key is set. Test only until the privacy policy names canvas material (spec Invariants).
 *
 * The model is behind a ModelCaller. A deterministic stub answers only on a non-prod project AND when the
 * header x-canvas-draft-stub equals the CANVAS_DRAFT_STUB_TOKEN secret (_shared/canvas-model.ts).
 *
 * Logging: fixed codes only, never material, a URL, a name, a reply or a key.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { callerHasCurrentTerms, TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from '../_shared/terms-gate.ts';
import { readLinkText } from '../_shared/canvas-material.ts';
import { STUB_HEADER, geminiCaller, resolveEnabled, stubAllowed, stubCaller } from '../_shared/canvas-model.ts';
import { geminiTokenCounter } from '../_shared/mirror-agent.ts';
import { noCount } from '../_shared/canvas-fit.ts';
import { handleRun, handleUpload, type DraftRow, type DraftService, type HandlerCtx } from '../_shared/canvas-handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ENABLED_FLAG = (Deno.env.get('CANVAS_DRAFT_AI_ENABLED') ?? 'false') === 'true';
const KEY_OFF = 'not-configured';
const GEMINI_KEY = Deno.env.get('CANVAS_DRAFT_GEMINI_API_KEY') ?? KEY_OFF;
/** Set on the test project only. Empty (the default) means the stub can never be used. */
const STUB_TOKEN = Deno.env.get('CANVAS_DRAFT_STUB_TOKEN') ?? '';

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });

/** Every address a name has, IPv4 and IPv6 together; null when it resolves to none. */
async function resolveAll(host: string): Promise<string[] | null> {
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ]);
  const all = [...a, ...aaaa];
  return all.length ? all : null;
}

/** The service-role seams the handlers use: the draft functions, and the draft row. */
function draftService(service: SupabaseClient): DraftService {
  return {
    rpc: async (name, args) => await service.rpc(name, args),
    readDraft: async (id) => {
      const { data, error } = await service.from('canvas_drafts').select('owner_id, state').eq('id', id).maybeSingle();
      return { data: data as DraftRow | null, error };
    },
  };
}

/** The model's own (free) token count decides how much material a request holds; the stub and a missing key use the byte bound. */
const tokenCounter = (stubbed: boolean) => (stubbed || GEMINI_KEY === KEY_OFF ? noCount : geminiTokenCounter(GEMINI_KEY));

/** Hands the promise to the edge runtime so the response can go first; without it the work still runs. */
function runAfterResponse(work: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  rt?.waitUntil?.(work);
}

Deno.serve(async (req: Request) => {
  const baseCors = buildCorsHeaders(req);
  const cors = { ...baseCors, 'Access-Control-Allow-Headers': `${baseCors['Access-Control-Allow-Headers'] ?? ''}, ${STUB_HEADER}` };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) return json({ error: 'Service temporarily unavailable' }, 500, cors);

  const stubbed = stubAllowed({ supabaseUrl: SUPABASE_URL, header: req.headers.get(STUB_HEADER), token: STUB_TOKEN });
  const enabled = resolveEnabled(ENABLED_FLAG, GEMINI_KEY !== KEY_OFF, stubbed);
  const model = stubbed ? stubCaller() : geminiCaller(GEMINI_KEY);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await anon.auth.getUser(authHeader.slice('Bearer '.length));
  if (authError || !user) return json({ error: 'Unauthorized' }, 401, cors);

  const multipart = (req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data');
  let body: Record<string, unknown> = {};
  if (!multipart) {
    try { body = await req.json(); } catch { return json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400, cors); }
    if (body.availability === true) return json({ enabled }, 200, cors);
  }
  if (!enabled) return json({ error: 'Canvas drafting is not available yet', code: 'DISABLED' }, 503, cors);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  if (!(await callerHasCurrentTerms(service, user.id))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS, cors);

  const ctx: HandlerCtx = {
    userId: user.id, model, cors, afterResponse: runAfterResponse,
    service: draftService(service),
    readLink: (url) => readLinkText(url, { fetch: (u, init) => fetch(u, init), resolve: resolveAll }),
    count: tokenCounter(stubbed),
  };
  return multipart ? await handleUpload(ctx, req) : await handleRun(ctx, body);
});
