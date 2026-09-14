/**
 * P1307 Decision 5: transcribe_room_transcription_jobs INSERT → Cloud Tasks enqueue.
 *
 * The AFTER INSERT trigger (transcribe_room_job_dispatch, migration 20260914120300) posts
 * `{ job_id }` here through pg_net. pg_net cannot mint Google OAuth tokens, so this function
 * exchanges the enqueuer service-account key for a short-lived access token and creates a
 * Cloud Task that invokes the transcribe-room-batch Cloud Run service's POST /process with a
 * Google-signed OIDC token. Same chain as enqueue-transcription (P902), different queue and
 * target: the room engine is Gemini per member, never the Whisper/diarization GPU worker.
 *
 * Security:
 *   - The task body carries job_id ONLY — no room code, no names, no text. The worker reads
 *     everything else from the database through its atomic claim.
 *   - Auth in: `x-cron-secret` compared against CRON_SECRET. `Authorization` carries the
 *     project anon key only to satisfy the gateway's JWT check (same arrangement as
 *     dispatch-event-emails; see migration 20260907170000).
 *   - Task name = job id, so a duplicate trigger fire is deduplicated by Cloud Tasks.
 */
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5';

const GCP_PROJECT = 'gen-lang-client-0869694595';
const LOCATION = 'us-east4';
const QUEUE = Deno.env.get('TRANSCRIBE_ROOM_QUEUE') ?? 'transcribe-room-jobs';
const INVOKER_SA = `tx-task-invoker@${GCP_PROJECT}.iam.gserviceaccount.com`;
const SERVICE_URL = Deno.env.get('TRANSCRIBE_ROOM_BATCH_URL') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Constant-time string comparison, so the secret check leaks nothing through timing. */
function secretMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  // Status only: the token endpoint's error body can echo request details.
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return (await res.json()).access_token;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!secretMatches(req.headers.get('x-cron-secret'), CRON_SECRET)) return json(401, { error: 'Unauthorized' });
  if (!SERVICE_URL) {
    console.error('[enqueue-room-transcription] TRANSCRIBE_ROOM_BATCH_URL not set');
    return json(500, { error: 'Service temporarily unavailable' });
  }

  let jobId: unknown;
  try {
    jobId = (await req.json())?.job_id;
  } catch {
    return json(400, { error: 'Invalid request body' });
  }
  if (typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) {
    return json(400, { error: 'missing or invalid job_id' });
  }

  try {
    const token = await googleAccessToken();
    const parent = `projects/${GCP_PROJECT}/locations/${LOCATION}/queues/${QUEUE}`;
    const taskRes = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: {
          name: `${parent}/tasks/room-job-${jobId}`,
          httpRequest: {
            httpMethod: 'POST',
            url: `${SERVICE_URL}/process`,
            headers: { 'Content-Type': 'application/json' },
            body: btoa(JSON.stringify({ job_id: jobId })),
            oidcToken: { serviceAccountEmail: INVOKER_SA, audience: SERVICE_URL },
          },
        },
      }),
    });

    if (taskRes.status === 409) return json(200, { enqueued: false, duplicate: true });
    if (!taskRes.ok) {
      console.error(`[enqueue-room-transcription] CreateTask failed for job ${jobId}: ${taskRes.status}`);
      return json(502, { error: 'CreateTask failed', status: taskRes.status });
    }
    return json(200, { enqueued: true, job_id: jobId });
  } catch (err) {
    // The job row stays 'pending'; the worker's /sweep drains it.
    console.error(`[enqueue-room-transcription] enqueue failed for job ${jobId}:`, err instanceof Error ? err.message : err);
    return json(502, { error: 'enqueue failed' });
  }
});
