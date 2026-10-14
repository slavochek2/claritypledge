/**
 * @file create-and-sign/index.ts
 * @description P527 (retired by P1487): validates an agreement invitation, then refuses.
 *
 * Accepts { agreementId, token, partnerName, termsVersion } — NO email from client.
 *
 * Until P1487 this created a confirmed account at the partner's address, signed the agreement
 * and returned a sign-in credential to whoever presented the token. It now creates nothing:
 * after the same validation it answers USER_EXISTS (an account already exists) or
 * MAILBOX_REQUIRED. Either way the partner continues through a sign-in link sent to their
 * own address, which the accept page already offers. Kept deployed so that a client still
 * calling it gets a refusal it falls back from, rather than a 404.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const ACCEPTED_TERMS_VERSIONS = ['v1.3', 'v1.4'] as const;
type AcceptedTermsVersion = (typeof ACCEPTED_TERMS_VERSIONS)[number];

function isAcceptedTermsVersion(v: unknown): v is AcceptedTermsVersion {
  return typeof v === 'string' && (ACCEPTED_TERMS_VERSIONS as readonly string[]).includes(v);
}

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[create-and-sign] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { agreementId, token, partnerName, termsVersion } = await req.json() as {
      agreementId?: string;
      token?: string;
      partnerName?: string;
      termsVersion?: unknown;
    };

    // ── Input validation ──────────────────────────────────────────────────

    if (!agreementId || !token || !partnerName?.trim()) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Missing required fields' }, 400, corsHeaders);
    }

    if (!isAcceptedTermsVersion(termsVersion)) {
      return jsonResponse(
        { error: 'INVALID_TERMS_VERSION', message: 'Unsupported or missing terms version' },
        400,
        corsHeaders,
      );
    }

    // Validate UUID format for agreementId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agreementId)) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Invalid agreement ID' }, 400, corsHeaders);
    }

    // ── Fetch and validate agreement ──────────────────────────────────────

    const { data: agreement, error: agError } = await supabase
      .from('clarity_agreements')
      .select('id, creator_profile_id, partner_email, invitation_token, invitation_expires_at, status')
      .eq('id', agreementId)
      .single();

    if (agError || !agreement) {
      return jsonResponse({ error: 'NOT_FOUND', message: 'Agreement not found' }, 404, corsHeaders);
    }

    // Verify invitation token matches
    if (agreement.invitation_token !== token) {
      return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid invitation' }, 403, corsHeaders);
    }

    // Verify status is pending
    if (agreement.status !== 'pending') {
      return jsonResponse({ error: 'ALREADY_PROCESSED', message: 'Agreement is no longer pending' }, 409, corsHeaders);
    }

    // Verify not expired
    if (new Date(agreement.invitation_expires_at) <= new Date()) {
      return jsonResponse({ error: 'EXPIRED', message: 'Invitation has expired' }, 410, corsHeaders);
    }

    const partnerEmail = agreement.partner_email;

    // ── Guard: partner != creator ─────────────────────────────────────────

    const { data: creator } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', agreement.creator_profile_id)
      .single();

    if (creator?.email && creator.email === partnerEmail) {
      return jsonResponse({ error: 'SELF_SIGN', message: 'Cannot sign your own agreement' }, 403, corsHeaders);
    }

    // ── Guard: no existing user ───────────────────────────────────────────

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', partnerEmail)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({ error: 'USER_EXISTS', message: 'User already exists' }, 409, corsHeaders);
    }

    // ── No account is created here (P1487) ───────────────────────────────
    // The invitation token is not proof of owning the partner's mailbox — the creator can read
    // it, and anyone the link is forwarded to holds it. So this function no longer creates an
    // account, signs the agreement, or returns a sign-in credential. The partner signs in
    // through a link sent to their own address (the accept page's email sign-in), and signs
    // the agreement once signed in. An older client reading this refusal falls back to that
    // email path on its own.

    return jsonResponse(
      { error: 'MAILBOX_REQUIRED', message: 'Sign in with a link sent to your email to sign this agreement.' },
      403,
      corsHeaders,
    );

  } catch (err) {
    console.error('[create-and-sign] Unexpected error:', err);
    return jsonResponse({ error: 'INTERNAL', message: 'Sign-up failed' }, 500, corsHeaders);
  }
});
