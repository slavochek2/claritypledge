/**
 * @file check-login-email/index.ts
 * @description P1511: the login form's "does this address have an account" check, per-IP limited.
 *
 * Wiring only: environment, the service-role client, serve(). The request logic is in handler.ts.
 *
 * Deployed WITH gateway JWT verification: the logged-out login form calls it with the public anon
 * key, which passes the gateway. That gate keeps out nobody (the key ships in the bundle) — the
 * limiter in handler.ts is the real bound.
 */

import { createClient } from '@supabase/supabase-js';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { FUNCTION_NAME, createHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Rate-limit keys are salted hashes; without the salt the limiter cannot run — fail closed.
const ipHashSecret = Deno.env.get('IP_HASH_SECRET');

const handler = supabaseUrl && serviceRoleKey && ipHashSecret
  ? createHandler({ db: createClient(supabaseUrl, serviceRoleKey), ipHashSecret })
  : null;

serve((req: Request) => {
  if (handler) return handler(req);
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or IP_HASH_SECRET`);
  const cors = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  return new Response(JSON.stringify({ result: 'unavailable' }), {
    status: 503,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
