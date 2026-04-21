/**
 * @file confirm-letter-response/index.ts
 * @description P684 Step 2: After magic link authenticates the user, read the pending
 *   row and atomically create letter_deliveries + story_verifications +
 *   letter_point_responses + terms_acceptances.
 *
 * Security properties:
 * - Two-client pattern: user-JWT client for getUser() only; service-role client for
 *   all reads of letter_response_pending and all writes.
 * - Hijack check: pending.user_id must match auth.uid() — mismatches → 403 + console.error.
 * - Idempotency: if delivery row already exists → return { ok: true } immediately.
 * - All response data comes from the server-side pending row (never from request body).
 * - ON CONFLICT DO NOTHING for terms_acceptances (idempotent across flows).
 *
 * Auth: This function IS auth-gated. The Authorization header carries the user JWT
 * after verifyOtp completes. Do NOT deploy with --no-verify-jwt.
 *
 * References:
 * - Two-client pattern: create-and-open-letter/index.ts
 * - IP hash helper: _shared/hash-ip.ts (P683)
 * - Pending row schema: migrations/20260412000002_p684_public_reading_and_pending.sql
 * - story_verifications insert shape: migrations/20260412000001_p684_anon_rpc_auth_guard.sql line 101
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { hashIp, extractClientIp } from '../_shared/hash-ip.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Pending row type ──────────────────────────────────────────────────────────

interface RatingEntry {
  storyId: string;
  rating: number;
}

interface PositionEntry {
  pointId: string;
  position: number;
}

interface PendingRow {
  user_id: string;
  letter_id: string;
  name: string;
  ratings_json: RatingEntry[];
  positions_json: PositionEntry[];
  terms_version: string;
  expires_at: string;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Env guard ──────────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ipHashSecret = Deno.env.get('IP_HASH_SECRET') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[confirm-letter-response] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    // ── Step 1: Parse and validate body ───────────────────────────────────────
    let body: { letterId?: unknown };
    try {
      body = await req.json() as { letterId?: unknown };
    } catch {
      return jsonResponse({ error: 'invalid' }, 400, corsHeaders);
    }

    const { letterId } = body;

    if (typeof letterId !== 'string' || !UUID_REGEX.test(letterId)) {
      return jsonResponse({ error: 'invalid' }, 400, corsHeaders);
    }

    // ── Step 2: User-JWT client — getUser() only, zero writes ─────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders);
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: getUserError } = await userClient.auth.getUser();

    if (getUserError || !user) {
      return jsonResponse({ error: 'unauthenticated' }, 401, corsHeaders);
    }

    // ── Service-role client — all reads/writes ─────────────────────────────────
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Step 3: Look up pending row ────────────────────────────────────────────
    const { data: pending, error: pendingError } = await serviceClient
      .from('letter_response_pending')
      .select('user_id, letter_id, name, ratings_json, positions_json, terms_version, expires_at')
      .eq('user_id', user.id)
      .eq('letter_id', letterId)
      .maybeSingle();

    if (pendingError) {
      console.error('[confirm-letter-response] Pending row lookup error:', pendingError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    if (!pending) {
      return jsonResponse({ error: 'expired' }, 410, corsHeaders);
    }

    const pendingRow = pending as PendingRow;

    // Check expiry
    if (new Date(pendingRow.expires_at) < new Date()) {
      return jsonResponse({ error: 'expired' }, 410, corsHeaders);
    }

    // ── Step 4: Hijack check ───────────────────────────────────────────────────
    // Should never trigger (we query by user_id), but defense-in-depth.
    if (pendingRow.user_id !== user.id) {
      console.error(
        '[confirm-letter-response] HIJACK ATTEMPT: pending.user_id',
        pendingRow.user_id,
        '!== auth.uid()',
        user.id,
        'for letterId',
        letterId,
      );
      return jsonResponse({ error: 'hijack' }, 403, corsHeaders);
    }

    // ── Step 5: Idempotency check ──────────────────────────────────────────────
    const { data: existingDelivery, error: deliveryCheckError } = await serviceClient
      .from('letter_deliveries')
      .select('id')
      .eq('receiver_profile_id', user.id)
      .eq('letter_id', letterId)
      .maybeSingle();

    if (deliveryCheckError) {
      console.error('[confirm-letter-response] Delivery idempotency check error:', deliveryCheckError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    if (existingDelivery) {
      // Already confirmed — safe for double-clicks and browser back-nav
      return jsonResponse({ ok: true }, 200, corsHeaders);
    }

    // ── Step 6: Look up letter metadata for story_verifications ───────────────
    // Need sender_id (speaker_id) and per-story version_id from letter_story_snapshots.
    const { data: letter, error: letterError } = await serviceClient
      .from('clarity_letters')
      .select('id, sender_id')
      .eq('id', letterId)
      .maybeSingle();

    if (letterError || !letter) {
      console.error('[confirm-letter-response] Letter lookup error:', letterError?.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const senderId = letter.sender_id as string;

    // Fetch story snapshots to resolve version_id per story
    const { data: snapshots, error: snapshotError } = await serviceClient
      .from('letter_story_snapshots')
      .select('story_id, version_id')
      .eq('letter_id', letterId);

    if (snapshotError) {
      console.error('[confirm-letter-response] Snapshot lookup error:', snapshotError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const snapshotMap = new Map<string, string>(
      (snapshots ?? []).map((s: { story_id: string; version_id: string }) => [s.story_id, s.version_id]),
    );

    // ── Step 7a: Insert letter_deliveries ─────────────────────────────────────
    // invitation_token has DEFAULT gen_random_uuid() so we omit it for one-to-many.
    // opened_at = now() (reader just confirmed); completed_at = now() (inline submit).
    const { data: deliveryRow, error: deliveryInsertError } = await serviceClient
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_profile_id: user.id,
        receiver_email: user.email,
        receiver_name: pendingRow.name,
        status: 'completed',
        opened_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (deliveryInsertError || !deliveryRow) {
      console.error('[confirm-letter-response] Delivery insert error:', deliveryInsertError?.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const deliveryId = deliveryRow.id as string;

    // ── Step 7b: Insert story_verifications from ratings_json ─────────────────
    // Mirrors submit_rating_by_token: source='letter', verified=false, session_id=NULL.
    // speaker_rating=0 (sender not rating in this flow).
    const ratings = pendingRow.ratings_json as RatingEntry[];

    if (ratings.length > 0) {
      const verificationRows = ratings.map((r, idx) => ({
        story_id: r.storyId,
        version_id: snapshotMap.get(r.storyId) ?? null,
        speaker_id: senderId,
        listener_id: user.id,
        listener_rating: r.rating,
        speaker_rating: 0,
        source: 'letter',
        verified: false,
        session_id: null,
        sort_order: idx,
      }));

      const { error: verificationInsertError } = await serviceClient
        .from('story_verifications')
        .insert(verificationRows);

      if (verificationInsertError) {
        console.error('[confirm-letter-response] story_verifications insert error:', verificationInsertError.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
      }
    }

    // ── Step 7c: Insert letter_point_responses from positions_json ────────────
    // positions_json stores POSITION_VALUES numeric values (-3..3) set by the client
    // (letter-response-confirm-page.tsx). Convert back to PositionType labels before
    // storing — letter_point_responses.position is TEXT and the results page casts it
    // back to PositionType, so it must contain "agree" not "2".
    const NUMERIC_TO_POSITION_TYPE = new Map<number, string>([
      [-3, 'strongly_disagree'],
      [-2, 'disagree'],
      [-1, 'somewhat_disagree'],
      [0, 'unsure'],
      [1, 'somewhat_agree'],
      [2, 'agree'],
      [3, 'strongly_agree'],
    ]);

    const positions = pendingRow.positions_json as PositionEntry[];

    if (positions.length > 0) {
      const pointResponseRows = positions.map((p) => {
        const positionLabel = NUMERIC_TO_POSITION_TYPE.get(p.position as number);
        if (!positionLabel) {
          console.error('[confirm-letter-response] unknown numeric position value:', p.position);
        }
        return {
          delivery_id: deliveryId,
          point_id: p.pointId,
          position: positionLabel ?? String(p.position),
        };
      });

      const { error: pointResponseInsertError } = await serviceClient
        .from('letter_point_responses')
        .insert(pointResponseRows);

      if (pointResponseInsertError) {
        console.error('[confirm-letter-response] letter_point_responses insert error:', pointResponseInsertError.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
      }

      // ── Step 7c.2: P708 dual-write — upsert point_positions (live display store) ──
      // NUMERIC_TO_POSITION_TYPE already declared above — reuse it here.
      // serviceClient bypasses RLS (SECURITY DEFINER context) — user authenticated via magic link.
      // Non-fatal: log but do not block — staging write above already succeeded.

      const pointPositionRows = positions
        .map((p) => ({
          point_id: p.pointId,
          user_id: user.id,
          position: NUMERIC_TO_POSITION_TYPE.get(p.position as number),
        }))
        .filter((r): r is { point_id: string; user_id: string; position: string } => r.position !== undefined);

      if (pointPositionRows.length > 0) {
        const { error: ppUpsertError } = await serviceClient
          .from('point_positions')
          .upsert(pointPositionRows, { onConflict: 'point_id,user_id' });

        if (ppUpsertError) {
          console.error('[confirm-letter-response] point_positions upsert error:', ppUpsertError.message);
          // Non-fatal: do not return error — staging write already succeeded.
        }
      }
    }

    // ── Step 7d: Insert terms_acceptances ─────────────────────────────────────
    // ON CONFLICT DO NOTHING — user may already have accepted this terms version
    // via a prior flow (e.g., one-to-one letter acceptance).
    const clientIp = extractClientIp(req);
    const ipHash = await hashIp(clientIp, ipHashSecret);
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const { error: termsInsertError } = await serviceClient
      .from('terms_acceptances')
      .upsert(
        {
          user_id: user.id,
          terms_version: pendingRow.terms_version,
          ip_hash: ipHash,
          user_agent: userAgent,
        },
        { onConflict: 'user_id,terms_version', ignoreDuplicates: true },
      );

    if (termsInsertError) {
      console.error('[confirm-letter-response] terms_acceptances insert error:', termsInsertError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    // ── Step 8: Delete pending row ─────────────────────────────────────────────
    const { error: deleteError } = await serviceClient
      .from('letter_response_pending')
      .delete()
      .eq('user_id', user.id)
      .eq('letter_id', letterId);

    if (deleteError) {
      // Non-fatal: expired rows are cleaned up by the cleanup job anyway.
      // The delivery row is committed; returning ok is correct.
      console.error('[confirm-letter-response] Pending row delete error (non-fatal):', deleteError.message);
    }

    // ── Step 9: Return success ─────────────────────────────────────────────────
    return jsonResponse({ ok: true }, 200, corsHeaders);

  } catch (err) {
    console.error('[confirm-letter-response] Unexpected error:', err);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
  }
});
