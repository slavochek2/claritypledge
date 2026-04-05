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

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];

const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'INTERNAL', message: 'Missing required env vars' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { token } = await req.json() as { token?: string };

    // -- Input validation -----------------------------------------------------

    if (!token?.trim()) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Missing token' }, 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return jsonResponse({ error: 'INVALID_INPUT', message: 'Invalid token format' }, 400);
    }

    // -- Validate token via RPC -----------------------------------------------

    const { data: letterData, error: rpcError } = await supabase.rpc('get_letter_by_token', {
      p_token: token,
    });

    if (rpcError || !letterData) {
      return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid or expired invitation' }, 403);
    }

    const deliveryId = letterData.delivery_id as string;
    const receiverEmail = letterData.receiver_email as string | null;
    const existingReceiverId = letterData.receiver_profile_id as string | null;
    const letterStatus = letterData.status as string;
    const receiverName = (letterData.receiver_name as string | null)?.trim()?.slice(0, 100) || null;

    // Verify letter is sealed
    if (letterStatus !== 'sealed') {
      return jsonResponse({ error: 'NOT_SEALED', message: 'Letter is not available' }, 409);
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
          });
        }
      }

      // Even if session generation fails, the delivery is linked — return success
      return jsonResponse({
        ok: true,
        redirectTo: `/letter/${deliveryId}`,
      });
    }

    // -- No receiver yet: need email to create account ------------------------

    if (!receiverEmail) {
      return jsonResponse({ error: 'NO_EMAIL', message: 'Delivery has no receiver email' }, 400);
    }

    // -- Check for existing user with this email ------------------------------

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', receiverEmail)
      .maybeSingle();

    if (existingProfile) {
      // User already exists — link delivery and generate session
      await supabase
        .from('letter_deliveries')
        .update({
          receiver_profile_id: existingProfile.id,
          status: 'opened',
          opened_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: receiverEmail,
      });

      if (!linkError && linkData?.properties?.hashed_token) {
        return jsonResponse({
          ok: true,
          hashedToken: linkData.properties.hashed_token,
          redirectTo: `/letter/${deliveryId}`,
        });
      }

      // Session generation failed but delivery is linked
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Linked but session creation failed' }, 500);
    }

    // -- Create auth user -----------------------------------------------------

    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    // Use receiver_name from DB (set at composition time), fallback to email local part
    const initialName = receiverName || receiverEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email: receiverEmail,
      email_confirm: true,
      user_metadata: { name: initialName, avatar_color: avatarColor },
    });

    if (createError || !authData.user) {
      // Self-healing: auth.users may exist without profile (abandoned signup)
      // Try to sign in instead — same pattern as agreement flow
      console.warn('[create-and-open-letter] createUser failed, attempting fallback:', createError?.message);

      const { data: fallbackLink, error: fallbackError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: receiverEmail,
      });

      if (!fallbackError && fallbackLink?.properties?.hashed_token) {
        // Link delivery to the existing auth.users record
        const { data: existingAuth } = await supabase.auth.admin.getUserByEmail(receiverEmail);
        if (existingAuth?.user) {
          // Ensure profile exists
          const { data: profileCheck } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', existingAuth.user.id)
            .maybeSingle();

          if (!profileCheck) {
            // Create missing profile (self-healing)
            const avatarColorFallback = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
            const nameFallback = receiverName || receiverEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';
            let slugFallback = generateSlug(nameFallback) || `user-${Date.now()}`;
            const { data: slugCheck } = await supabase.from('profiles').select('slug').eq('slug', slugFallback).maybeSingle();
            if (slugCheck) slugFallback = `${slugFallback}-${Date.now()}`;

            await supabase.from('profiles').insert({
              id: existingAuth.user.id,
              email: receiverEmail,
              name: nameFallback,
              slug: slugFallback,
              avatar_color: avatarColorFallback,
              is_verified: true,
              has_pledged: false,
              accepted_terms_version: 'v1.1',
              pledge_version: 2,
            });
          }

          await supabase.from('letter_deliveries').update({
            receiver_profile_id: existingAuth.user.id,
            status: 'opened',
            opened_at: new Date().toISOString(),
          }).eq('id', deliveryId);
        }

        return jsonResponse({
          ok: true,
          hashedToken: fallbackLink.properties.hashed_token,
          redirectTo: `/letter/${deliveryId}`,
        });
      }

      return jsonResponse({ error: 'CREATE_FAILED', message: 'Account creation failed' }, 500);
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
        email: receiverEmail,
        name: initialName,
        slug,
        avatar_color: avatarColor,
        is_verified: true,
        has_pledged: false,
        accepted_terms_version: 'v1.1',
        pledge_version: 2,
      });

    if (profileError) {
      console.error('[create-and-open-letter] profile insert failed:', profileError.message);
      return jsonResponse({ error: 'PROFILE_FAILED', message: 'Account creation failed' }, 500);
    }

    // -- Link delivery to new user --------------------------------------------

    const { error: updateError } = await supabase
      .from('letter_deliveries')
      .update({
        receiver_profile_id: newUserId,
        status: 'opened',
        opened_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    if (updateError) {
      console.error('[create-and-open-letter] delivery update failed:', updateError.message);
      // User+profile created but delivery not linked — non-fatal, client can retry
    }

    // -- Generate session token -----------------------------------------------

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: receiverEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[create-and-open-letter] generateLink failed:', linkError?.message);
      return jsonResponse({ error: 'SESSION_FAILED', message: 'Opened but session creation failed' }, 500);
    }

    // -- Success --------------------------------------------------------------

    return jsonResponse({
      ok: true,
      hashedToken: linkData.properties.hashed_token,
      redirectTo: `/letter/${deliveryId}`,
    });

  } catch (err) {
    console.error('[create-and-open-letter] Unexpected error:', err);
    return jsonResponse({ error: 'INTERNAL', message: 'Failed to open letter' }, 500);
  }
});
