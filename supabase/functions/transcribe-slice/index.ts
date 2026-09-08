import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { handleTranscribeSlice } from './handler.ts';

// ── Entry point ──────────────────────────────────────────────────────────────
// P1236 Decision 2: the live transcription path is an edge function, not the GCS
// signed-URL route. The client POSTs one 5-second WAV slice with its Supabase user JWT;
// this function authenticates it, resolves the caller's membership AND consent with the
// service role, calls Gemini, de-duplicates the lead-in overlap against that member's own
// previous message, and inserts ONE row with a member_id it derived itself.
//
// The audio never reaches a client-named member, and the client never names one. That is
// strictly stronger than enqueue-transcription's "the task body carries job_id ONLY"
// precedent the Security Review pointed at.
//
// Everything testable lives in handler.ts / validate.ts / dedup.ts; this file is env,
// clients and the one external call.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Decision 8: the BATCH project key (P1162 split prod-interactive from batch precisely so
// a background workload cannot fuse the user-facing one). A runaway room must not take
// /chat and banner generation down with it.
//
// A DISTINCT VARIABLE NAME, and this is load-bearing rather than tidy. Supabase edge
// function secrets are scoped to the PROJECT, not to a function: prod's `GEMINI_API_KEY`
// is already the prod-interactive key (EUR 50 cap) that generate-banner and
// generate-event-banner read. Reading that same name here would silently put every live
// transcription slice on the user-facing fuse — the exact coupling P1162 created two
// projects to prevent — and nothing would report it until a runaway room took banner
// generation down with it. The separation only exists if the name differs.
//
// Registered per P834 in .private/docs/edge-function-secrets.md;
// scripts/check-edge-function-secrets.sh fails any deploy whose target project is missing it.
const GEMINI_API_KEY = Deno.env.get('GEMINI_BATCH_API_KEY') ?? '';

const GEMINI_MODEL = 'gemini-3.5-transcribe';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Decision 8 asked for a fixed system instruction with zero interpolated variables. This
 * model does not take one AT ALL — `gemini-3.5-transcribe` rejects `systemInstruction` with
 * HTTP 400 `"Developer instruction is not enabled for this model"`. Measured against the
 * live API 2026-09-08, after every slice from a real phone came back a 502.
 *
 * So the request is **audio and nothing else**. That satisfies Decision 8 more strongly than
 * the instruction ever did: there is no prompt for a participant's speech to be interpolated
 * into, because there is no prompt. `display_name`, prior `transcribe_messages.text` and
 * `transcribe_rooms.code` remain N/A by construction rather than by discipline.
 *
 * An instruction as a leading text PART also returns 200, and was rejected: it puts
 * instruction text in the same content stream as untrusted participant audio for no measured
 * benefit — both shapes returned the identical transcript on the same 5-second sample.
 */

function toBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) on ~160 KB blows the argument limit.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve((req: Request) =>
  handleTranscribeSlice(req, {
    corsHeaders: buildCorsHeaders(req),
    envReady: !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && GEMINI_API_KEY),
    now: () => new Date(),

    getUserId: async (token) => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user }, error } = await anonClient.auth.getUser(token);
      return error || !user ? null : user.id;
    },

    getMembership: async (roomId, userId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: member, error: memberError } = await serviceClient
        .from('transcribe_room_members')
        .select('id, consent_given_at, slice_count')
        .eq('room_id', roomId)
        .eq('profile_id', userId)
        .maybeSingle();
      if (memberError || !member) return null;
      const { data: room, error: roomError } = await serviceClient
        .from('transcribe_rooms')
        .select('created_at, ended_at')
        .eq('id', roomId)
        .maybeSingle();
      if (roomError || !room) return null;
      return {
        memberId: member.id,
        roomCreatedAt: room.created_at,
        roomEndedAt: room.ended_at ?? null,
        consentGivenAt: member.consent_given_at ?? null,
        sliceCount: member.slice_count ?? 0,
      };
    },

    countActiveRooms: async (userId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // !inner so the filter on the joined room actually restricts the member rows;
      // a plain embed would return every membership with a null room and count them all.
      const { count, error } = await serviceClient
        .from('transcribe_room_members')
        .select('id, transcribe_rooms!inner(ended_at)', { count: 'exact', head: true })
        .eq('profile_id', userId)
        .is('transcribe_rooms.ended_at', null);
      // Fail CLOSED on a counting error: an unreadable count is not evidence of zero.
      if (error) return Number.MAX_SAFE_INTEGER;
      return count ?? 0;
    },

    endRoom: async (roomId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await serviceClient
        .from('transcribe_rooms')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', roomId)
        .is('ended_at', null);
    },

    transcribe: async (audio) => {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          // The API's native audio content part — never base64 embedded into a text
          // prompt (Security Review, AI Prompt Security). No systemInstruction: see above.
          contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data: toBase64(audio) } }] }],
        }),
      });
      if (!response.ok) {
        throw new Error(`Gemini returned ${response.status}`);
      }
      const payload = await response.json();
      // THE TRANSCRIPT IS NOT AT `parts[0].text`. A transcription model returns it as
      // `parts[0].audioTranscription.text`, and reading the wrong field is the worst
      // possible bug here: it does not throw, it yields undefined, and undefined is
      // indistinguishable from silence — so every slice would have been recorded as "the
      // room was quiet" and no error would ever have surfaced. Measured against the live
      // API 2026-09-08; `.text` is kept as a fallback in case the shape ever changes back.
      //
      // An empty candidate IS a legitimate result: Finding 6 measured Gemini returning
      // nothing on 16 of 43 silent slices rather than hallucinating filler. Collapsing
      // that into a throw would turn every silence into a 502.
      const part = payload?.candidates?.[0]?.content?.parts?.[0];
      const text = part?.audioTranscription?.text ?? part?.text;
      return typeof text === 'string' ? text.trim() : '';
    },

    getPreviousText: async (memberId) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // Ordered on spoken_at, which is DB-assigned — served by the (member_id, spoken_at)
      // index this feature's migration adds.
      const { data, error } = await serviceClient
        .from('transcribe_messages')
        .select('text')
        .eq('member_id', memberId)
        .order('spoken_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data.text ?? null;
    },

    insertMessage: async (roomId, memberId, text) => {
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // One RPC, one transaction: the message row and the slice counter move together or
      // not at all (Decision 6 ceiling 2). Two separate writes would let a failed insert
      // leave the counter advanced, or a failed bump leave the ceiling unenforced.
      // spoken_at is NOT passed — it is the column's own DEFAULT now().
      const { error } = await serviceClient.rpc('record_transcribe_slice', {
        p_room_id: roomId,
        p_member_id: memberId,
        p_text: text,
      });
      if (error) throw new Error(error.message);
    },
  }),
);
