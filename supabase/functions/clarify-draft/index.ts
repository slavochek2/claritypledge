/**
 * P1631: Clarify on a chat message makes ONE draft point for the presser, in their Mirror.
 *
 * The user RPCs (`clarify_start`, `clarify_another`, `clarify_retry`) make a `queued` draft and return its id. The client then invokes this
 * function with the owner's JWT: POST { draft_id } (or { availability: true }). The request handling is handler.ts (testable with fakes); this
 * file is env, clients and the model.
 *
 * Switch and key: the same as canvas drafting (CANVAS_DRAFT_AI_ENABLED, CANVAS_DRAFT_GEMINI_API_KEY), spend in the mirror's `canvas` bucket
 * (D2). OFF unless the flag is "true" and the key is set (or an allowed stub answers). Test only until the privacy policy names this use
 * (spec Invariants, Open Question 2).
 *
 * The model is MIRROR_MODEL behind a ClarifyCaller. The deterministic stub answers only on a non-prod project AND when the header
 * x-canvas-draft-stub equals CANVAS_DRAFT_STUB_TOKEN (the P1565 helper, _shared/canvas-model.ts): both conditions, never a flag a client sets alone.
 *
 * Logging: fixed codes only, never chat text, a statement, a name or a key.
 */

import { createClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { callerHasCurrentTerms } from '../_shared/terms-gate.ts';
import { STUB_HEADER, resolveEnabled, stubAllowed } from '../_shared/canvas-model.ts';
import { clarifyStub, geminiClarifyCaller } from './clarify-model.ts';
import { handleClarifyDraft, type ClarifyDeps } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ENABLED_FLAG = (Deno.env.get('CANVAS_DRAFT_AI_ENABLED') ?? 'false') === 'true';
const KEY_OFF = 'not-configured';
const GEMINI_KEY = Deno.env.get('CANVAS_DRAFT_GEMINI_API_KEY') ?? KEY_OFF;
/** Set on the test project only. Empty (the default) means the stub can never be used. */
const STUB_TOKEN = Deno.env.get('CANVAS_DRAFT_STUB_TOKEN') ?? '';

Deno.serve((req: Request) => {
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const stubbed = stubAllowed({ supabaseUrl: SUPABASE_URL, header: req.headers.get(STUB_HEADER), token: STUB_TOKEN });
  const deps: ClarifyDeps = {
    cors: buildCorsHeaders(req),
    envReady: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY),
    enabled: resolveEnabled(ENABLED_FLAG, GEMINI_KEY !== KEY_OFF, stubbed),
    authUser: async (token) => {
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: { user }, error } = await anon.auth.getUser(token);
      return error || !user ? null : user.id;
    },
    hasTerms: (userId) => callerHasCurrentTerms(service, userId),
    loadDraft: async (draftId) => {
      const { data } = await service.from('clarify_drafts').select('owner_id').eq('id', draftId).maybeSingle();
      return (data as { owner_id: string } | null) ?? null;
    },
    rpc: async (name, args) => await service.rpc(name, args),
    callModel: stubbed ? clarifyStub() : geminiClarifyCaller(GEMINI_KEY),
  };
  return handleClarifyDraft(req, deps);
});
