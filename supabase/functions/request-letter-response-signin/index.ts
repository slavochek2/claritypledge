/**
 * @file request-letter-response-signin/index.ts
 * @description P684 Step 1: Validate form submission → create/look-up auth user →
 *   mint magic link → write letter_response_pending row → send branded email.
 *
 * Security properties:
 * - Unified response (new + existing account): { ok: true }. Closes enumeration oracle.
 * - generateLink called for BOTH branches to equalize timing (BLOCK-4).
 * - Generic error text — never leaks which field failed or whether account exists.
 * - Service-role client throughout (bypasses RLS; letter_response_pending is
 *   service-role-only per migration 20260412000002).
 *
 * Canonical reference: create-and-open-letter/index.ts
 *   - createUser: line 324
 *   - generateLink: line 416
 *   - orphan self-heal: lines 240–315
 *   - get_auth_user_by_email RPC: lines 240–243
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_TERMS_VERSIONS = ['v1.3', 'v1.4'] as const;
type AcceptedTermsVersion = (typeof ACCEPTED_TERMS_VERSIONS)[number];

function isAcceptedTermsVersion(v: unknown): v is AcceptedTermsVersion {
  return typeof v === 'string' && (ACCEPTED_TERMS_VERSIONS as readonly string[]).includes(v);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Generic 400 — never reveal which field failed (shape oracle prevention). */
function validationError(cors: Record<string, string>): Response {
  return jsonResponse({ error: 'Invalid request. Please check your input and try again.' }, 400, cors);
}

/** Generate a URL-safe slug from a name (mirrors create-and-open-letter pattern). */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
}

// ── HTML email template ───────────────────────────────────────────────────────

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
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Clarity Pledge · <a href="https://claritypledge.com" style="color:#9ca3af;">claritypledge.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#002B5C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">${escapeHtml(text)}</a>`;
}

// ── Mailgun send ──────────────────────────────────────────────────────────────

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge <letters@${MAILGUN_DOMAIN}>`;

async function sendLetterResponseEmail(opts: {
  to: string;
  readerName: string;
  actionLink: string;
}): Promise<void> {
  const firstName = opts.readerName.trim().split(/\s+/)[0] || 'there';
  const subject = 'Save your letter responses — click to confirm';

  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Your responses are waiting</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      Click the button below to save your responses and create your Clarity Pledge account.
      This link works on any device — you can open it on your phone or desktop.
    </p>
    ${ctaButton('Save my responses', opts.actionLink)}
    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      This link expires in 1 hour. If you didn't submit a letter response form, you can ignore this email.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">
      By clicking the button, you confirm your acceptance of the Terms of Service and Privacy Policy.
      Questions? <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
    </p>
  `);

  const text = `Hi ${firstName},\n\nClick the link below to save your letter responses and create your Clarity Pledge account:\n\n${opts.actionLink}\n\nThis link expires in 1 hour and works on any device.\n\nIf you didn't submit a letter response form, you can ignore this email.\n\nClarity Pledge`;

  const body = new FormData();
  body.append('from', FROM);
  body.append('to', opts.to);
  body.append('subject', subject);
  body.append('html', html);
  body.append('text', text);

  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[request-letter-response-signin] Mailgun error:', res.status, err);
    throw new Error(`Mailgun send failed: ${res.status}`);
  }
}

// ── Request types ─────────────────────────────────────────────────────────────

interface RatingEntry {
  storyId: string;
  rating: number;
}

interface PositionEntry {
  pointId: string;
  position: number;
}

interface RequestBody {
  letterId?: unknown;
  name?: unknown;
  email?: unknown;
  termsAccepted?: unknown;
  termsVersion?: unknown;
  ratings?: unknown;
  positions?: unknown;
}

// ── Validation helpers ────────────────────────────────────────────────────────

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
      item.rating >= 0 &&
      item.rating <= 10,
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
  const corsHeaders = buildCorsHeaders(req);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Env guard ──────────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appUrl = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[request-letter-response-signin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error('[request-letter-response-signin] Missing MAILGUN_API_KEY or MAILGUN_DOMAIN');
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    // ── Parse body ─────────────────────────────────────────────────────────────
    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      console.warn('[P719-DIAG] validation_fail: PARSE_BODY');
      return validationError(corsHeaders);
    }

    const { letterId, name, email, termsAccepted, termsVersion, ratings, positions } = body;

    // ── Input validation (step 1) ──────────────────────────────────────────────
    // Generic errors throughout — never reveal which field failed.

    // letterId: must be a valid UUID
    if (typeof letterId !== 'string' || !UUID_REGEX.test(letterId)) {
      console.warn('[P719-DIAG] validation_fail: LETTER_ID');
      return validationError(corsHeaders);
    }

    // termsAccepted: strict boolean true (not truthy string coercion)
    if (termsAccepted !== true) {
      console.warn('[P719-DIAG] validation_fail: TERMS_ACCEPTED');
      return validationError(corsHeaders);
    }

    // termsVersion: must be in allowlist
    if (!isAcceptedTermsVersion(termsVersion)) {
      console.warn('[P719-DIAG] validation_fail: TERMS_VERSION');
      return validationError(corsHeaders);
    }

    // email: format + normalize
    if (typeof email !== 'string') {
      console.warn('[P719-DIAG] validation_fail: EMAIL_TYPE');
      return validationError(corsHeaders);
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      console.warn('[P719-DIAG] validation_fail: EMAIL_FORMAT');
      return validationError(corsHeaders);
    }

    // name: sanitize + reject if empty
    if (typeof name !== 'string') {
      console.warn('[P719-DIAG] validation_fail: NAME_TYPE');
      return validationError(corsHeaders);
    }
    const trimmedName = name.trim().slice(0, 100);
    if (!trimmedName) {
      console.warn('[P719-DIAG] validation_fail: NAME_EMPTY');
      return validationError(corsHeaders);
    }

    // ratings: shape validation
    if (!isValidRatingsArray(ratings)) {
      console.warn('[P719-DIAG] validation_fail: RATINGS_SHAPE');
      return validationError(corsHeaders);
    }

    // positions: shape validation
    if (!isValidPositionsArray(positions)) {
      console.warn('[P719-DIAG] validation_fail: POSITIONS_SHAPE');
      return validationError(corsHeaders);
    }

    // ── Service-role client (used throughout) ──────────────────────────────────
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Validate letter (step 1 continued) ────────────────────────────────────
    // Letter must exist, status='sealed', mode='one-to-many'.
    // Security: without this check an attacker could trigger auth emails against
    // arbitrary emails via one-to-one letters or drafts.
    const { data: letter, error: letterError } = await supabase
      .from('clarity_letters')
      .select('id, status, mode')
      .eq('id', letterId)
      .eq('status', 'sealed')
      .eq('mode', 'one-to-many')
      .maybeSingle();

    if (letterError) {
      console.error('[request-letter-response-signin] Letter lookup error:', letterError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    if (!letter) {
      // Letter not found, wrong status, or wrong mode — return generic error
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 400, corsHeaders);
    }

    // ── Look up existing user (step 2) ─────────────────────────────────────────
    // Use get_auth_user_by_email SECURITY DEFINER RPC — NOT profiles.email.
    // Rationale: profiles.email misses orphan auth.users rows (see P683 KDD,
    // decisions.md commit 50a1dbd3). supabase-js v2 has no auth.admin.getUserByEmail.
    const { data: authUserRows, error: rpcError } = await supabase.rpc('get_auth_user_by_email', {
      p_email: normalizedEmail,
    });

    if (rpcError) {
      console.error('[request-letter-response-signin] get_auth_user_by_email RPC error:', rpcError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const existingAuthUser = (authUserRows as Array<{ id: string; email: string }> | null)?.[0] ?? null;

    let userId: string;

    if (!existingAuthUser) {
      // ── New user: create auth user (step 3a) ───────────────────────────────
      // email_confirm: false — auth is proven by clicking the magic link, not
      // by a separate email confirmation step. Mirrors create-and-open-letter line 324.
      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: false,
      });

      if (createError || !authData?.user) {
        console.error('[request-letter-response-signin] createUser failed:', createError?.message);
        return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
      }

      userId = authData.user.id;

      // Create profile immediately — the token_hash flow bypasses AuthCallbackPage,
      // so confirm-letter-response needs the profile row to exist for the
      // letter_deliveries FK constraint. Same pattern as orphan self-heal below
      // and create-and-sign (P527 lines 196-213). This is NOT a DB trigger —
      // it is explicit profile creation in an edge function.
      const newUserAvatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const newUserName = trimmedName || normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

      let newUserSlug = generateSlug(newUserName) || `user-${Date.now()}`;

      const { data: newUserSlugConflict } = await supabase
        .from('profiles')
        .select('slug')
        .eq('slug', newUserSlug)
        .maybeSingle();

      if (newUserSlugConflict) {
        for (let i = 2; i <= 100; i++) {
          const candidate = `${newUserSlug}-${i}`;
          const { data: conflict } = await supabase
            .from('profiles')
            .select('slug')
            .eq('slug', candidate)
            .maybeSingle();
          if (!conflict) {
            newUserSlug = candidate;
            break;
          }
        }
      }

      const { error: newUserProfileError } = await supabase.from('profiles').insert({
        id: userId,
        email: normalizedEmail,
        name: newUserName,
        slug: newUserSlug,
        avatar_color: newUserAvatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: termsVersion,
        pledge_version: 2,
      });

      if (newUserProfileError) {
        console.error('[request-letter-response-signin] new user profile insert failed:', newUserProfileError.message);
        // Non-fatal: continue — the pending row and magic link still work
      }

    } else {
      // ── Existing user: check for orphan profile (step 3b) ──────────────────
      userId = existingAuthUser.id;

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        console.error('[request-letter-response-signin] profile lookup error:', profileLookupError.message);
        // Non-fatal: proceed; confirm-letter-response handles profile state
      }

      if (!existingProfile) {
        // Orphan case: auth.users row exists but profiles row is missing.
        // Self-heal by creating the profile now, mirroring create-and-open-letter
        // lines 240–315. This prevents confirm-letter-response from looping on
        // the same orphan state on the next submit.
        const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const initialName = trimmedName || normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

        let slug = generateSlug(initialName) || `user-${Date.now()}`;

        // Slug uniqueness loop (mirrors create-and-open-letter pattern)
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
            if (!conflict) {
              slug = candidate;
              break;
            }
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
          console.error('[request-letter-response-signin] orphan profile insert failed:', profileInsertError.message);
          // Non-fatal: continue — the pending row and magic link still work
        }
      }
    }

    // ── Mint magic link (step 4) ───────────────────────────────────────────────
    // Called IDENTICALLY for new and existing user branches.
    // This equalizes timing and closes the enumeration oracle (BLOCK-4).
    //
    // Pattern: extract hashed_token and build a direct link to the confirm page.
    // The confirm page calls verifyOtp({ token_hash }) to establish the session
    // synchronously — no implicit-grant #access_token race. Same pattern as
    // create-and-sign (P527). Works cross-browser (no PKCE code verifier).
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[request-letter-response-signin] generateLink failed:', linkError?.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const hashedToken = linkData.properties.hashed_token;
    const actionLink = `${appUrl}/letter/${letterId}/confirm?token_hash=${encodeURIComponent(hashedToken)}`;

    // ── Write pending row (step 5) ─────────────────────────────────────────────
    // UPSERT on (user_id, letter_id) — safe for re-submissions (Flow 5).
    // expires_at defaults to now() + 24h per migration 20260412000002.
    const { error: upsertError } = await supabase
      .from('letter_response_pending')
      .upsert(
        {
          user_id: userId,
          letter_id: letterId,
          name: trimmedName,
          ratings_json: ratings,
          positions_json: positions,
          terms_version: termsVersion,
          // Reset expires_at on re-submission so the 24h window is fresh
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'user_id,letter_id' },
      );

    if (upsertError) {
      console.error('[request-letter-response-signin] pending row upsert failed:', upsertError.message);
      return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    // ── Send branded email (step 6) ────────────────────────────────────────────
    // Failure is non-fatal: pending row is already written; the reader can
    // re-submit the form to trigger a fresh magic link + email send.
    try {
      await sendLetterResponseEmail({
        to: normalizedEmail,
        readerName: trimmedName,
        actionLink,
      });
    } catch (emailErr) {
      console.error('[request-letter-response-signin] Email send failed (non-fatal):', emailErr);
      // Continue — return { ok: true } anyway since pending row is written
    }

    // ── Return unified success (step 7) ───────────────────────────────────────
    // Identical for new and existing accounts — no enumeration oracle.
    return jsonResponse({ ok: true }, 200, corsHeaders);

  } catch (err) {
    console.error('[request-letter-response-signin] Unexpected error:', err);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
  }
});
