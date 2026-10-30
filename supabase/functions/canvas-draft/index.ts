/**
 * P1536 (Design v6): the mirror applies each owner message to the Clarity Canvas DRAFT, one run per message.
 *
 * A user RPC (`canvas_workspace_send`, a retry, a focus switch, a fork) makes a `queued` run and returns its `run_id`. The
 * client then invokes this function, always with the owner's JWT:
 *
 *   POST { availability: true }                                -> 200 { enabled }
 *   POST { run_id }                                            -> 202 { state: 'running', run_id, kind }
 *        begins the run (claims it, reserves the spend) and works after the response (EdgeRuntime.waitUntil). A second call on
 *        a running run answers 202 and makes no second model call.
 *   POST multipart: run_id (uuid) + file (<= 8 MB)             -> 202 { state: 'running', run_id, label, chars }
 *        the upload's run: claim FIRST, then extract (a text/markdown file is decoded; a PDF, image, DOCX or PPTX goes
 *        through ONE extraction call), then write the text as material of that run's message, then draft. Only the
 *        extracted text is kept (`canvas_draft_material`); the bytes are never stored anywhere. A failure after the claim
 *        fails the run in the same invocation.
 *   Errors: { error, code } with 400 BAD_REQUEST | 401 | 404 NOT_AVAILABLE | 409 TERMS_NOT_ACCEPTED | 409 BUSY |
 *   409 NOT_READY | 409 GONE | 409 LIMIT | 413 TOO_LARGE | 415 UNSUPPORTED | 422 UNREADABLE | 429 CAPPED | 503 DISABLED.
 *
 * Gate order: availability, then the enabled gate, then terms (P1544), then the run's begin (which proves the run is the
 * caller's, checks its input is ready and reserves the spend), then 202. OFF unless CANVAS_DRAFT_AI_ENABLED is "true" and its
 * own spend-capped key is set. Test only until the privacy policy names canvas material (spec Invariants).
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
import { handleRun, handleUpload, type DraftService, type HandlerCtx } from '../_shared/canvas-handlers.ts';

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

/** The service-role seam the handlers use: the draft functions. */
function draftService(service: SupabaseClient): DraftService {
  return { rpc: async (name, args) => await service.rpc(name, args) };
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
    readLink: (url, signal) => readLinkText(url, { fetch: (u, init) => fetch(u, init), resolve: resolveAll, signal }),
    count: tokenCounter(stubbed),
  };
  return multipart ? await handleUpload(ctx, req) : await handleRun(ctx, body);
});
