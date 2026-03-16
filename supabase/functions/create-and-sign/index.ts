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

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { agreementId, token, partnerName } = await req.json() as {
      agreementId?: string;
      token?: string;
      partnerName?: string;
    };

    // ── Input validation ──────────────────────────────────────────────────

    if (!agreementId || !token || !partnerName?.trim()) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Missing required fields' }, 400);
    }

    const trimmedName = partnerName.trim().slice(0, 100);

    // Validate UUID format for agreementId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agreementId)) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Invalid agreement ID' }, 400);
    }

    // ── Fetch and validate agreement ──────────────────────────────────────

    const { data: agreement, error: agError } = await supabase
      .from('clarity_agreements')
      .select('id, creator_profile_id, partner_email, invitation_token, invitation_expires_at, status')
      .eq('id', agreementId)
      .single();

    if (agError || !agreement) {
      return jsonResponse({ error: 'NOT_FOUND', message: 'Agreement not found' }, 404);
    }

    // Verify invitation token matches
    if (agreement.invitation_token !== token) {
      return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid invitation' }, 403);
    }

    // Verify status is pending
    if (agreement.status !== 'pending') {
      return jsonResponse({ error: 'ALREADY_PROCESSED', message: 'Agreement is no longer pending' }, 409);
    }

    // Verify not expired
    if (new Date(agreement.invitation_expires_at) <= new Date()) {
      return jsonResponse({ error: 'EXPIRED', message: 'Invitation has expired' }, 410);
    }

    const partnerEmail = agreement.partner_email;

    // ── Guard: partner != creator ─────────────────────────────────────────

    const { data: creator } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', agreement.creator_profile_id)
      .single();

    if (creator?.email && creator.email === partnerEmail) {
      return jsonResponse({ error: 'SELF_SIGN', message: 'Cannot sign your own agreement' }, 403);
    }

    // ── Guard: no existing user ───────────────────────────────────────────

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', partnerEmail)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse({ error: 'USER_EXISTS', message: 'User already exists' }, 409);
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
      return jsonResponse({ error: 'CREATE_FAILED', message: 'Sign-up failed' }, 500);
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
        accepted_terms_version: 'v1.1',
        pledge_version: 2,
      });

    if (profileError) {
      console.error('[create-and-sign] profile insert failed:', profileError.message);
      return jsonResponse({ error: 'PROFILE_FAILED', message: 'Sign-up failed' }, 500);
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
      return jsonResponse({ error: 'ACCEPT_FAILED', message: 'Agreement signing failed' }, 500);
    }

    // ── Generate session token ────────────────────────────────────────────

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: partnerEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[create-and-sign] generateLink failed:', linkError?.message);
      // Agreement is accepted but session generation failed — client can still log in via OTP
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Signed but session creation failed' }, 500);
    }

    const hashedToken = linkData.properties.hashed_token;

    // ── Fire-and-forget: notify creator ───────────────────────────────────

    // Trigger send-agreement-emails with action 'accepted' — the ONLY email trigger for this flow
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    fetch(`${supabaseUrl}/functions/v1/send-agreement-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: 'accepted', agreementId }),
    }).catch(err => console.error('[create-and-sign] email notification failed:', err));

    // ── Success ───────────────────────────────────────────────────────────

    return jsonResponse({
      ok: true,
      hashedToken,
      redirectTo: `/agreements/${agreementId}`,
    });

  } catch (err) {
    console.error('[create-and-sign] Unexpected error:', err);
    return jsonResponse({ error: 'INTERNAL', message: 'Sign-up failed' }, 500);
  }
});
