/**
 * @file create-and-open-letter/handler.ts
 * @description P581: "Open the Letter" for an emailed one-to-one invitation. Wiring (env,
 * Mailgun, serve) lives in index.ts; this module is the request logic, importable by tests.
 *
 * Accepts { token, termsAccepted, termsVersion } — validates via get_letter_by_token RPC.
 *
 * The invitation token is NOT proof of owning the recipient's mailbox: whoever sent the letter
 * can read it, and anyone the link is forwarded to holds it. So this handler never answers a
 * token with a session credential, and never creates a confirmed account (P1487, building on
 * P1446). Branches:
 *
 *   - delivery already linked, or the address already has a profile → { signInRequired }:
 *     the owner signs in the normal way (P1446). Unchanged.
 *   - an auth user exists without a profile and has CONFIRMED their email → orphan recovery,
 *     then { signInRequired } (P1446). Unchanged.
 *   - no account yet, or one that has never confirmed its email → the account is created
 *     UNCONFIRMED (an existing unconfirmed one is first reset — no credential or metadata from
 *     its creator survives), and a one-time sign-in link is emailed to the recipient's
 *     address → { checkEmail }. The account is confirmed, its profile written and the
 *     delivery claimed only after that link is opened — by the standard sign-in path
 *     (/auth/verify → /auth/callback → /letter/<id>?token=…).
 *
 * The letter itself stays readable by token without an account (get_letter_for_reading).
 *
 * Mail is rate-limited (P1225 limiter): every well-formed request reserves the caller's IP bucket
 * before the invitation is looked up, and only a request that is about to mail reserves the
 * recipient-address bucket — before any account is created, a link is minted or mail is sent.
 * Re-sends ("send the link again") go through the same path, so they spend the same allowance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { resetUnconfirmedAccount } from '../_shared/unconfirmed-account.ts';
import { setPendingTermsAcceptance } from '../_shared/pending-terms.ts';
import { isCurrentTermsVersion } from '../_shared/terms-version.ts';
import {
  SIGNIN_MAIL_LIMITS,
  ipLimitKey,
  mailLimitResponse,
  reserveMailSlot,
  targetLimitKey,
  type RpcClient,
} from '../_shared/mail-rate-limit.ts';

const FN_NAME = 'create-and-open-letter';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];


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

/** The one-time sign-in email this handler sends to the recipient's own address. */
export interface SignInEmail {
  to: string;
  recipientName: string | null;
  senderName: string;
  link: string;
}

export interface OpenLetterDeps {
  /** Service-role client. */
  supabase: SupabaseClient;
  /** Origin the emailed link points at, e.g. https://claritypledge.com */
  appUrl: string;
  /** Delivers the sign-in link to the recipient's mailbox. Throws on failure. */
  sendSignInEmail: (email: SignInEmail) => Promise<void>;
  /** Salt for the rate-limit keys (never a raw IP or address in the database). */
  ipHashSecret: string;
}

/**
 * The emailed link. It is redeemed by /auth/verify (verifyOtp on token_hash — works in any
 * browser), which hands off to /auth/callback (profile write) and then to `redirect`. The
 * invitation token rides along in `redirect` so the signed-in recipient claims the delivery
 * on arrival — the same address already received it in the invitation email.
 */
export function signInLink(appUrl: string, tokenHash: string, deliveryId: string, token: string, termsNonce: string | null): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: 'magiclink',
    source: 'signup',
    redirect: `/letter/${deliveryId}?token=${token}`,
  });
  // Forwarded by /auth/verify to /auth/callback, which presents it to consume_pending_terms_acceptance.
  if (termsNonce) params.set('terms_nonce', termsNonce);
  return `${appUrl}/auth/verify?${params.toString()}`;
}

export function createHandler(deps: OpenLetterDeps): (req: Request) => Promise<Response> {
  const { supabase, appUrl, sendSignInEmail, ipHashSecret } = deps;
  const limiter = supabase as unknown as RpcClient;

  return async (req: Request): Promise<Response> => {
    const corsHeaders = buildCorsHeaders(req);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const { token, termsAccepted, termsVersion } = await req.json() as {
        token?: string;
        termsAccepted?: unknown;
        termsVersion?: unknown;
      };

      // -- Input validation ---------------------------------------------------

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
      if (!isCurrentTermsVersion(termsVersion)) {
        return jsonResponse(
          { error: 'INVALID_TERMS_VERSION', message: 'Unsupported terms version' },
          400,
          corsHeaders,
        );
      }

      // -- Rate limit: caller's IP, before the invitation is looked up ---------

      const ipRefusal = mailLimitResponse(
        await reserveMailSlot(limiter, FN_NAME, 'ip', await ipLimitKey(req, ipHashSecret), SIGNIN_MAIL_LIMITS.ip),
        corsHeaders,
      );
      if (ipRefusal) return ipRefusal;

      // -- Validate token via RPC ---------------------------------------------

      const { data: letterData, error: rpcError } = await supabase.rpc('get_letter_by_token', {
        p_token: token,
      });

      if (rpcError || !letterData) {
        return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid or expired invitation' }, 403, corsHeaders);
      }

      const deliveryId = letterData.delivery_id as string;
      const existingReceiverId = letterData.receiver_profile_id as string | null;
      const letterStatus = letterData.status as string;
      const senderId = letterData.sender_id as string | null;
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

      // -- Idempotent: if delivery already linked, return success --------------
      // No credential (P1446): the receiver's account already exists.

      if (existingReceiverId) {
        return jsonResponse({
          ok: true,
          signInRequired: true,
          redirectTo: `/letter/${deliveryId}`,
        }, 200, corsHeaders);
      }

      // -- No receiver yet: need email to create account ----------------------

      if (!receiverEmail) {
        return jsonResponse({ error: 'NO_EMAIL', message: 'Delivery has no receiver email' }, 400, corsHeaders);
      }

      // -- Check for existing user with this email ----------------------------

      // Case-insensitive, but EXACT (P1446): `_`, `%` and `\` are escaped so ilike compares them
      // literally, and string equality confirms the match before it names anyone as this
      // delivery's receiver (PostgREST also reads `*` as a wildcard; equality covers that case).
      const literalPattern = normalizedEmail.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: emailCandidates } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', literalPattern)
        .limit(50);
      const exactMatches = (emailCandidates ?? []).filter(
        (p: { email: string | null }) => (p.email ?? '').trim().toLowerCase() === normalizedEmail,
      );
      const existingProfile = exactMatches.length === 1 ? exactMatches[0] : null;

      if (existingProfile) {
        // User already exists — link delivery; no credential (P1446).
        // Invalidate the invitation token on link (token-replay defense).
        const nowIso = new Date().toISOString();
        const { error: linkExistingError } = await supabase
          .from('letter_deliveries')
          .update({
            receiver_profile_id: existingProfile.id,
            status: 'opened',
            opened_at: nowIso,
            invitation_expires_at: nowIso,
          })
          .eq('id', deliveryId);
        if (linkExistingError) {
          console.error('[create-and-open-letter] delivery link failed:', linkExistingError.message);
          return jsonResponse({ error: 'LINK_FAILED', message: 'Failed to open letter' }, 500, corsHeaders);
        }
        // No terms-acceptance row here: the presenter has not proven to be this account (P1446).

        return jsonResponse({
          ok: true,
          signInRequired: true,
          redirectTo: `/letter/${deliveryId}`,
        }, 200, corsHeaders);
      }

      // -- Auth user without a profile -----------------------------------------
      // PostgREST blocks direct auth schema access (PGRST106); use SECURITY DEFINER RPC.
      const { data: authUserRows } = await supabase.rpc('get_auth_user_by_email', {
        p_email: normalizedEmail,
      });
      const orphanAuthUser = (authUserRows as Array<{ id: string; email: string }> | null)?.[0] ?? null;

      // An account that has never confirmed its email belongs to nobody yet — not to the
      // token holder, and not yet provably to the recipient. Treat it like a new account:
      // the first sign-in goes to the mailbox (P1487). Only a confirmed orphan is recovered.
      let orphanConfirmed = false;
      if (orphanAuthUser) {
        const { data: orphanUser, error: orphanUserError } = await supabase.auth.admin.getUserById(orphanAuthUser.id);
        if (orphanUserError || !orphanUser?.user) {
          console.error('[create-and-open-letter] orphan lookup failed:', orphanUserError?.message);
          return jsonResponse({ error: 'INTERNAL', message: 'Failed to open letter' }, 500, corsHeaders);
        }
        orphanConfirmed = !!orphanUser.user.email_confirmed_at;
      }

      if (orphanAuthUser && orphanConfirmed) {
        // Orphan recovery: confirmed auth.users row, profiles row missing. Happens when a
        // profile insert failed mid-flow, or for a legacy account that never got a profile row.
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
        const { error: linkRecoveredError } = await supabase
          .from('letter_deliveries')
          .update({
            receiver_profile_id: recoveredUserId,
            status: 'opened',
            opened_at: recoveryNowIso,
            invitation_expires_at: recoveryNowIso,
          })
          .eq('id', deliveryId);
        if (linkRecoveredError) {
          console.error('[create-and-open-letter] delivery link failed:', linkRecoveredError.message);
          return jsonResponse({ error: 'LINK_FAILED', message: 'Failed to open letter' }, 500, corsHeaders);
        }
        // No terms-acceptance row here: the presenter has not proven to be this account (P1446).

        // The auth account already existed — no credential (P1446).
        return jsonResponse({
          ok: true,
          signInRequired: true,
          redirectTo: `/letter/${deliveryId}`,
        }, 200, corsHeaders);
      }

      // -- New (or never-confirmed) account: first sign-in goes to the mailbox --
      // P1487: nothing here confirms the account or signs anyone in. No profile is written and
      // the delivery is not claimed — both happen after the recipient opens the emailed link.

      // Rate limit: the recipient address, before any account, link or mail.
      const targetRefusal = mailLimitResponse(
        await reserveMailSlot(limiter, FN_NAME, 'target', await targetLimitKey(normalizedEmail, ipHashSecret), SIGNIN_MAIL_LIMITS.target),
        corsHeaders,
      );
      if (targetRefusal) return targetRefusal;

      const initialName = receiverName || receiverEmail.split('@')[0].replace(/[._-]+/g, ' ').trim().slice(0, 100) || 'Reader';

      const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      let accountId: string;
      let activatedByLink: boolean;
      if (orphanAuthUser) {
        accountId = orphanAuthUser.id;
        // An unconfirmed account already exists at this address: nothing on it is proven to be
        // the recipient's, and the link below would make it live. Reset it first.
        const outcome = await resetUnconfirmedAccount(supabase, orphanAuthUser.id, { name: initialName, avatar_color: avatarColor });
        if (!outcome) {
          return jsonResponse({ error: 'INTERNAL', message: "Couldn't open this letter. Please try again." }, 500, corsHeaders);
        }
        activatedByLink = outcome === 'reset';
      } else {
        const { data: authData, error: createError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: false,
          user_metadata: { name: initialName, avatar_color: avatarColor },
        });

        if (createError || !authData.user) {
          console.error('[create-and-open-letter] createUser failed:', createError?.message);
          return jsonResponse(
            { error: 'CREATE_FAILED', message: "Couldn't open this letter. Please try again." },
            500,
            corsHeaders,
          );
        }
        accountId = authData.user.id;
        activatedByLink = true;
      }

      // Only for an account this link will activate: the terms accepted by pressing "Open", kept
      // server-side and bound to this link (consume_pending_terms_acceptance). Never for an
      // account that is already confirmed.
      let termsNonce: string | null = null;
      if (activatedByLink) {
        termsNonce = await setPendingTermsAcceptance(supabase, accountId, termsVersion);
        if (!termsNonce) {
          return jsonResponse({ error: 'INTERNAL', message: "Couldn't open this letter. Please try again." }, 500, corsHeaders);
        }
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
      });

      if (linkError || !linkData?.properties?.hashed_token) {
        console.error('[create-and-open-letter] generateLink failed:', linkError?.message);
        return jsonResponse({ error: 'SIGNIN_LINK_FAILED', message: "Couldn't send your sign-in link. Please try again." }, 500, corsHeaders);
      }

      let senderName = 'Someone';
      if (senderId) {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', senderId)
          .maybeSingle();
        senderName = (senderProfile?.name as string | null)?.trim() || senderName;
      }

      try {
        await sendSignInEmail({
          to: normalizedEmail,
          recipientName: receiverName,
          senderName,
          link: signInLink(appUrl, linkData.properties.hashed_token, deliveryId, token, termsNonce),
        });
      } catch (emailErr) {
        console.error('[create-and-open-letter] sign-in email failed:', emailErr);
        return jsonResponse({ error: 'EMAIL_FAILED', message: "Couldn't send your sign-in link. Please try again." }, 502, corsHeaders);
      }

      // The response carries nothing that signs anyone in.
      return jsonResponse({ ok: true, checkEmail: true }, 200, corsHeaders);

    } catch (err) {
      console.error('[create-and-open-letter] Unexpected error:', err);
      return jsonResponse({ error: 'INTERNAL', message: 'Failed to open letter' }, 500, corsHeaders);
    }
  };
}
