/**
 * @file create-and-respond-to-letter/index.ts
 * @description P696: Single-step letter response — creates/looks up user, materializes
 *   all responses, generates session, sends notification email. No email round-trip.
 *
 * Eliminates: letter_response_pending table, email verification step, timing races.
 * Pattern: create-and-sign (P527) — one edge function, one verifyOtp on the client.
 *
 * Returns { ok: true, hashedToken } on success.
 * Client calls supabase.auth.verifyOtp({ token_hash: hashedToken, type: 'magiclink' }).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { hashIp, extractClientIp } from '../_shared/hash-ip.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TERMS_VERSIONS = ['v1.2'] as const;
type AcceptedTermsVersion = (typeof ACCEPTED_TERMS_VERSIONS)[number];

function isAcceptedTermsVersion(v: unknown): v is AcceptedTermsVersion {
  return typeof v === 'string' && (ACCEPTED_TERMS_VERSIONS as readonly string[]).includes(v);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

// ── Env ───────────────────────────────────────────────────────────────────────

const APP_URL = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const MAILGUN_BASE =
  MAILGUN_REGION === 'eu'
    ? 'https://api.eu.mailgun.net/v3'
    : 'https://api.mailgun.net/v3';
const FROM = Deno.env.get('MAILGUN_FROM') ?? `Clarity Pledge <letters@${MAILGUN_DOMAIN}>`;

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validationError(): Response {
  return jsonResponse({ error: 'Invalid request. Please check your input and try again.' }, 400);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#002B5C;padding:24px 40px;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Clarity Pledge</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 40px;">
              ${body}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// [FOUNDER DECISION: email copy — notification subject + body]
async function sendNotificationEmail(opts: {
  to: string;
  readerName: string;
}): Promise<void> {
  const firstName = opts.readerName.trim().split(/\s+/)[0] || 'there';
  const subject = 'Your responses have been shared';
  const loginLink = `${APP_URL}/login`;

  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Your responses are saved</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      Your responses have been shared with the letter sender on Clarity Pledge.
    </p>
    <p style="margin:0 0 0;font-size:14px;color:#6b7280;">
      <a href="${escapeHtml(loginLink)}" style="color:#0044CC;">Log in to ClarityPledge</a> to view your account.
    </p>
    <p style="margin:16px 0 0;font-size:11px;color:#d1d5db;">
      Questions? <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
    </p>
  `);

  const text = `Hi ${firstName},\n\nYour responses have been shared with the letter sender on Clarity Pledge.\n\nLog in to ClarityPledge: ${loginLink}\n\nClarity Pledge`;

  const body = new FormData();
  body.append('from', FROM);
  body.append('to', opts.to);
  body.append('subject', subject);
  body.append('html', html);
  body.append('text', text);

  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[create-and-respond-to-letter] Mailgun error:', res.status, err);
    throw new Error(`Mailgun send failed: ${res.status}`);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatingEntry {
  storyId: string;
  rating: number;
}

interface PositionEntry {
  pointId: string;
  position: number;
}

function isValidRatingsArray(arr: unknown): arr is RatingEntry[] {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.storyId === 'string' &&
      UUID_REGEX.test(item.storyId) &&
      typeof item.rating === 'number' &&
      Number.isInteger(item.rating) &&
      item.rating >= 1 &&
      item.rating <= 7,
  );
}

function isValidPositionsArray(arr: unknown): arr is PositionEntry[] {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.pointId === 'string' &&
      UUID_REGEX.test(item.pointId) &&
      typeof item.position === 'number',
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ipHashSecret = Deno.env.get('IP_HASH_SECRET');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[create-and-respond-to-letter] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    if (!ipHashSecret) {
      console.error('[create-and-respond-to-letter] IP_HASH_SECRET not configured');
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Parse + validate input ─────────────────────────────────────────────────

    let reqBody: Record<string, unknown>;
    try {
      reqBody = await req.json() as Record<string, unknown>;
    } catch {
      return validationError();
    }

    const { letterId, name, email, termsAccepted, termsVersion, ratings, positions } = reqBody;

    if (typeof letterId !== 'string' || !UUID_REGEX.test(letterId)) return validationError();
    if (termsAccepted !== true) return validationError();
    if (!isAcceptedTermsVersion(termsVersion)) return validationError();
    if (typeof email !== 'string') return validationError();

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) return validationError();

    if (typeof name !== 'string') return validationError();
    const trimmedName = name.trim().slice(0, 100);
    if (!trimmedName) return validationError();

    if (!isValidRatingsArray(ratings)) return validationError();
    if (!isValidPositionsArray(positions)) return validationError();

    // ── Validate letter ────────────────────────────────────────────────────────
    const { data: letter, error: letterError } = await supabase
      .from('clarity_letters')
      .select('id, status, mode, sender_id')
      .eq('id', letterId)
      .eq('status', 'sealed')
      .eq('mode', 'one-to-many')
      .maybeSingle();

    if (letterError) {
      console.error('[create-and-respond-to-letter] Letter lookup error:', letterError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }
    if (!letter) {
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 400);
    }

    const senderId = letter.sender_id as string;

    // ── Self-send guard ────────────────────────────────────────────────────────
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', senderId)
      .maybeSingle();

    if (senderProfile?.email && senderProfile.email.toLowerCase() === normalizedEmail) {
      return jsonResponse({ error: 'You cannot respond to your own letter.' }, 403);
    }

    // ── Look up user by email (get_auth_user_by_email RPC) ────────────────────
    const { data: authUserRows, error: rpcError } = await supabase.rpc('get_auth_user_by_email', {
      p_email: normalizedEmail,
    });

    if (rpcError) {
      console.error('[create-and-respond-to-letter] get_auth_user_by_email RPC error:', rpcError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    const existingAuthUser = (authUserRows as Array<{ id: string; email: string }> | null)?.[0] ?? null;
    let userId: string;

    if (!existingAuthUser) {
      // ── New user: create auth user + profile ──────────────────────────────
      const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: false,
        user_metadata: { name: trimmedName, avatar_color: avatarColor },
      });

      if (createError || !authData?.user) {
        console.error('[create-and-respond-to-letter] createUser failed:', createError?.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
      }

      userId = authData.user.id;

      let slug = generateSlug(trimmedName) || `user-${Date.now()}`;
      const { data: slugConflict } = await supabase
        .from('profiles')
        .select('slug')
        .eq('slug', slug)
        .maybeSingle();

      if (slugConflict) {
        for (let i = 2; i <= 100; i++) {
          const candidate = `${slug}-${i}`;
          const { data: conflict } = await supabase
            .from('profiles')
            .select('slug')
            .eq('slug', candidate)
            .maybeSingle();
          if (!conflict) { slug = candidate; break; }
        }
      }

      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        email: normalizedEmail,
        name: trimmedName,
        slug,
        avatar_color: avatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: termsVersion,
        pledge_version: 2,
      });

      if (profileError) {
        console.error('[create-and-respond-to-letter] profile insert failed:', profileError.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
      }
    } else {
      // ── Existing user: orphan self-heal if profile missing ────────────────
      userId = existingAuthUser.id;

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        console.error('[create-and-respond-to-letter] profile lookup error:', profileLookupError.message);
      }

      if (!existingProfile) {
        const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const initialName = trimmedName || normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';
        let slug = generateSlug(initialName) || `user-${Date.now()}`;

        const { data: slugConflict } = await supabase
          .from('profiles')
          .select('slug')
          .eq('slug', slug)
          .maybeSingle();

        if (slugConflict) {
          for (let i = 2; i <= 100; i++) {
            const candidate = `${slug}-${i}`;
            const { data: conflict } = await supabase
              .from('profiles')
              .select('slug')
              .eq('slug', candidate)
              .maybeSingle();
            if (!conflict) { slug = candidate; break; }
          }
        }

        const { error: profileInsertError } = await supabase.from('profiles').insert({
          id: userId,
          email: normalizedEmail,
          name: initialName,
          slug,
          avatar_color: avatarColor,
          is_verified: true,
          has_pledged: false,
          accepted_terms_version: termsVersion,
          pledge_version: 2,
        });

        if (profileInsertError) {
          console.error('[create-and-respond-to-letter] orphan profile insert failed:', profileInsertError.message);
          // Non-fatal: continue
        }
      }
    }

    // ── Generate session token (timing equalization + used in both branches) ──
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[create-and-respond-to-letter] generateLink failed:', linkError?.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    const hashedToken = linkData.properties.hashed_token;

    // ── Idempotency check ──────────────────────────────────────────────────────
    const { data: existingDelivery, error: deliveryCheckError } = await supabase
      .from('letter_deliveries')
      .select('id')
      .eq('receiver_profile_id', userId)
      .eq('letter_id', letterId)
      .maybeSingle();

    if (deliveryCheckError) {
      console.error('[create-and-respond-to-letter] idempotency check error:', deliveryCheckError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    if (existingDelivery) {
      // Already completed — return session token so client can still sign in
      return jsonResponse({ ok: true, hashedToken });
    }

    // ── Fetch story snapshots for version_id mapping ───────────────────────────
    const { data: snapshots, error: snapshotError } = await supabase
      .from('letter_story_snapshots')
      .select('story_id, version_id')
      .eq('letter_id', letterId);

    if (snapshotError) {
      console.error('[create-and-respond-to-letter] snapshot lookup error:', snapshotError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    const snapshotMap = new Map<string, string>(
      (snapshots ?? []).map((s: { story_id: string; version_id: string }) => [s.story_id, s.version_id]),
    );

    // ── Insert letter_deliveries ───────────────────────────────────────────────
    const { data: deliveryRow, error: deliveryInsertError } = await supabase
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_profile_id: userId,
        receiver_email: normalizedEmail,
        receiver_name: trimmedName,
        status: 'completed',
        opened_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (deliveryInsertError || !deliveryRow) {
      console.error('[create-and-respond-to-letter] delivery insert error:', deliveryInsertError?.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    const deliveryId = deliveryRow.id as string;

    // ── Insert story_verifications ─────────────────────────────────────────────
    if (ratings.length > 0) {
      const verificationRows = ratings.map((r, idx) => ({
        story_id: r.storyId,
        version_id: snapshotMap.get(r.storyId) ?? null,
        speaker_id: senderId,
        listener_id: userId,
        listener_rating: r.rating,
        speaker_rating: 0,
        source: 'letter',
        verified: false,
        session_id: null,
        sort_order: idx,
      }));

      const { error: verificationError } = await supabase
        .from('story_verifications')
        .insert(verificationRows);

      if (verificationError) {
        console.error('[create-and-respond-to-letter] story_verifications insert error:', verificationError.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }

    // ── Insert letter_point_responses ──────────────────────────────────────────
    if (positions.length > 0) {
      const pointResponseRows = positions.map((p) => ({
        delivery_id: deliveryId,
        point_id: p.pointId,
        position: String(p.position),
      }));

      const { error: pointResponseError } = await supabase
        .from('letter_point_responses')
        .insert(pointResponseRows);

      if (pointResponseError) {
        console.error('[create-and-respond-to-letter] letter_point_responses insert error:', pointResponseError.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }

    // ── Insert terms_acceptances ───────────────────────────────────────────────
    const clientIp = extractClientIp(req);
    const ipHash = await hashIp(clientIp, ipHashSecret);
    const userAgent = req.headers.get('user-agent') ?? 'unknown';

    const { error: termsError } = await supabase
      .from('terms_acceptances')
      .upsert(
        {
          user_id: userId,
          terms_version: termsVersion,
          ip_hash: ipHash,
          user_agent: userAgent,
        },
        { onConflict: 'user_id,terms_version', ignoreDuplicates: true },
      );

    if (termsError) {
      console.error('[create-and-respond-to-letter] terms_acceptances insert error:', termsError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
    }

    // ── Fire-and-forget notification email ────────────────────────────────────
    if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
      sendNotificationEmail({ to: normalizedEmail, readerName: trimmedName }).catch(
        (err) => console.error('[create-and-respond-to-letter] notification email failed (non-fatal):', err),
      );
    }

    // ── Success ───────────────────────────────────────────────────────────────
    return jsonResponse({ ok: true, hashedToken });

  } catch (err) {
    console.error('[create-and-respond-to-letter] Unexpected error:', err);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
