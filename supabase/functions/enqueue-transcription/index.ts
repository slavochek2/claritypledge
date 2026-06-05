/**
 * P902 trigger bridge: transcription_jobs INSERT webhook → Cloud Tasks enqueue.
 *
 * pg_net cannot mint Google OAuth tokens, so this function holds the only
 * long-lived Google credential in the chain (tx-enqueuer SA key, Supabase
 * secret). It exchanges it for a short-lived access token and creates a
 * Cloud Task that invokes transcribe-session /transcribe-async with a
 * Google-signed OIDC token (tx-task-invoker SA) — key-free downstream.
 *
 * Security (P858 mitigation #3): the task body carries job_id ONLY. Session
 * fields always come from the DB via the atomic claim's RETURNING.
 *
 * Auth in: static x-webhook-secret header set on the DB webhook config,
 * compared against the WEBHOOK_SECRET Supabase secret. Deployed with
 * --no-verify-jwt (pg_net carries no user JWT).
 */
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5';

const GCP_PROJECT = 'gen-lang-client-0869694595';
const LOCATION = 'us-east4';
const QUEUE = 'transcribe-jobs';
const INVOKER_SA = `tx-task-invoker@${GCP_PROJECT}.iam.gserviceaccount.com`;
const SERVICE_URL = Deno.env.get('TRANSCRIBE_SERVICE_URL')
  ?? 'https://transcribe-session-iqrzlynw4a-uk.a.run.app';

async function googleAccessToken(): Promise<string> {
  const rawKey = Deno.env.get('GCP_ENQUEUER_SA_KEY');
  if (!rawKey) throw new Error('GCP_ENQUEUER_SA_KEY secret not set');
  const sa = JSON.parse(rawKey);
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  // Supabase DB webhook payload: { type: 'INSERT', table, record: {...}, ... }
  const payload = await req.json();
  const jobId = payload?.record?.id;
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/.test(jobId)) {
    return new Response(JSON.stringify({ error: 'missing or invalid record.id' }), { status: 400 });
  }

  const token = await googleAccessToken();
  const parent = `projects/${GCP_PROJECT}/locations/${LOCATION}/queues/${QUEUE}`;
  // Task name = job id → Cloud Tasks dedupes duplicate webhook fires for free.
  const taskRes = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: {
        name: `${parent}/tasks/job-${jobId}`,
        httpRequest: {
          httpMethod: 'POST',
          url: `${SERVICE_URL}/transcribe-async`,
          headers: { 'Content-Type': 'application/json' },
          body: btoa(JSON.stringify({ job_id: jobId })),
          oidcToken: { serviceAccountEmail: INVOKER_SA, audience: SERVICE_URL },
        },
      },
    }),
  });

  if (taskRes.status === 409) {
    // ALREADY_EXISTS — duplicate webhook fire; the first task stands.
    return new Response(JSON.stringify({ enqueued: false, duplicate: true }), { status: 200 });
  }
  if (!taskRes.ok) {
    const detail = await taskRes.text();
    console.error(`CreateTask failed for job ${jobId}: ${taskRes.status} ${detail}`);
    return new Response(JSON.stringify({ error: 'CreateTask failed', status: taskRes.status }), { status: 502 });
  }
  return new Response(JSON.stringify({ enqueued: true, job_id: jobId }), { status: 200 });
});
