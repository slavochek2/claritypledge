/**
 * @file create-and-sign/handler.ts
 * @description P1487: first sign-in for an agreement invitee, delivered to the invited mailbox.
 *
 * Accepts { agreementId, token, partnerName, termsVersion } — NO email from the client; the
 * address is the one the agreement was sent to. Wiring (env, Mailgun, serve) is in index.ts.
 *
 * The invitation token is not proof of owning the invited mailbox (the agreement's creator can
 * read it), so this handler never signs anyone in, never signs the agreement and never confirms
 * an account. It makes sure an account exists for the invited address in a state nothing but
 * that mailbox can activate, then emails a one-time sign-in link to that address. The partner
 * signs the agreement after they return, signed in.
 *
 *   - no account at the address      → created UNCONFIRMED
 *   - an unconfirmed account exists  → reset first (nothing its creator set survives)
 *   - a confirmed account exists     → left as it is; its owner just gets a sign-in link
 *
 * Nothing the caller types is written to the account: the profile name comes from the partner
 * once they are signed in (accept page). For an account the link will activate (created or reset)
 * the current terms version is kept server-side with a nonce that travels only in the emailed
 * link, and recorded when the partner signs in through it (consume_pending_terms_acceptance). A
 * confirmed account gets no such intent. The response is the same `{ ok, checkEmail }` in every
 * case — it says nothing about whether the address already had an account.
 *
 * Mail is rate-limited (P1225 limiter): the caller's IP bucket after the request shape is checked
 * and before the agreement is read; the invited-address bucket only once the invitation is known
 * to be valid, before any account change, link or mail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import {
  SIGNIN_MAIL_LIMITS,
  ipLimitKey,
  mailLimitResponse,
  reserveMailSlot,
  targetLimitKey,
  type RpcClient,
} from '../_shared/mail-rate-limit.ts';
import { resetUnconfirmedAccount } from '../_shared/unconfirmed-account.ts';
import { setPendingTermsAcceptance } from '../_shared/pending-terms.ts';
import { isCurrentTermsVersion } from '../_shared/terms-version.ts';

const FN_NAME = 'create-and-sign';

const AVATAR_COLORS = ['#0044CC', '#002B5C', '#FFD700', '#FF6B6B', '#4ECDC4'];


function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** The one-time sign-in email this handler sends to the invited address. */
export interface AgreementSignInEmail {
  to: string;
  /** The creator-set display name for the partner, if any (used only in the greeting). */
  partnerName: string | null;
  creatorName: string;
  link: string;
}

export interface CreateAndSignDeps {
  /** Service-role client. */
  supabase: SupabaseClient;
  /** Origin the emailed link points at, e.g. https://claritypledge.com */
  appUrl: string;
  /** Delivers the sign-in link to the invited mailbox. Throws on failure. */
  sendSignInEmail: (email: AgreementSignInEmail) => Promise<void>;
  /** Salt for the rate-limit keys. */
  ipHashSecret: string;
}

/**
 * Redeemed by /auth/verify, which hands off to /auth/callback (forwarding `terms_nonce`, which the
 * callback presents to consume_pending_terms_acceptance) and then back to the accept page.
 */
export function agreementSignInLink(appUrl: string, tokenHash: string, agreementId: string, token: string, termsNonce: string | null): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: 'magiclink',
    source: 'signup',
    redirect: `/agreements/${agreementId}/accept?token=${encodeURIComponent(token)}`,
  });
  if (termsNonce) params.set('terms_nonce', termsNonce);
  return `${appUrl}/auth/verify?${params.toString()}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler(deps: CreateAndSignDeps): (req: Request) => Promise<Response> {
  const { supabase, appUrl, sendSignInEmail, ipHashSecret } = deps;
  const limiter = supabase as unknown as RpcClient;

  return async (req: Request): Promise<Response> => {
    const corsHeaders = buildCorsHeaders(req);
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // `partnerName` may still be sent by clients; it is deliberately ignored (see header).
      const { agreementId, token, termsVersion } = await req.json() as {
        agreementId?: string;
        token?: string;
        termsVersion?: unknown;
      };

      // ── Input validation ────────────────────────────────────────────────
      if (!agreementId || !token) {
        return jsonResponse({ error: 'INVALID_INPUT', message: 'Missing required fields' }, 400, corsHeaders);
      }
      if (!isCurrentTermsVersion(termsVersion)) {
        return jsonResponse({ error: 'INVALID_TERMS_VERSION', message: 'Unsupported or missing terms version' }, 400, corsHeaders);
      }
      if (!UUID_RE.test(agreementId)) {
        return jsonResponse({ error: 'INVALID_INPUT', message: 'Invalid agreement ID' }, 400, corsHeaders);
      }
      // ── Rate limit: caller's IP, before the agreement is read ───────────
      const ipRefusal = mailLimitResponse(
        await reserveMailSlot(limiter, FN_NAME, 'ip', await ipLimitKey(req, ipHashSecret), SIGNIN_MAIL_LIMITS.ip),
        corsHeaders,
      );
      if (ipRefusal) return ipRefusal;

      // ── Fetch and validate the invitation ───────────────────────────────
      const { data: agreement, error: agError } = await supabase
        .from('clarity_agreements')
        .select('id, creator_profile_id, partner_email, partner_display_name, invitation_token, invitation_expires_at, status')
        .eq('id', agreementId)
        .single();
      if (agError || !agreement) {
        return jsonResponse({ error: 'NOT_FOUND', message: 'Agreement not found' }, 404, corsHeaders);
      }
      if (agreement.invitation_token !== token) {
        return jsonResponse({ error: 'INVALID_TOKEN', message: 'Invalid invitation' }, 403, corsHeaders);
      }
      if (agreement.status !== 'pending') {
        return jsonResponse({ error: 'ALREADY_PROCESSED', message: 'Agreement is no longer pending' }, 409, corsHeaders);
      }
      if (new Date(agreement.invitation_expires_at) <= new Date()) {
        return jsonResponse({ error: 'EXPIRED', message: 'Invitation has expired' }, 410, corsHeaders);
      }

      const partnerEmail = String(agreement.partner_email ?? '').trim().toLowerCase();
      if (!partnerEmail) {
        return jsonResponse({ error: 'NO_EMAIL', message: 'Invitation has no address' }, 400, corsHeaders);
      }

      const { data: creator } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', agreement.creator_profile_id)
        .single();
      if (creator?.email && String(creator.email).trim().toLowerCase() === partnerEmail) {
        return jsonResponse({ error: 'SELF_SIGN', message: 'Cannot sign your own agreement' }, 403, corsHeaders);
      }

      // ── Rate limit: the invited address, before any account, link or mail ─
      const targetRefusal = mailLimitResponse(
        await reserveMailSlot(limiter, FN_NAME, 'target', await targetLimitKey(partnerEmail, ipHashSecret), SIGNIN_MAIL_LIMITS.target),
        corsHeaders,
      );
      if (targetRefusal) return targetRefusal;

      // ── Make sure only the mailbox can activate the account ─────────────
      const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const metadata = { avatar_color: avatarColor };

      const { data: authUserRows } = await supabase.rpc('get_auth_user_by_email', { p_email: partnerEmail });
      const existing = (authUserRows as Array<{ id: string }> | null)?.[0] ?? null;

      let accountId: string;
      let activatedByLink: boolean;
      if (existing) {
        accountId = existing.id;
        // No-op for a confirmed account; resets an unconfirmed one.
        const outcome = await resetUnconfirmedAccount(supabase, existing.id, metadata);
        if (!outcome) {
          return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
        }
        activatedByLink = outcome === 'reset';
      } else {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: partnerEmail,
          email_confirm: false,
          user_metadata: metadata,
        });
        if (createError || !created?.user) {
          console.error('[create-and-sign] createUser failed:', createError?.message);
          return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
        }
        accountId = created.user.id;
        activatedByLink = true;
      }

      // Only for an account this link will activate: the terms accepted by pressing "sign", kept
      // server-side and bound to this link. Never for an already-confirmed account.
      let termsNonce: string | null = null;
      if (activatedByLink) {
        termsNonce = await setPendingTermsAcceptance(supabase, accountId, termsVersion);
        if (!termsNonce) {
          return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
        }
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: partnerEmail,
      });
      if (linkError || !linkData?.properties?.hashed_token) {
        console.error('[create-and-sign] generateLink failed:', linkError?.message);
        return jsonResponse({ error: 'SIGNIN_LINK_FAILED', message: "Couldn't send your sign-in link. Please try again." }, 500, corsHeaders);
      }

      try {
        await sendSignInEmail({
          to: partnerEmail,
          partnerName: (agreement.partner_display_name as string | null)?.trim() || null,
          creatorName: (creator?.name as string | null)?.trim() || 'Your partner',
          link: agreementSignInLink(appUrl, linkData.properties.hashed_token, agreementId, token, termsNonce),
        });
      } catch (emailErr) {
        console.error('[create-and-sign] sign-in email failed:', emailErr);
        return jsonResponse({ error: 'EMAIL_FAILED', message: "Couldn't send your sign-in link. Please try again." }, 502, corsHeaders);
      }

      // Same answer whether or not the address already had an account; nothing that signs anyone in.
      return jsonResponse({ ok: true, checkEmail: true }, 200, corsHeaders);
    } catch (err) {
      console.error('[create-and-sign] Unexpected error:', err);
      return jsonResponse({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }, 500, corsHeaders);
    }
  };
}
