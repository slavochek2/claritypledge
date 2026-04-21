import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GCS_UPLOAD_SECRET = Deno.env.get('GCS_UPLOAD_SECRET') ?? '';
const GCS_CLOUD_FUNCTION_URL = Deno.env.get('GCS_CLOUD_FUNCTION_URL')
  ?? 'https://us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url';

// ── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  sessionCode: string;
  fileName: string;
  contentType: string;
}

// ── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Guards: required env vars ────────────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GCS_UPLOAD_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── JWT validation ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  const token = authHeader.replace('Bearer ', '');

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Validate input ───────────────────────────────────────────────────────
  if (!body.sessionCode || !body.fileName || !body.contentType) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sessionCode, fileName, contentType' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Proxy to Cloud Function with secret ──────────────────────────────────
  try {
    const response = await fetch(GCS_CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Secret': GCS_UPLOAD_SECRET,
      },
      body: JSON.stringify({
        sessionCode: body.sessionCode,
        fileName: body.fileName,
        contentType: body.contentType,
      }),
    });

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('Error proxying to GCS Cloud Function:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to get signed upload URL' }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
