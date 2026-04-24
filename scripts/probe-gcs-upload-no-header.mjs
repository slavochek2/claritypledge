#!/usr/bin/env node
/**
 * Hypothesis test for the layer-4 GCS 400 Bad Request bug.
 *
 * Theory: the GCP Cloud Function signer for `claritypledge-ml-training` does
 * NOT include `x-goog-content-length-range` in the signed canonical request.
 * The P802 client-side fix added that header to the PUT, which GCS now
 * rejects as `MalformedSecurityHeader` because unsigned headers are invalid
 * in signed-URL requests.
 *
 * This probe repeats the same flow as probe-gcs-upload.mjs but OMITS the
 * `x-goog-content-length-range` header. If it succeeds, Option C (drop the
 * header from the client) is a valid fix.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const envPath = resolve(REPO_ROOT, '.env.local');
const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const PROD_SUPABASE_URL = 'https://besjtuodziykmjidubzw.supabase.co';

const authResp = await fetch(`${PROD_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': env.PROD_SUPABASE_ANON_KEY },
  body: JSON.stringify({ email: env.PROD_TEST_AGENT_EMAIL, password: env.PROD_TEST_AGENT_PASSWORD }),
});
const { access_token } = await authResp.json();

const SESSION_CODE = 'P809CB';
const FILE_NAME = '_dev_canary_no_header.webm';
const CONTENT_TYPE = 'audio/webm;codecs=opus';

const signResp = await fetch(`${PROD_SUPABASE_URL}/functions/v1/gcs-signed-url`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` },
  body: JSON.stringify({ sessionCode: SESSION_CODE, fileName: FILE_NAME, contentType: CONTENT_TYPE }),
});
const { uploadUrl } = await signResp.json();

console.log('PUT without x-goog-content-length-range header...');
const blob = new Uint8Array(100);
const putResp = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': CONTENT_TYPE }, // NOTE: no x-goog-content-length-range
  body: blob,
});

console.log('  status:', putResp.status, putResp.statusText);
const bodyText = await putResp.text();
if (bodyText) console.log('  body:', bodyText);

if (putResp.ok) {
  console.log('\n  ✅ PUT succeeded without the header — Option C is viable');
  console.log(`  Cleanup: gsutil rm 'gs://claritypledge-ml-training/sessions/${SESSION_CODE}/${FILE_NAME}'`);
  process.exit(0);
} else {
  console.log('\n  ❌ PUT still failed — header removal is not sufficient');
  process.exit(2);
}
