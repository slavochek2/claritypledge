import { createClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { transcribeWav } from '../_shared/gemini-transcribe.ts';
import { CLIP_RATE_LIMIT, handleTranscribeClip } from './handler.ts';

// ── Entry point ──────────────────────────────────────────────────────────────
// P1576 Part A: dictation. The composer POSTs one WAV clip (16 kHz mono 16-bit, at most 3
// minutes) with the user's Supabase JWT; this function authenticates it, reserves a per-user
// rate-limit slot, asks Gemini for the text and returns `{ text }`. No row is written, the audio
// is never stored and never logged.
//
// Everything testable lives in handler.ts; this file is env, clients and the two external calls.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Its own budget-capped key under a DISTINCT name (founder decision, 2026-10-26). Edge function
// secrets are scoped to the PROJECT, so reading `GEMINI_API_KEY` or `GEMINI_BATCH_API_KEY` here
// would silently put dictation on the user-facing banner key or the background-room key. The
// separation only exists because the name differs. Register it in
// .private/docs/edge-function-secrets.md (scripts/check-edge-function-secrets.sh fails a deploy
// whose target project is missing it).
const GEMINI_CHAT_VOICE_API_KEY = Deno.env.get('GEMINI_CHAT_VOICE_API_KEY') ?? '';

Deno.serve((req: Request) =>
  handleTranscribeClip(req, {
    corsHeaders: buildCorsHeaders(req),
    envReady: !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && GEMINI_CHAT_VOICE_API_KEY),

    getUserId: async (token) => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user }, error } = await anonClient.auth.getUser(token);
      return error || !user ? null : user.id;
    },

    reserveSlot: async (userId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await serviceClient.rpc('reserve_transcribe_clip_slot', {
        p_user_id: userId,
        p_limit: CLIP_RATE_LIMIT.limit,
        p_window_seconds: CLIP_RATE_LIMIT.windowSeconds,
      });
      // Anything but a non-negative integer is "cannot decide": throw, and the handler refuses.
      if (error || typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
        throw new Error(error?.message ?? 'unexpected limiter result');
      }
      return data;
    },

    transcribe: (wav) => transcribeWav(GEMINI_CHAT_VOICE_API_KEY, wav),
  }),
);
