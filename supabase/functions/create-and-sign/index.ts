/**
 * @file create-and-sign/index.ts
 * @description P527: Server-side user creation + agreement acceptance for new users.
 *
 * Accepts { agreementId, token, partnerName } — NO email from client.
 * Derives partner_email from the agreement row (security: email pinning).
 *
 * Flow: validate agreement -> check existing user -> create auth user ->
 *       create profile -> accept agreement -> generate session -> notify creator.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { hashIp, extractClientIp } from '../_shared/hash-ip.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

const ACCEPTED_TERMS_VERSIONS = ['v1.3'] as const;
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

/** Generate a URL-safe slug from a name (mirrors src/app/data/api.ts generateSlug) */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
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

    const ipHashSecret = Deno.env.get('IP_HASH_SECRET');
    if (!ipHashSecret) {
      console.error('[create-and-sign] IP_HASH_SECRET not configured');
      return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }

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

    const trimmedName = partnerName.trim().slice(0, 100);

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

    // ── Create auth user ──────────────────────────────────────────────────

    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: partnerEmail,
      email_confirm: true,
      user_metadata: { name: trimmedName, avatar_color: avatarColor },
    });

    if (createError || !authData.user) {
      console.error('[create-and-sign] createUser failed:', createError?.message);
      return jsonResponse({ error: 'CREATE_FAILED', message: 'Sign-up failed' }, 500, corsHeaders);
    }

    const newUserId = authData.user.id;

    // ── Generate unique slug ──────────────────────────────────────────────

    let slug = generateSlug(trimmedName) || `user-${Date.now()}`;

    const { data: slugConflict } = await supabase
      .from('profiles')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();

    if (slugConflict) {
      // Append counter to make unique
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

    // ── Create profile ────────────────────────────────────────────────────

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newUserId,
        email: partnerEmail,
        name: trimmedName,
        slug,
        avatar_color: avatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: termsVersion,
        pledge_version: 2,
      });

    if (profileError) {
      console.error('[create-and-sign] profile insert failed:', profileError.message);
      return jsonResponse({ error: 'PROFILE_FAILED', message: 'Sign-up failed' }, 500, corsHeaders);
    }

    // ── Record terms acceptance audit row ─────────────────────────────────

    const clientIp = extractClientIp(req);
    const userAgent = req.headers.get('user-agent') ?? 'unknown';
    const ipHash = await hashIp(clientIp, ipHashSecret);

    const { error: acceptError } = await supabase.from('terms_acceptances').insert({
      user_id: newUserId,
      terms_version: termsVersion,
      ip_hash: ipHash,
      user_agent: userAgent,
    });
    if (acceptError && acceptError.code !== '23505') {
      console.error('[create-and-sign] terms_acceptances insert failed:', acceptError.message);
    }

    // ── Accept agreement via RPC ──────────────────────────────────────────

    const { data: accepted, error: rpcError } = await supabase.rpc('accept_agreement', {
      p_agreement_id: agreementId,
      p_token: token,
      p_partner_id: newUserId,
      p_partner_display_name: trimmedName,
    });

    if (rpcError || !accepted) {
      console.error('[create-and-sign] accept_agreement failed:', rpcError?.message);
      // User+profile created but agreement not accepted — client fallback handles this
      return jsonResponse({ error: 'ACCEPT_FAILED', message: 'Agreement signing failed' }, 500, corsHeaders);
    }

    // ── Generate session token ────────────────────────────────────────────

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: partnerEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[create-and-sign] generateLink failed:', linkError?.message);
      // Agreement is accepted but session generation failed — client can still log in via OTP
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Signed but session creation failed' }, 500, corsHeaders);
    }

    const hashedToken = linkData.properties.hashed_token;

    // ── Fire-and-forget: notify creator ───────────────────────────────────

    // Trigger send-agreement-emails with action 'accepted' — the ONLY email trigger for this flow
    fetch(`${supabaseUrl}/functions/v1/send-agreement-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: 'accepted', agreementId }),
    }).catch(err => console.error('[create-and-sign] email notification failed:', err));

    // ── Success ───────────────────────────────────────────────────────────

    return jsonResponse({
      ok: true,
      hashedToken,
      redirectTo: `/agreements/${agreementId}`,
    }, 200, corsHeaders);

  } catch (err) {
    console.error('[create-and-sign] Unexpected error:', err);
    return jsonResponse({ error: 'INTERNAL', message: 'Sign-up failed' }, 500, corsHeaders);
  }
});
