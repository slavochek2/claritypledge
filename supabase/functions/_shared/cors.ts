// Shared CORS helper for all edge functions.
// See docs/technical/edge-functions.md for usage.

const DEFAULT_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://claritypledge.com';

// Dev ports per vite.config.ts: w0=5001, w1..w7=5100..5700, named=5800..5899
const DEV_ORIGIN_RE = /^http:\/\/localhost:(5001|5[1-7]\d{2}|58\d{2})$/;
const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;
const PROD_ORIGIN = 'https://claritypledge.com';

export function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  if (origin === PROD_ORIGIN) return origin;
  if (DEV_ORIGIN_RE.test(origin)) return origin;
  if (VERCEL_PREVIEW_RE.test(origin)) return origin;
  return DEFAULT_ORIGIN;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
