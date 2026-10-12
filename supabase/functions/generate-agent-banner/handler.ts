/**
 * P1453: generate-agent-banner — the operator path for AGENT profile banners.
 *
 * A separate function, never a flag on generate-banner (P1453 security review: no second door
 * into the internet-facing user route). It:
 *   - accepts ONLY a service-role key — there is no user-JWT path at all. The bearer is checked
 *     by a constant-time compare against this function's own key, else by asking the Auth admin
 *     API whether it accepts it: the platform injects the new-format secret key into functions
 *     while an operator may hold the legacy JWT, and both are service-role (measured on test);
 *   - serves only ids in `agent_accounts` (a human's id gets 403) and reads no "is agent" field
 *     from the request;
 *   - never replaces a banner unless `replace: true`: the write is conditional on
 *     `banner_url IS NULL`, and a replaced banner's old object is deleted only after the new URL
 *     is stored;
 *   - spends the BATCH Gemini key, so agent work never draws on the interactive fuse (P1236).
 *
 * The handler takes its side effects as `deps` so the Deno tests run without a network.
 */

import type { ArtistBannerResult, BannerCredit } from '../_shared/artist-banner-run.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentBannerDeps {
  /** True only for a service-role key (legacy JWT or new-format secret key). */
  isServiceKey: (bearer: string) => Promise<boolean>;
  isAgent: (profileId: string) => Promise<boolean>;
  /** null when the profile does not exist. */
  readBanner: (profileId: string) => Promise<{ bannerUrl: string | null; artist: string | null } | null>;
  /** 'key-blocked' when Gemini refused the batch key (429/403: spend cap or revoked) and no image came. */
  generate: (excludeArtist: string | null) => Promise<ArtistBannerResult | 'key-blocked' | null>;
  upload: (profileId: string, result: ArtistBannerResult) => Promise<{ publicUrl: string; fileName: string } | null>;
  /** Writes banner_url + banner_credit + banner_generation_attempted. Returns rows updated.
   *  Without `replace` the write is conditional on banner_url IS NULL. */
  write: (profileId: string, url: string, credit: BannerCredit, replace: boolean) => Promise<number>;
  credit: (url: string, result: ArtistBannerResult) => BannerCredit;
  /** Delete a stored banner object by its public URL (only within this profile's own folder). */
  removeByUrl: (profileId: string, url: string) => Promise<void>;
}

export function secretMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function createHandler(deps: AgentBannerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

    const auth = req.headers.get('Authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!bearer || !(await deps.isServiceKey(bearer))) return json(401, { error: 'Unauthorized' });

    let body: { profileId?: unknown; replace?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Invalid request body' });
    }
    const profileId = body?.profileId;
    if (typeof profileId !== 'string' || !UUID_RE.test(profileId)) {
      return json(400, { error: 'Invalid profileId' });
    }
    const replace = body.replace === true;

    if (!(await deps.isAgent(profileId))) return json(403, { error: 'Not an agent profile' });

    const current = await deps.readBanner(profileId);
    if (!current) return json(404, { error: 'Profile not found' });
    if (current.bannerUrl && !replace) {
      return json(409, { error: 'Profile already has a banner; pass replace: true to replace it', code: 'HAS_BANNER' });
    }

    const result = await deps.generate(current.artist);
    if (result === 'key-blocked') {
      // 429 tells scripts/agent-banner.mjs to stop the run: retrying other agents spends nothing
      // useful against a capped or revoked key.
      return json(429, { error: 'Gemini refused the batch key (spend cap or key)', code: 'GEMINI_KEY_BLOCKED' });
    }
    if (!result) return json(502, { error: 'Image generation failed', code: 'GENERATION_FAILED' });

    const stored = await deps.upload(profileId, result);
    if (!stored) return json(500, { error: 'Failed to store generated image', code: 'STORAGE_ERROR' });

    const credit = deps.credit(stored.publicUrl, result);
    const rows = await deps.write(profileId, stored.publicUrl, credit, replace);
    if (rows !== 1) {
      // A banner appeared between the read and the write: keep it, discard ours.
      await deps.removeByUrl(profileId, stored.publicUrl);
      return json(409, { error: 'Profile banner changed during generation; nothing replaced', code: 'HAS_BANNER' });
    }

    if (replace && current.bannerUrl && current.bannerUrl !== stored.publicUrl) {
      await deps.removeByUrl(profileId, current.bannerUrl);
    }

    console.log('Agent banner generated', {
      profileId,
      artist: result.entry.artist,
      generations: result.generations,
      vision: result.best.vision,
      replaced: replace && !!current.bannerUrl,
    });
    return json(200, { url: stored.publicUrl, credit });
  };
}
