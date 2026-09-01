/**
 * @file create-and-open-letter/index.ts
 * @description P581: Server-side user creation + letter opening for new users.
 *
 * Accepts { token } — validates via get_letter_by_token RPC.
 * D48: "Open the Letter" = account creation + terms acceptance in one click.
 *
 * Flow: validate token -> check existing user -> create auth user ->
 *       create profile -> link delivery -> generate session -> return redirect.
 *
 * Idempotent: if delivery already has receiver_profile_id, skip creation.
 *
 * Cloned from create-and-sign, adapted for letter delivery flow.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { hashIp, extractClientIp } from '../_shared/hash-ip.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

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
      console.error('[create-and-open-letter] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return jsonResponse({ error: 'INTERNAL', message: "Couldn't open this letter. Please try again." }, 500, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const ipHashSecret = Deno.env.get('IP_HASH_SECRET');
    if (!ipHashSecret) {
      console.error('[create-and-open-letter] IP_HASH_SECRET not configured');
      return jsonResponse({ error: 'INTERNAL', message: "Couldn't open this letter. Please try again." }, 500, corsHeaders);
    }

    const { token, termsAccepted, termsVersion } = await req.json() as {
      token?: string;
      termsAccepted?: unknown;
      termsVersion?: unknown;
    };

    // -- Input validation -----------------------------------------------------

    if (!token?.trim()) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Missing token' }, 400, corsHeaders);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Invalid token format' }, 400, corsHeaders);
    }

    // Strict boolean check — not truthy string coercion
    if (termsAccepted !== true) {
      return jsonResponse(
        { error: 'TERMS_NOT_ACCEPTED', message: 'You must accept the Terms of Service to continue' },
        400,
        corsHeaders,
      );
    }

    // Allowlist check — prevents client-supplied junk versions
    if (!isAcceptedTermsVersion(termsVersion)) {
      return jsonResponse(
        { error: 'INVALID_TERMS_VERSION', message: 'Unsupported terms version' },
        400,
        corsHeaders,
      );
    }

    const clientIp = extractClientIp(req);
    const userAgent = req.headers.get('user-agent') ?? 'unknown';
    const ipHash = await hashIp(clientIp, ipHashSecret);

    async function recordTermsAcceptance(userId: string): Promise<void> {
      const { error } = await supabase.from('terms_acceptances').insert({
        user_id: userId,
        terms_version: termsVersion,
        ip_hash: ipHash,
        user_agent: userAgent,
      });
      if (error && error.code !== '23505') {
        // 23505 = unique violation (already recorded); any other error logged
        console.error('[create-and-open-letter] terms_acceptances insert failed:', error.message);
      }
    }

    // -- Validate token via RPC -----------------------------------------------

    const { data: letterData, error: rpcError } = await supabase.rpc('get_letter_by_token', {
      p_token: token,
    });

    if (rpcError || !letterData) {
      return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid or expired invitation' }, 403, corsHeaders);
    }

    const deliveryId = letterData.delivery_id as string;
    const existingReceiverId = letterData.receiver_profile_id as string | null;
    const letterStatus = letterData.status as string;
    const receiverName = (letterData.receiver_name as string | null)?.trim()?.slice(0, 100) || null;

    // get_letter_by_token redacts receiver_email for privacy — query directly with service role
    const { data: deliveryRow } = await supabase
      .from('letter_deliveries')
      .select('receiver_email')
      .eq('id', deliveryId)
      .single();
    const receiverEmail = (deliveryRow?.receiver_email as string | null) ?? null;
    // Normalize for all identity/lookup/write-to-auth contexts (case-insensitive match).
    // Display strings (e.g. name fallback) keep original receiverEmail case.
    const normalizedEmail = (receiverEmail ?? '').trim().toLowerCase();

    // Verify letter is sealed
    if (letterStatus !== 'sealed') {
      return jsonResponse({ error: 'NOT_SEALED', message: 'Letter is not available' }, 409, corsHeaders);
    }

    // -- Idempotent: if delivery already linked, return success ----------------

    if (existingReceiverId) {
      // Generate session for existing receiver
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', existingReceiverId)
        .single();

      if (existingProfile?.email) {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: existingProfile.email,
        });

        if (!linkError && linkData?.properties?.hashed_token) {
          return jsonResponse({
            ok: true,
            hashedToken: linkData.properties.hashed_token,
            redirectTo: `/letter/${deliveryId}`,
          }, 200, corsHeaders);
        }
      }

      // Even if session generation fails, the delivery is linked — return success
      return jsonResponse({
        ok: true,
        redirectTo: `/letter/${deliveryId}`,
      }, 200, corsHeaders);
    }

    // -- No receiver yet: need email to create account ------------------------

    if (!receiverEmail) {
      return jsonResponse({ error: 'NO_EMAIL', message: 'Delivery has no receiver email' }, 400, corsHeaders);
    }

    // -- Check for existing user with this email ------------------------------

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingProfile) {
      // User already exists — link delivery and generate session.
      // Invalidate the invitation token on link so the same token cannot be
      // reused to mint fresh sessions for the receiver (token-replay defense).
      const nowIso = new Date().toISOString();
      await supabase
        .from('letter_deliveries')
        .update({
          receiver_profile_id: existingProfile.id,
          status: 'opened',
          opened_at: nowIso,
          invitation_expires_at: nowIso,
        })
        .eq('id', deliveryId);

      // GDPR audit row — existing users still accepted the current terms version in this flow.
      await recordTermsAcceptance(existingProfile.id);

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      });

      if (!linkError && linkData?.properties?.hashed_token) {
        return jsonResponse({
          ok: true,
          hashedToken: linkData.properties.hashed_token,
          redirectTo: `/letter/${deliveryId}`,
        }, 200, corsHeaders);
      }

      // Session generation failed but delivery is linked
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Linked but session creation failed' }, 500, corsHeaders);
    }

    // -- Orphan recovery: auth.users row exists, profiles row missing ----------
    // PostgREST blocks direct auth schema access (PGRST106); use SECURITY DEFINER RPC.
    // Happens when createUser succeeded but the profiles insert failed mid-flow,
    // or when a legacy account (agreement-signer) never got a profiles row.
    const { data: authUserRows } = await supabase.rpc('get_auth_user_by_email', {
      p_email: normalizedEmail,
    });
    const orphanAuthUser = (authUserRows as Array<{ id: string; email: string }> | null)?.[0] ?? null;

    if (orphanAuthUser) {
      const recoveredUserId = orphanAuthUser.id;
      const recoveryAvatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const recoveryName = receiverName || (receiverEmail ?? normalizedEmail).split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

      let recoverySlug = generateSlug(recoveryName) || `user-${Date.now()}`;
      const { data: recoverySlugConflict } = await supabase
        .from('profiles')
        .select('slug')
        .eq('slug', recoverySlug)
        .maybeSingle();
      if (recoverySlugConflict) {
        for (let i = 2; i <= 100; i++) {
          const candidate = `${recoverySlug}-${i}`;
          const { data: conflict } = await supabase
            .from('profiles')
            .select('slug')
            .eq('slug', candidate)
            .maybeSingle();
          if (!conflict) {
            recoverySlug = candidate;
            break;
          }
        }
      }

      const { error: recoveryProfileError } = await supabase.from('profiles').insert({
        id: recoveredUserId,
        email: normalizedEmail,
        name: recoveryName,
        slug: recoverySlug,
        avatar_color: recoveryAvatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: termsVersion,
        pledge_version: 2,
      });

      if (recoveryProfileError) {
        console.error('[create-and-open-letter] orphan profile insert failed:', recoveryProfileError.message);
        return jsonResponse({ error: 'PROFILE_FAILED', message: 'Account creation failed' }, 500, corsHeaders);
      }

      const recoveryNowIso = new Date().toISOString();
      await supabase
        .from('letter_deliveries')
        .update({
          receiver_profile_id: recoveredUserId,
          status: 'opened',
          opened_at: recoveryNowIso,
          invitation_expires_at: recoveryNowIso,
        })
        .eq('id', deliveryId);

      await recordTermsAcceptance(recoveredUserId);

      const { data: recoveryLinkData, error: recoveryLinkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      });

      if (!recoveryLinkError && recoveryLinkData?.properties?.hashed_token) {
        return jsonResponse({
          ok: true,
          hashedToken: recoveryLinkData.properties.hashed_token,
          redirectTo: `/letter/${deliveryId}`,
        }, 200, corsHeaders);
      }

      return jsonResponse({ error: 'SESSION_FAILED', message: 'Linked but session creation failed' }, 500, corsHeaders);
    }

    // -- Create auth user -----------------------------------------------------

    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    // Use receiver_name from DB (set at composition time), fallback to email local part
    const initialName = receiverName || receiverEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { name: initialName, avatar_color: avatarColor },
    });

    if (createError || !authData.user) {
      // Auth user creation failed. The most common cause is a pre-existing auth.users
      // row (orphan account — no matching profiles row). Self-healing inside a user-facing
      // edge function is the wrong layer; orphan cleanup belongs in an admin migration.
      // Surface the real error so it is diagnosable from the client.
      console.error('[create-and-open-letter] createUser failed:', createError?.message);
      return jsonResponse(
        { error: 'CREATE_FAILED', message: createError?.message ?? 'Account creation failed' },
        500,
        corsHeaders,
      );
    }

    const newUserId = authData.user.id;

    // -- Generate unique slug -------------------------------------------------

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
        if (!conflict) {
          slug = candidate;
          break;
        }
      }
    }

    // -- Create profile -------------------------------------------------------

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: newUserId,
        email: normalizedEmail,
        name: initialName,
        slug,
        avatar_color: avatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: termsVersion,
        pledge_version: 2,
      });

    if (profileError) {
      console.error('[create-and-open-letter] profile insert failed:', profileError.message);
      return jsonResponse({ error: 'PROFILE_FAILED', message: 'Account creation failed' }, 500, corsHeaders);
    }

    // -- Record terms acceptance audit row ------------------------------------

    await recordTermsAcceptance(newUserId);

    // -- Link delivery to new user --------------------------------------------
    // Invalidate the invitation token on link (token-replay defense); RPC
    // rejects tokens whose invitation_expires_at has passed.

    const linkNowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('letter_deliveries')
      .update({
        receiver_profile_id: newUserId,
        status: 'opened',
        opened_at: linkNowIso,
        invitation_expires_at: linkNowIso,
      })
      .eq('id', deliveryId);

    if (updateError) {
      console.error('[create-and-open-letter] delivery update failed:', updateError.message);
      // User+profile created but delivery not linked — non-fatal, client can retry
    }

    // -- Generate session token -----------------------------------------------

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[create-and-open-letter] generateLink failed:', linkError?.message);
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Opened but session creation failed' }, 500, corsHeaders);
    }

    // -- Success --------------------------------------------------------------

    return jsonResponse({
      ok: true,
      hashedToken: linkData.properties.hashed_token,
      redirectTo: `/letter/${deliveryId}`,
    }, 200, corsHeaders);

  } catch (err) {
    console.error('[create-and-open-letter] Unexpected error:', err);
    return jsonResponse({ error: 'INTERNAL', message: 'Failed to open letter' }, 500, corsHeaders);
  }
});
