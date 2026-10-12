// P1453: operator-only artist banners for agent profiles. Logic and its rationale: handler.ts.
// Called by scripts/agent-banner.mjs (provisioning and the backfill), never by the website.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler, secretMatches } from './handler.ts';
import {
  BANNER_BUCKET,
  creditFor,
  runArtistBanner,
  uploadBannerImage,
} from '../_shared/artist-banner-run.ts';
import { ownedBannerPath } from '../_shared/banner-path.ts';
import { removeBannerAndSmallCopy } from '../_shared/banner-small.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// P1236: the batch key, a distinct secret from the interactive GEMINI_API_KEY.
const GEMINI_BATCH_API_KEY = Deno.env.get('GEMINI_BATCH_API_KEY') ?? '';

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ownPrefix = `${SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/`;

const handler = createHandler({
  // Same key as this function's own → service role. Otherwise ask Auth: the admin API answers
  // 200 only to a service-role key, in either format; a user JWT or an anon key gets 401/403.
  isServiceKey: async (bearer) => {
    if (secretMatches(bearer, SUPABASE_SERVICE_ROLE_KEY)) return true;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
        headers: { apikey: bearer, Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
      return res.status === 200;
    } catch {
      return false;
    }
  },

  isAgent: async (id) => {
    const { data, error } = await db.from('agent_accounts').select('profile_id').eq('profile_id', id).maybeSingle();
    if (error) throw new Error(`agent_accounts read failed: ${error.code}`);
    return !!data;
  },

  readBanner: async (id) => {
    const { data, error } = await db.from('profiles').select('banner_url, banner_credit').eq('id', id).maybeSingle();
    if (error) throw new Error(`profiles read failed: ${error.code}`);
    if (!data) return null;
    const artist = (data.banner_credit as { artist?: unknown } | null)?.artist;
    return { bannerUrl: data.banner_url ?? null, artist: typeof artist === 'string' ? artist : null };
  },

  generate: (excludeArtist) => runArtistBanner({ apiKey: GEMINI_BATCH_API_KEY, excludeArtist, logTag: 'Agent banner' }),

  upload: (id, result) => uploadBannerImage(db, 'profile', id, result.best.image),

  credit: (url, result) => creditFor(url, result.entry, result.best),

  write: async (id, url, credit, replace) => {
    let q = db
      .from('profiles')
      .update({ banner_url: url, banner_credit: credit, banner_generation_attempted: true })
      .eq('id', id);
    if (!replace) q = q.is('banner_url', null);
    const { data, error } = await q.select('id');
    if (error) throw new Error(`profiles write failed: ${error.code}`);
    return data?.length ?? 0;
  },

  removeByUrl: async (id, url) => {
    const path = ownedBannerPath(url, ownPrefix, `profile/${id}/`);
    if (!path) return; // not an object this profile owns: leave it
    const { error } = await removeBannerAndSmallCopy(db, BANNER_BUCKET, path);
    if (error) console.error('Agent banner cleanup failed', { id, error: error.message });
  },
});

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_BATCH_API_KEY) {
    return new Response(JSON.stringify({ error: 'Service temporarily unavailable' }), { status: 500 });
  }
  try {
    return await handler(req);
  } catch (e) {
    console.error('generate-agent-banner failed', { error: (e as Error).message });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
