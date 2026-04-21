/**
 * @file generate-story-image-url/index.ts
 * @description P591: Generate authenticated GCS signed upload URLs for story images.
 *
 * Pattern: follows generate-banner/index.ts for JWT validation and ownership checks.
 * Generates V4 signed upload URLs for GCS bucket `claritypledge-story-images`.
 *
 * Security:
 * - JWT validated via Supabase anon client
 * - Story ownership verified (author_id = authenticated user)
 * - Server-side MIME allowlist (jpeg, png, webp)
 * - Server-side file size enforcement via X-Goog-Content-Length-Range
 * - GCS path generated server-side (client never controls path)
 * - Content-Type locked in signed URL
 * - 5-minute URL expiry
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

// ── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// GCS service account key JSON — stored as a Supabase edge function secret
const GCS_SERVICE_ACCOUNT_KEY = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY') ?? '';

// ── Constants ────────────────────────────────────────────────────────────────

const GCS_BUCKET = 'claritypledge-story-images';
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60; // 5 minutes
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Types ────────────────────────────────────────────────────────────────────

interface RequestBody {
  storyId: string;
  contentType: string;
  fileName: string;
}

interface GcsServiceAccountKey {
  client_email: string;
  private_key: string;
}

// ── GCS V4 Signed URL Generation ─────────────────────────────────────────────

/**
 * Import a PEM-encoded RSA private key for signing.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Sign data with RSA-SHA256.
 */
async function signRsa256(key: CryptoKey, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(data),
  );
  return bufferToHex(new Uint8Array(signature));
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 hash of a string, returned as hex.
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return bufferToHex(new Uint8Array(hash));
}

/**
 * URL-encode a string per RFC 3986 (GCS requires this specific encoding).
 */
function rfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Format a Date as YYYYMMDD'T'HHMMSS'Z' (ISO 8601 basic format).
 */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Format a Date as YYYYMMDD.
 */
function formatDate(date: Date): string {
  return formatTimestamp(date).slice(0, 8);
}

/**
 * Generate a GCS V4 signed upload URL.
 *
 * Implements the V4 signing process:
 * https://cloud.google.com/storage/docs/authentication/signatures#process
 */
async function generateV4SignedUrl(params: {
  bucket: string;
  objectPath: string;
  contentType: string;
  serviceAccountEmail: string;
  privateKey: CryptoKey;
  expirationSeconds: number;
}): Promise<string> {
  const { bucket, objectPath, contentType, serviceAccountEmail, privateKey, expirationSeconds } = params;

  const now = new Date();
  const timestamp = formatTimestamp(now);
  const datestamp = formatDate(now);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;

  // Canonical extension headers — sorted by header name
  const extensionHeaders: Record<string, string> = {
    'content-type': contentType,
    'host': 'storage.googleapis.com',
    'x-goog-content-length-range': `1,${MAX_FILE_SIZE}`,
  };

  const sortedHeaderKeys = Object.keys(extensionHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${extensionHeaders[k]}`)
    .join('\n') + '\n';
  const signedHeaders = sortedHeaderKeys.join(';');

  // Query parameters for the signed URL
  const queryParams: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expirationSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  };

  // Build canonical query string (sorted by param name)
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQueryString = sortedQueryKeys
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join('&');

  // Canonical resource path
  const canonicalResource = `/${bucket}/${objectPath}`;

  // Canonical request
  const canonicalRequest = [
    'PUT',
    canonicalResource,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  // String to sign
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    timestamp,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Sign
  const signature = await signRsa256(privateKey, stringToSign);

  // Build signed URL
  return `https://storage.googleapis.com${canonicalResource}?${canonicalQueryString}&X-Goog-Signature=${signature}`;
}

// ── Input Validation ─────────────────────────────────────────────────────────

function validateInput(body: RequestBody): { valid: true } | { valid: false; error: string } {
  if (!body.storyId || !UUID_RE.test(body.storyId)) {
    return { valid: false, error: 'Invalid storyId format' };
  }
  if (!body.contentType || !(body.contentType in ALLOWED_MIME_TYPES)) {
    return { valid: false, error: `contentType must be one of: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}` };
  }
  if (!body.fileName || typeof body.fileName !== 'string' || body.fileName.length > 255) {
    return { valid: false, error: 'Invalid fileName' };
  }
  return { valid: true };
}

// ── Entry Point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Guards: required env vars ────────────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !GCS_SERVICE_ACCOUNT_KEY) {
    console.error('Missing required environment variables');
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Parse service account key ──────────────────────────────────────────────
  let serviceAccount: GcsServiceAccountKey;
  try {
    serviceAccount = JSON.parse(GCS_SERVICE_ACCOUNT_KEY);
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Missing client_email or private_key');
    }
  } catch (err) {
    console.error('Invalid GCS_SERVICE_ACCOUNT_KEY:', err);
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Parse request body ─────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Validate input ─────────────────────────────────────────────────────────
  const validation = validateInput(body);
  if ('error' in validation) {
    return new Response(
      JSON.stringify({ error: validation.error }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── JWT validation ─────────────────────────────────────────────────────────
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

  const userId = user.id;

  // ── Verify story ownership ─────────────────────────────────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: story, error: storyError } = await serviceClient
    .from('stories')
    .select('id, author_id')
    .eq('id', body.storyId)
    .eq('author_id', userId)
    .single();

  if (storyError || !story) {
    return new Response(
      JSON.stringify({ error: 'Story not found or you are not the author' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }

  // ── Generate GCS path (server-side — client never controls path) ──────────
  const ext = ALLOWED_MIME_TYPES[body.contentType];
  const objectPath = `story-images/${body.storyId}/${crypto.randomUUID()}.${ext}`;

  // ── Generate V4 signed upload URL ──────────────────────────────────────────
  try {
    const privateKey = await importPrivateKey(serviceAccount.private_key);

    const signedUrl = await generateV4SignedUrl({
      bucket: GCS_BUCKET,
      objectPath,
      contentType: body.contentType,
      serviceAccountEmail: serviceAccount.client_email,
      privateKey,
      expirationSeconds: SIGNED_URL_EXPIRY_SECONDS,
    });

    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${objectPath}`;

    console.log('Signed URL generated', { userId, storyId: body.storyId, objectPath });

    return new Response(
      JSON.stringify({ signedUrl, publicUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    console.error('Failed to generate signed URL:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to generate upload URL' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
