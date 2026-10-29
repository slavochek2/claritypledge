import { createClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { transcribeWav } from '../_shared/gemini-transcribe.ts';
import { createGcsSigner, deleteObject, downloadObject, downloadObjectCapped, putHeaders, readObjectHead, signUrl, urlSignerFor } from './gcs.ts';
import { handleChatVoice, MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES, PLAYBACK_TTL_SECONDS, UPLOAD_TTL_SECONDS, type CommitResult, type PlaybackTarget, type PostCheck, type UploadCheck } from './handler.ts';
import { runSweep, runTranscription, type JobDeps } from './job.ts';

// ── Entry point ──────────────────────────────────────────────────────────────
// P1576 Part B: voice notes. Everything testable lives in handler.ts / job.ts / gcs.ts; this file
// is env, clients and the external calls (Postgres RPCs, GCS, Gemini).
//
// Who can do what is decided by the DATABASE, through service-role-only functions that take the
// caller's id (chat_voice_check_post, chat_commit_voice_note, chat_voice_playback_target). They run
// the same membership / block / thread rules as send_chat_message, so there is one rule, not two.
//
// Secrets (registered per P834 in .private/docs/edge-function-secrets.md):
//   GEMINI_CHAT_VOICE_API_KEY  its own budget-capped key. A DISTINCT NAME on purpose: edge secrets are
//                              scoped to the project, and GEMINI_API_KEY / GEMINI_BATCH_API_KEY are
//                              already other workloads' fuses.
//   GCS_CHAT_VOICE_SERVICE_ACCOUNT_KEY  the voice bucket's OWN signing service account (founder, 2026-10-28): signs the
//                              URLs below and authorises the server-side reads and deletes; holds objectUser on this
//                              bucket only, so it can reach no other bucket. Never the shared GCS_SERVICE_ACCOUNT_KEY.
//   CHAT_VOICE_CRON_SECRET     the x-cron-secret the pg_cron tick sends for mode `sweep` (vault: chat_voice_cron_secret).
//                              Its own name on purpose: the project-wide CRON_SECRET is read by other functions, and a
//                              leak of any copy would then open every one of their sweeps.
//   GCS_CHAT_VOICE_BUCKET      optional, default claritypledge-chat-voice (a PRIVATE bucket).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GCS_SERVICE_ACCOUNT_KEY = Deno.env.get('GCS_CHAT_VOICE_SERVICE_ACCOUNT_KEY') ?? '';
const GEMINI_CHAT_VOICE_API_KEY = Deno.env.get('GEMINI_CHAT_VOICE_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CHAT_VOICE_CRON_SECRET') ?? '';
const GCS_BUCKET = Deno.env.get('GCS_CHAT_VOICE_BUCKET') ?? 'claritypledge-chat-voice';

const UPLOAD_RANGE = `${MIN_UPLOAD_BYTES},${MAX_UPLOAD_BYTES}`;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const service = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let signerPromise: ReturnType<typeof createGcsSigner> | null = null;
const signer = () => (signerPromise ??= createGcsSigner(JSON.parse(GCS_SERVICE_ACCOUNT_KEY), GCS_BUCKET));
const urlSigner = () => signer().then((s) => urlSignerFor(s));

type RpcError = { code?: string; message?: string } | null;

async function rpc<T>(name: string, args: Record<string, unknown>, tolerate: string[] = []): Promise<{ data: T | null; code: string | null }> {
  const { data, error } = (await service.rpc(name, args)) as { data: T | null; error: RpcError };
  if (error) {
    if (error.code && tolerate.includes(error.code)) return { data: null, code: error.code };
    throw new Error(`${name} failed: ${error.code ?? ''} ${error.message ?? ''}`.trim());
  }
  return { data, code: null };
}

const jobDeps: JobDeps = {
  claim: async (messageId) => (await rpc<string>('chat_voice_claim_transcription', { p_message: messageId })).data,
  download: async (objectKey) => downloadObject(await urlSigner(), objectKey),
  transcribe: (wav) => transcribeWav(GEMINI_CHAT_VOICE_API_KEY, wav),
  finish: async (messageId, result) => {
    await rpc('chat_voice_finish_transcription', {
      p_message: messageId, p_ok: result.ok, p_text: result.ok ? result.text : null, p_final: !result.ok && result.final === true,
    });
  },
};

Deno.serve((req: Request) =>
  handleChatVoice(req, {
    corsHeaders: buildCorsHeaders(req),
    envReady: !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && GCS_SERVICE_ACCOUNT_KEY &&
      GEMINI_CHAT_VOICE_API_KEY),
    cronSecret: CRON_SECRET,
    newId: () => crypto.randomUUID(),

    getUserId: async (token) => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user }, error } = await anonClient.auth.getUser(token);
      return error || !user ? null : user.id;
    },

    checkPost: async (userId, conversationId): Promise<PostCheck> => {
      const { code } = await rpc('chat_voice_check_post', { p_uid: userId, p_conversation: conversationId }, ['42501', '22023']);
      return code === '42501' ? 'forbidden' : code === '22023' ? 'unsupported' : 'ok';
    },

    reserveUpload: async (userId, conversationId): Promise<UploadCheck> => {
      const { code } = await rpc('chat_voice_reserve_upload', { p_uid: userId, p_conversation: conversationId }, ['42501', '22023', '54000']);
      return code === '42501' ? 'forbidden' : code === '22023' ? 'unsupported' : code === '54000' ? 'rate' : 'ok';
    },

    signUpload: async (objectKey) => {
      // Content type, size range and create-only are all signed: storage refuses a PUT that differs, so
      // the 2-minute limit cannot be exceeded and the object cannot be replaced after commit.
      const headers = putHeaders(UPLOAD_RANGE);
      const uploadUrl = await signUrl(await signer(), {
        method: 'PUT', objectPath: objectKey, extensionHeaders: headers, expiresSeconds: UPLOAD_TTL_SECONDS,
      });
      return { uploadUrl, headers };
    },

    readObjectHead: async (objectKey) => readObjectHead(await urlSigner(), objectKey),
    readObject: async (objectKey) => downloadObjectCapped(await urlSigner(), objectKey, MAX_UPLOAD_BYTES),
    isKeyCommitted: async (objectKey) =>
      (await rpc<boolean>('chat_voice_key_committed', { p_object_key: objectKey })).data === true,

    commitMessage: async (input): Promise<CommitResult> => {
      const { data, code } = await rpc<Record<string, unknown>>('chat_commit_voice_note', {
        p_uid: input.userId,
        p_conversation: input.conversationId,
        p_object_key: input.objectKey,
        p_duration_ms: input.durationMs,
        p_thread_root: input.threadRootId,
        p_reply_to: input.replyToId,
        p_client_id: input.clientId,
        p_waveform: input.waveform,
      }, ['42501', '22023', '54000']);
      if (code === '54000') return { kind: 'rate' };
      if (code === '22023') return { kind: 'unsupported' };
      if (code === '42501' || !data) return { kind: 'forbidden' };
      return { kind: 'ok', message: data };
    },

    playbackTarget: async (userId, messageId): Promise<PlaybackTarget> => {
      const { data, code } = await rpc<string>('chat_voice_playback_target', { p_uid: userId, p_message: messageId }, ['42501']);
      if (code === '42501') return { kind: 'forbidden' };
      return data ? { kind: 'ok', objectKey: data } : { kind: 'gone' };
    },

    signPlayback: async (objectKey) =>
      signUrl(await signer(), { method: 'GET', objectPath: objectKey, expiresSeconds: PLAYBACK_TTL_SECONDS }),

    // Keeps the isolate alive for the transcript job after the response has been sent. The promise
    // is already running, so where waitUntil is absent the job still starts; the sweep is the net.
    background: (task) => {
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      runtime?.waitUntil?.(task);
    },
    transcribeMessage: (messageId) => runTranscription(messageId, jobDeps),

    sweep: () =>
      runSweep({
        failExhausted: async () => (await rpc<number>('chat_voice_fail_exhausted', {})).data ?? 0,
        retryCandidates: async (limit) => (await rpc<string[]>('chat_voice_retry_candidates', { p_limit: limit })).data ?? [],
        runJob: (id) => runTranscription(id, jobDeps),
        // due paths only, soonest first, on the database clock: a path that failed earlier waits out its backoff
        purgeBatch: async (limit) => (await rpc<string[]>('chat_voice_purge_due', { p_limit: limit })).data ?? [],
        deleteObject: async (path) => deleteObject(await urlSigner(), path),
        purgeDone: async (paths) => {
          const { error } = await service.from('chat_voice_purge').delete().in('path', paths);
          if (error) throw new Error(`purge queue delete failed: ${error.message}`);
        },
        purgeFailed: async (path) => { await rpc('chat_voice_purge_failed', { p_path: path }); },
      }),
  })
);
