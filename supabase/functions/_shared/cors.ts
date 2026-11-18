// Shared CORS helper for all edge functions.
// See docs/technical/edge-functions.md for usage.

import { isDevOrigin } from './dev-origins.ts';

// Dev origins are an exact set, defined by the allocator in scripts/lib/worktree-port.mjs (devOrigins())
// and generated into ./dev-origins.ts, because edge functions cannot import scripts/. Regenerate with
// `node scripts/lib/worktree-port.mjs --dev-origins-ts > supabase/functions/_shared/dev-origins.ts`;
// src/tests/p1705-dev-origins.test.ts fails on any difference, and
// src/tests/inbox205-cors-dev-ports.test.ts checks every allocator origin is accepted here.
// Project-prefixed: claritypledge-<hash>, claritypledge-git-<branch>-<team>-<id>, claritypledge-git-staging.
// Narrows, does not close: Vercel subdomains are first-come, so another account's
// "claritypledge-x" project would still match. No Allow-Credentials is sent, so
// a matching origin gains no cookie-authenticated access.
const VERCEL_PREVIEW_RE = /^https:\/\/claritypledge(-[a-z0-9-]+)?\.vercel\.app$/;
const PROD_ORIGIN = 'https://claritypledge.com';

export function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  if (origin === PROD_ORIGIN) return origin;
  if (isDevOrigin(origin)) return origin;
  if (VERCEL_PREVIEW_RE.test(origin)) return origin;
  return PROD_ORIGIN;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
