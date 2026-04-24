#!/usr/bin/env node
/**
 * P809 reproduction probe for the P802/P805/P807 matryoshka's next layer
 * (GCS 400 Bad Request on signed PUT, visible in 2026-04-24 prod screenshots).
 *
 * Replicates the exact browser upload path without needing /live + 2 users:
 *   1. Auths as PROD_TEST_AGENT against PROD Supabase
 *   2. Calls the `gcs-signed-url` edge function
 *   3. PUTs a small webm blob with the same headers the app sends
 *   4. Logs the full response (status, headers, body) — which today is hidden
 *      behind `Provisional headers are shown` in DevTools
 *
 * Uses `_dev_` filename prefix (P809) so the canary file is trivially
 * filterable and cleanable with `gsutil rm`.
 *
 * Usage:
 *   node scripts/probe-gcs-upload.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// --- Load .env.local ---------------------------------------------------------
const envPath = resolve(REPO_ROOT, '.env.local');
const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const PROD_SUPABASE_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const PROD_ANON = env.PROD_SUPABASE_ANON_KEY;
const AGENT_EMAIL = env.PROD_TEST_AGENT_EMAIL;
const AGENT_PASSWORD = env.PROD_TEST_AGENT_PASSWORD;

if (!PROD_ANON || !AGENT_EMAIL || !AGENT_PASSWORD) {
  console.error('Missing creds in .env.local: need PROD_SUPABASE_ANON_KEY + PROD_TEST_AGENT_EMAIL + PROD_TEST_AGENT_PASSWORD');
  process.exit(1);
}

// --- Step 1: Auth ------------------------------------------------------------
console.log('[1/3] Auth as prod test agent...');
const authResp = await fetch(`${PROD_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': PROD_ANON },
  body: JSON.stringify({ email: AGENT_EMAIL, password: AGENT_PASSWORD }),
});
if (!authResp.ok) {
  console.error('Auth failed:', authResp.status, await authResp.text());
  process.exit(1);
}
const { access_token } = await authResp.json();
console.log('  ok, token length:', access_token.length);

// --- Step 2: Get signed URL --------------------------------------------------
const SESSION_CODE = 'P809CA'; // canary session code, not a real session
const FILE_NAME = '_dev_canary_chunk_000.webm';
const CONTENT_TYPE = 'audio/webm;codecs=opus'; // exactly what MediaRecorder emits

console.log(`[2/3] Requesting signed URL for sessions/${SESSION_CODE}/${FILE_NAME}`);
const signResp = await fetch(`${PROD_SUPABASE_URL}/functions/v1/gcs-signed-url`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${access_token}`,
  },
  body: JSON.stringify({ sessionCode: SESSION_CODE, fileName: FILE_NAME, contentType: CONTENT_TYPE }),
});
if (!signResp.ok) {
  console.error('Signing failed:', signResp.status, await signResp.text());
  process.exit(1);
}
const { uploadUrl, filePath } = await signResp.json();
console.log('  ok, filePath:', filePath);
console.log('  uploadUrl length:', uploadUrl.length);

// --- Step 3: PUT with same headers as browser --------------------------------
console.log('[3/3] PUT a 100-byte blob to the signed URL...');
const blob = new Uint8Array(100); // 100 bytes of zeros, within 1,5242880 range
const putResp = await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': CONTENT_TYPE,
    'x-goog-content-length-range': '1,5242880',
  },
  body: blob,
});

console.log('  status:', putResp.status, putResp.statusText);
console.log('  headers:');
for (const [k, v] of putResp.headers.entries()) {
  console.log(`    ${k}: ${v}`);
}
const bodyText = await putResp.text();
console.log('  body:');
console.log(bodyText || '  (empty body)');

if (putResp.ok) {
  console.log('\n  ✅ UPLOAD OK — bug may have self-resolved or needs a different input');
  console.log(`  Cleanup: gsutil rm 'gs://claritypledge-ml-training/sessions/${SESSION_CODE}/${FILE_NAME}'`);
  process.exit(0);
} else {
  console.log('\n  ❌ UPLOAD FAILED — body above is what DevTools was hiding');
  process.exit(2);
}
