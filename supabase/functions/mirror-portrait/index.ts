/**
 * P1520: paint (or repaint, "New face") the caller's mirror portrait: an invented person in the style of
 * an artist picked at random from the P1453 pool, square, in a randomly picked gender (P1537: the owner's stored choice is ignored; formerly random when
 * they chose none). Never a real person's likeness; no data about the owner goes into the prompt.
 *
 * POST {} with the owner's JWT. The portrait is stored in the existing `banners` bucket under
 * `mirror/<random id>` (no owner id in the path) and set on the owner's mirror conversation, which only
 * the owner can read. The previous portrait file is removed.
 *
 * Spend: _mirror_begin_portrait reserves the run's worst case (2 generations at the fallback image
 * model's price plus 2 vision checks, x 1.25) under the portrait caps, and refuses a second run while
 * one is going. The run then settles at what its calls cost at list price (P1534), never above that. OFF unless MIRROR_AI_ENABLED is "true" and the mirror's own key is set (test only).
 */

import { createClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { callerHasCurrentTerms, TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from '../_shared/terms-gate.ts';
import { ownedBannerPath } from '../_shared/banner-path.ts';
import { base64ToBytes, BANNER_BUCKET, creditFor, runArtistBanner } from '../_shared/artist-banner-run.ts';
import { cryptoRng } from '../_shared/artist-banner.ts';
import {
  MAX_PORTRAIT_GENERATIONS, buildMirrorPortraitPrompt, portraitSettleUsd, reservePortraitUsd, resolveGender,
} from '../_shared/mirror-agent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MIRROR_AI_ENABLED = (Deno.env.get('MIRROR_AI_ENABLED') ?? 'false') === 'true';
const MIRROR_KEY_OFF = 'not-configured';
const MIRROR_GEMINI_API_KEY = Deno.env.get('MIRROR_GEMINI_API_KEY') ?? MIRROR_KEY_OFF;

const FOLDER = 'mirror/';
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  if (!MIRROR_AI_ENABLED || MIRROR_GEMINI_API_KEY === MIRROR_KEY_OFF) {
    return json({ error: 'Portraits are not available yet', code: 'DISABLED' }, 503, cors);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return json({ error: 'Service temporarily unavailable' }, 500, cors);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await anon.auth.getUser(authHeader.slice('Bearer '.length));
  if (authError || !user) return json({ error: 'Unauthorized' }, 401, cors);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // P1544: no reservation and no model call for a caller who has not accepted the current terms.
  if (!(await callerHasCurrentTerms(service, user.id))) return json(TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS, cors);
  const { data: begun, error: beginError } = await service.rpc('_mirror_begin_portrait', { p_owner: user.id });
  if (beginError || !begun) {
    console.error('mirror-portrait: begin failed', { code: beginError?.code });
    return json({ error: 'Service temporarily unavailable' }, 503, cors);
  }
  const b = begun as { status: string; job_id?: string; gender?: string | null; exclude_artist?: string | null; reserved_usd?: number };
  if (b.status === 'busy') return json({ state: 'running' }, 202, cors);
  if (b.status === 'capped') return json({ state: 'capped', code: 'CAPPED' }, 429, cors);
  const jobId = b.job_id;
  if (b.status !== 'run' || !jobId) return json({ error: 'Service temporarily unavailable' }, 503, cors);

  const gender = resolveGender(cryptoRng);
  let generations = 0;
  let keyBlocked = false;
  const billed: string[] = [];
  let visionCalls = 0;
  const result = await runArtistBanner({
    apiKey: MIRROR_GEMINI_API_KEY,
    excludeArtist: b.exclude_artist ?? null,
    buildPrompt: (entry) => buildMirrorPortraitPrompt(entry, gender),
    aspectRatio: '1:1',
    skipDarkness: true,
    onGenerate: (attempt) => {
      if (attempt > MAX_PORTRAIT_GENERATIONS || keyBlocked) return false;
      generations = attempt;
      return true;
    },
    onKeyBlocked: () => { keyBlocked = true; },
    onBillableCall: (model) => { billed.push(model); },
    onVisionCall: () => { visionCalls++; },
    logTag: 'Mirror portrait',
  });
  // P1534: charged what its calls cost at list price (each billable image call by model, each vision check
  // sent), never more than the reservation. It used to be the whole reservation every time.
  const cost = portraitSettleUsd(b.reserved_usd ?? reservePortraitUsd(), generations > 0, billed, visionCalls);

  if (!result) {
    await service.rpc('_mirror_fail_job', { p_job: jobId, p_code: keyBlocked ? 'cap' : 'generation', p_actual_usd: cost });
    return json({ state: keyBlocked ? 'capped' : 'failed', code: keyBlocked ? 'CAPPED' : 'GENERATION_FAILED' }, keyBlocked ? 429 : 502, cors);
  }

  const image = result.best.image;
  const fileName = `${FOLDER}${crypto.randomUUID()}.${MIME_EXT[image.mimeType] ?? 'png'}`;
  const { error: upError } = await service.storage.from(BANNER_BUCKET).upload(fileName, base64ToBytes(image.data), {
    contentType: image.mimeType,
    upsert: false,
  });
  if (upError) {
    console.error('mirror-portrait: upload failed', { error: upError.message });
    await service.rpc('_mirror_fail_job', { p_job: jobId, p_code: 'storage', p_actual_usd: cost });
    return json({ state: 'failed', code: 'STORAGE_ERROR' }, 500, cors);
  }
  const url = service.storage.from(BANNER_BUCKET).getPublicUrl(fileName).data.publicUrl;
  const credit = { ...creditFor(url, result.entry, result.best), gender };

  const { data: previous, error: finishError } = await service.rpc('_mirror_finish_portrait', {
    p_job: jobId, p_url: url, p_credit: credit, p_actual_usd: cost,
  });
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/`;
  if (finishError || previous === null) {
    // The job was cancelled meanwhile (the owner was erased): this new file must not outlive it.
    await service.storage.from(BANNER_BUCKET).remove([fileName]);
    return json({ state: 'cancelled' }, 409, cors);
  }
  if (typeof previous === 'string' && previous) {
    const oldPath = ownedBannerPath(previous, prefix, FOLDER);
    if (oldPath) {
      const { error } = await service.storage.from(BANNER_BUCKET).remove([oldPath]);
      if (error) console.error('mirror-portrait: old file cleanup failed', { error: error.message });
    }
  }

  console.log('mirror-portrait: painted', { artist: result.entry.artist, generations, fidelity: result.best.vision });
  return json({ state: 'done', url, credit }, 200, cors);
});
