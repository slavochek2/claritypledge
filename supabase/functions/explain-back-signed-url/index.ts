/**
 * @file explain-back-signed-url/index.ts
 * @description P904: In-process V4-signed GCS URLs for letter explain-back audio.
 *
 * Modeled on generate-story-image-url (in-process V4 signing — NOT the external
 * gcs-signed-url Cloud Function, which cannot sign x-goog-content-length-range, P812).
 *
 * Two modes:
 *   - mode: 'upload'   → receiver-only PUT URL, size-capped via x-goog-content-length-range,
 *                        MIME-locked, object key server-derived ({deliveryId}/{storyId}.webm).
 *   - mode: 'playback' → participant-only GET URL for an existing explain-back's audio.
 *
 * Security:
 *   - JWT validated via the Supabase anon client.
 *   - Pair-membership checked server-side (service-role lookup of letter_deliveries →
 *     clarity_letters): upload requires the caller be the delivery's RECEIVER; playback
 *     requires the caller be a PARTICIPANT (sender or receiver). The DB RLS is the real
 *     gate on the rows; this is the gate on the SIGNATURE — no membership, no URL.
 *   - Audio lives in a PRIVATE bucket (claritypledge-explain-backs), separate from the
 *     ML-training corpus. Short URL expiry.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

// ── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GCS_SERVICE_ACCOUNT_KEY = Deno.env.get('GCS_SERVICE_ACCOUNT_KEY') ?? '';

// ── Constants ────────────────────────────────────────────────────────────────

const GCS_BUCKET = 'claritypledge-explain-backs';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour (spec: TTL <= 1h)
// Confirmed cap 2026-06-10: 3 min audio @ ~128 kbps opus ≈ 2.9 MB → cap 5 MB.
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const CONTENT_LENGTH_RANGE = `1,${MAX_FILE_SIZE}`;

const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Types ────────────────────────────────────────────────────────────────────

interface UploadRequest {
  mode: 'upload';
  deliveryId: string;
  storyId: string;
  contentType: string;
}

interface PlaybackRequest {
  mode: 'playback';
  explainBackId: string;
}

type RequestBody = UploadRequest | PlaybackRequest;

interface GcsServiceAccountKey {
  client_email: string;
  private_key: string;
}

// ── GCS V4 signing (shared by PUT and GET) ─────────────────────────────────────

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

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signRsa256(key: CryptoKey, data: string): Promise<string> {
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return bufferToHex(new Uint8Array(signature));
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return bufferToHex(new Uint8Array(hash));
}

function rfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function formatDate(date: Date): string {
  return formatTimestamp(date).slice(0, 8);
}

/**
 * Generate a GCS V4 signed URL for a given HTTP method and extension headers.
 * https://cloud.google.com/storage/docs/authentication/signatures#process
 */
async function generateV4SignedUrl(params: {
  method: 'PUT' | 'GET';
  bucket: string;
  objectPath: string;
  extensionHeaders: Record<string, string>;
  serviceAccountEmail: string;
  privateKey: CryptoKey;
  expirationSeconds: number;
}): Promise<string> {
  const { method, bucket, objectPath, extensionHeaders, serviceAccountEmail, privateKey, expirationSeconds } = params;

  const now = new Date();
  const timestamp = formatTimestamp(now);
  const datestamp = formatDate(now);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;

  const sortedHeaderKeys = Object.keys(extensionHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${extensionHeaders[k]}`).join('\n') + '\n';
  const signedHeaders = sortedHeaderKeys.join(';');

  const queryParams: Record<string, string> = {
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': timestamp,
    'X-Goog-Expires': String(expirationSeconds),
    'X-Goog-SignedHeaders': signedHeaders,
  };

  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQueryString = sortedQueryKeys
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join('&');

  const canonicalResource = `/${bucket}/${objectPath}`;
  const canonicalRequest = [
    method,
    canonicalResource,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = ['GOOG4-RSA-SHA256', timestamp, credentialScope, canonicalRequestHash].join('\n');
  const signature = await signRsa256(privateKey, stringToSign);

  return `https://storage.googleapis.com${canonicalResource}?${canonicalQueryString}&X-Goog-Signature=${signature}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

interface Membership {
  isReceiver: boolean;
  isSender: boolean;
}

/** Resolve the caller's membership in a delivery's parent letter. */
 
async function resolveMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: ReturnType<typeof createClient<any>>,
  deliveryId: string,
  userId: string,
): Promise<Membership | null> {
  const { data: deliveryRaw, error: dErr } = await serviceClient
    .from('letter_deliveries')
    .select('letter_id, receiver_profile_id')
    .eq('id', deliveryId)
    .single();
  if (dErr || !deliveryRaw) return null;
  const delivery = deliveryRaw as { letter_id: string; receiver_profile_id: string };

  const { data: letterRaw, error: lErr } = await serviceClient
    .from('clarity_letters')
    .select('sender_id')
    .eq('id', delivery.letter_id)
    .single();
  if (lErr || !letterRaw) return null;
  const letter = letterRaw as { sender_id: string };

  return {
    isReceiver: delivery.receiver_profile_id === userId,
    isSender: letter.sender_id === userId,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !GCS_SERVICE_ACCOUNT_KEY) {
    console.error('Missing required environment variables');
    return json({ error: 'Service temporarily unavailable' }, 500, corsHeaders);
  }

  let serviceAccount: GcsServiceAccountKey;
  try {
    serviceAccount = JSON.parse(GCS_SERVICE_ACCOUNT_KEY);
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Missing client_email or private_key');
    }
  } catch (err) {
    console.error('Invalid GCS_SERVICE_ACCOUNT_KEY:', err);
    return json({ error: 'Service temporarily unavailable' }, 500, corsHeaders);
  }

  // ── JWT validation ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401, corsHeaders);
  }
  const token = authHeader.replace('Bearer ', '');
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401, corsHeaders);
  }
  const userId = user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return json({ error: 'Invalid request body' }, 400, corsHeaders);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceClient = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const privateKey = await importPrivateKey(serviceAccount.private_key);

    // ── UPLOAD ──────────────────────────────────────────────────────────────
    if (body.mode === 'upload') {
      const { deliveryId, storyId, contentType } = body;
      if (!deliveryId || !UUID_RE.test(deliveryId) || !storyId || !UUID_RE.test(storyId)) {
        return json({ error: 'Invalid deliveryId or storyId' }, 400, corsHeaders);
      }
      if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
        return json({ error: `contentType must be one of: ${[...ALLOWED_MIME_TYPES].join(', ')}` }, 400, corsHeaders);
      }

      const membership = await resolveMembership(serviceClient, deliveryId, userId);
      if (!membership) {
        return json({ error: 'Delivery not found' }, 404, corsHeaders);
      }
      if (!membership.isReceiver) {
        return json({ error: 'Only the delivery receiver may upload an explain-back' }, 403, corsHeaders);
      }

      const objectPath = `${deliveryId}/${storyId}.webm`;
      const signedUrl = await generateV4SignedUrl({
        method: 'PUT',
        bucket: GCS_BUCKET,
        objectPath,
        extensionHeaders: {
          'content-type': contentType,
          'host': 'storage.googleapis.com',
          'x-goog-content-length-range': CONTENT_LENGTH_RANGE,
        },
        serviceAccountEmail: serviceAccount.client_email,
        privateKey,
        expirationSeconds: SIGNED_URL_EXPIRY_SECONDS,
      });

      console.log('Explain-back upload URL signed', { userId, deliveryId, storyId });
      return json({
        signedUrl,
        storagePath: `gs://${GCS_BUCKET}/${objectPath}`,
        contentLengthRange: CONTENT_LENGTH_RANGE,
      }, 200, corsHeaders);
    }

    // ── PLAYBACK ────────────────────────────────────────────────────────────
    if (body.mode === 'playback') {
      const { explainBackId } = body;
      if (!explainBackId || !UUID_RE.test(explainBackId)) {
        return json({ error: 'Invalid explainBackId' }, 400, corsHeaders);
      }

      const { data: eb, error: ebErr } = await serviceClient
        .from('story_explain_backs')
        .select('delivery_id, audio_storage_path, medium')
        .eq('id', explainBackId)
        .single();
      if (ebErr || !eb) {
        return json({ error: 'Explain-back not found' }, 404, corsHeaders);
      }
      if (eb.medium !== 'audio' || !eb.audio_storage_path) {
        return json({ error: 'No audio for this explain-back' }, 404, corsHeaders);
      }

      const membership = await resolveMembership(serviceClient, eb.delivery_id as string, userId);
      if (!membership || (!membership.isReceiver && !membership.isSender)) {
        return json({ error: 'Not a participant of this letter' }, 403, corsHeaders);
      }

      // Derive object path from the stored gs:// URI (server-controlled at upload time).
      const prefix = `gs://${GCS_BUCKET}/`;
      const storagePath = eb.audio_storage_path as string;
      if (!storagePath.startsWith(prefix)) {
        return json({ error: 'Invalid storage path' }, 500, corsHeaders);
      }
      const objectPath = storagePath.slice(prefix.length);

      const signedUrl = await generateV4SignedUrl({
        method: 'GET',
        bucket: GCS_BUCKET,
        objectPath,
        extensionHeaders: { 'host': 'storage.googleapis.com' },
        serviceAccountEmail: serviceAccount.client_email,
        privateKey,
        expirationSeconds: SIGNED_URL_EXPIRY_SECONDS,
      });

      console.log('Explain-back playback URL signed', { userId, explainBackId });
      return json({ signedUrl }, 200, corsHeaders);
    }

    return json({ error: 'Invalid mode' }, 400, corsHeaders);
  } catch (err) {
    console.error('Failed to sign explain-back URL:', err);
    return json({ error: 'Failed to generate signed URL' }, 500, corsHeaders);
  }
});
