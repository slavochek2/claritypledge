// Shared CORS helper for all edge functions.
// See docs/technical/edge-functions.md for usage.

// Dev ports come from scripts/lib/worktree-port.mjs: w0=5001; wN=5000+N*100 (w1..w9 = 5100..5900, whole
// hundreds accepted for Vite HMR offsets); named=5800..5899; w10's 6000 is browser-restricted, so 6050.
// src/tests/inbox205-cors-dev-ports.test.ts fails if a slot's port is not accepted here.
const DEV_ORIGIN_RE = /^http:\/\/localhost:(5001|5[1-9]\d{2}|6050)$/;
// Project-prefixed: claritypledge-<hash>, claritypledge-git-<branch>-<team>-<id>, claritypledge-git-staging.
// Narrows, does not close: Vercel subdomains are first-come, so another account's
// "claritypledge-x" project would still match. No Allow-Credentials is sent, so
// a matching origin gains no cookie-authenticated access.
const VERCEL_PREVIEW_RE = /^https:\/\/claritypledge(-[a-z0-9-]+)?\.vercel\.app$/;
const PROD_ORIGIN = 'https://claritypledge.com';

export function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  if (origin === PROD_ORIGIN) return origin;
  if (DEV_ORIGIN_RE.test(origin)) return origin;
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
