import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// P1178: shared secret proving an internal edge-function caller (create-and-sign).
// Such a caller has no user to resolve, so auth.getUser() can never authorize it.
const INTERNAL_FN_SECRET = Deno.env.get('INTERNAL_FN_SECRET') ?? '';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge <agreements@${MAILGUN_DOMAIN}>`;

// ── HTML escaping ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── HTML email base template ──────────────────────────────────────────────────

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

function button(text: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#002B5C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">${escapeHtml(text)}</a>`;
}

/** Extract first name from "First Last" or return null */
function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

function greeting(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `Hi ${first},` : 'Hi there,';
}

// ── Mailgun send ──────────────────────────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const body = new FormData();
  body.append('from', FROM);
  body.append('to', opts.to);
  body.append('subject', opts.subject);
  body.append('html', opts.html);
  body.append('text', opts.text);

  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Mailgun error:', res.status, err);
  }
}

// ── Agreement types ───────────────────────────────────────────────────────────

interface AgreementRow {
  id: string;
  creator_profile_id: string;
  partner_profile_id: string | null;
  partner_email: string;
  invitation_token: string;
  invitation_expires_at: string;
  status: string;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
}

// ── Action handlers ───────────────────────────────────────────────────────────

 
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

async function handleInvitation(
  supabase: SupabaseClient,
  agreementId: string,
  appUrl: string
) {
  const { data: agreement } = await supabase
    .from('clarity_agreements')
    .select('id, creator_profile_id, partner_email, invitation_token')
    .eq('id', agreementId)
    .single() as { data: AgreementRow | null };

  if (!agreement) throw new Error('Agreement not found');

  const { data: creator } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', agreement.creator_profile_id)
    .single() as { data: ProfileRow | null };

  const creatorName = creator?.name ?? 'Someone';
  const safeCreatorName = escapeHtml(creatorName);
  const acceptUrl = `${appUrl}/agreements/${agreementId}/accept?token=${agreement.invitation_token}`;

  // P488: For existing users, generate a magic link so they arrive authenticated.
  // New users get the direct acceptUrl (unchanged).
  let ctaUrl = acceptUrl;
  // Personalize the greeting when we know the recipient's name. For existing users
  // we read it from their profile; for a self-invite the recipient is the creator.
  // Brand-new email-only recipients have no name anywhere → greeting() falls back.
  let partnerName: string | null = null;
  const isCreatorEmail = agreement.partner_email === creator?.email;

  if (isCreatorEmail) {
    partnerName = creator?.name ?? null;
  } else {
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('email', agreement.partner_email)
      .maybeSingle();

    if (existingUser) {
      partnerName = existingUser.name ?? null;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: agreement.partner_email,
        options: { redirectTo: acceptUrl },
      });

      if (!linkError && linkData?.properties?.action_link) {
        ctaUrl = linkData.properties.action_link;
        console.log(`[P488] Magic link generated for existing user (agreement ${agreementId})`);
      } else {
        console.log(`[P488] Magic link failed, falling back to direct URL (agreement ${agreementId})`, linkError?.message);
      }
    } else {
      console.log(`[P488] New user — using direct accept URL (agreement ${agreementId})`);
    }
  }

  const subject = `${creatorName} invited you to a Clarity Partner Agreement`;
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${escapeHtml(greeting(partnerName))}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">You've been invited</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      <strong>${safeCreatorName}</strong> has invited you to a Clarity Partner Agreement —
      a mutual commitment to avoid false disagreements when shit hits the fan.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">
      You can review the full agreement terms before deciding to accept or decline.
    </p>
    ${button('Review & Sign Agreement', ctaUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      This invitation expires in 7 days. If you're new to Clarity Pledge,
      you'll be able to create an account as part of the signing flow.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">
      Your email was shared by ${safeCreatorName} to send this invite. Remove it: <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
    </p>
  `);
  const text = `${greeting(partnerName)}\n\n${creatorName} invited you to a Clarity Partner Agreement.\n\nReview and sign: ${ctaUrl}\n\nThis invitation expires in 7 days.\n\nYour email was shared by ${creatorName} to send this invite. Remove it: privacy@claritypledge.com\nClarity Pledge`;

  await sendEmail({ to: agreement.partner_email, subject, html, text });
}

async function handleAccepted(
  supabase: SupabaseClient,
  agreementId: string
) {
  const { data: agreement } = await supabase
    .from('clarity_agreements')
    .select('id, creator_profile_id, partner_profile_id')
    .eq('id', agreementId)
    .single() as { data: AgreementRow | null };

  if (!agreement) throw new Error('Agreement not found');

  const { data: creator } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', agreement.creator_profile_id)
    .single() as { data: ProfileRow | null };

  const { data: partner } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', agreement.partner_profile_id)
    .single() as { data: ProfileRow | null };

  if (!creator?.email) return;

  const partnerName = partner?.name ?? 'Your partner';
  const safePartnerName = escapeHtml(partnerName);
  const agreementUrl = `${APP_URL}/agreements/${agreementId}`;
  const subject = `${partnerName} co-signed your Clarity Partner Agreement`;
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${escapeHtml(greeting(creator?.name))}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Agreement sealed</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      <strong>${safePartnerName}</strong> has accepted and co-signed your Clarity Partner Agreement.
      Your agreement is now active.
    </p>
    ${button('View Agreement', agreementUrl)}
  `);
  const text = `${partnerName} co-signed your Clarity Partner Agreement. It's now active.\n\nView: ${agreementUrl}\nClarity Pledge`;

  await sendEmail({ to: creator.email, subject, html, text });
}

async function handleDeclined(
  supabase: SupabaseClient,
  agreementId: string
) {
  const { data: agreement } = await supabase
    .from('clarity_agreements')
    .select('id, creator_profile_id, partner_email')
    .eq('id', agreementId)
    .single() as { data: AgreementRow | null };

  if (!agreement) throw new Error('Agreement not found');

  const { data: creator } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', agreement.creator_profile_id)
    .single() as { data: ProfileRow | null };

  if (!creator?.email) return;

  const subject = 'Your Clarity Partner Agreement invitation was declined';
  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">${escapeHtml(greeting(creator?.name))}</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Invitation declined</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      The recipient at <strong>${escapeHtml(agreement.partner_email)}</strong> declined your Clarity Partner Agreement invitation.
    </p>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      Consider connecting through a /live session first — agreements signed from shared experience tend to stick.
    </p>
  `);
  const text = `${agreement.partner_email} declined your Clarity Partner Agreement invitation.\n\nConsider a /live session first.\nClarity Pledge`;

  await sendEmail({ to: creator.email, subject, html, text });
}

async function handleTerminated(
  supabase: SupabaseClient,
  agreementId: string
) {
  const { data: agreement } = await supabase
    .from('clarity_agreements')
    .select('id, creator_profile_id, partner_profile_id, partner_email')
    .eq('id', agreementId)
    .single() as { data: AgreementRow | null };

  if (!agreement) throw new Error('Agreement not found');

  // Fetch both parties
  const profileIds = [agreement.creator_profile_id, agreement.partner_profile_id].filter(Boolean) as string[];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', profileIds) as { data: ProfileRow[] | null };

  const agreementUrl = `${APP_URL}/agreements/${agreementId}`;
  const subject = 'Your Clarity Partner Agreement has been terminated';

  // Collect recipients with names for personalization
  const recipients: { email: string; name: string | null }[] = [];
  if (profiles) {
    for (const p of profiles) {
      if (p.email) recipients.push({ email: p.email, name: p.name });
    }
  }
  // If partner never registered, notify via partner_email (no name available)
  if (!agreement.partner_profile_id && agreement.partner_email) {
    recipients.push({ email: agreement.partner_email, name: null });
  }

  await Promise.all(
    recipients.map(r => {
      const html = htmlEmail(subject, `
        <p style="margin:0 0 16px;font-size:16px;color:#111827;">${escapeHtml(greeting(r.name))}</p>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Agreement terminated</h1>
        <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
          One party has terminated this Clarity Partner Agreement.
          The agreement is now archived and no longer active.
        </p>
        ${button('View Agreement History', agreementUrl)}
      `);
      const first = firstName(r.name);
      const text = `${first ? `Hi ${first},\n\n` : ''}Your Clarity Partner Agreement has been terminated.\n\nView history: ${agreementUrl}\nClarity Pledge`;
      return sendEmail({ to: r.email, subject, html, text });
    })
  );
}

async function handleResend(
  supabase: SupabaseClient,
  agreementId: string,
  appUrl: string
) {
  // Rotate token and extend expiry FIRST, then re-fetch and send
  await supabase
    .from('clarity_agreements')
    .update({
      invitation_token: crypto.randomUUID(),
      invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', agreementId);

  // handleInvitation re-fetches the agreement, so it picks up the new token
  await handleInvitation(supabase, agreementId, appUrl);
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Guard: Mailgun env vars (module-level ?? '' for Deno, checked here)
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error('[send-agreement-emails] MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
    }

    // Use service role for DB operations — bypasses RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey || !SUPABASE_ANON_KEY) {
      console.error('[send-agreement-emails] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not configured');
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
    }

    // ── Caller authentication ─────────────────────────────────────────────────
    // Two kinds of caller exist:
    //   1. A party to the agreement holding a user JWT — the app's normal path.
    //   2. An internal edge function (create-and-sign, the P527 direct-sign flow)
    //      holding INTERNAL_FN_SECRET. It acts for no user, so auth.getUser() can
    //      never authorize it: pre-P1178 it sent the service-role key in the Bearer
    //      position and got a silent 401, so the accepted-email never sent.
    const internalSecretHeader = req.headers.get('x-internal-secret');
    const isInternal = INTERNAL_FN_SECRET !== '' && internalSecretHeader === INTERNAL_FN_SECRET;

    let callerId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      const token = authHeader.replace('Bearer ', '');
      const anonClient = createClient(supabaseUrl, SUPABASE_ANON_KEY);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }
      callerId = user.id;
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    // Derive app URL from request origin so local dev gets localhost links in emails
    const requestOrigin = req.headers.get('origin');
    const appUrl = (requestOrigin && requestOrigin.startsWith('http://localhost'))
      ? requestOrigin
      : APP_URL;

    const { action, agreementId } = await req.json() as {
      action: 'invitation' | 'accepted' | 'declined' | 'terminated' | 'resend';
      agreementId: string;
    };

    if (!action || !agreementId) {
      return new Response(JSON.stringify({ error: 'Missing action or agreementId' }), { status: 400, headers: corsHeaders });
    }

    // Least privilege for internal callers: 'accepted' is the only notification any
    // internal caller fires today, so a leaked secret cannot blast invitations or
    // resends at arbitrary agreement ids.
    if (isInternal && action !== 'accepted') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    // ── Authorization: caller must be a party to the agreement ────────────────
    const { data: agreementCheck } = await supabaseClient
      .from('clarity_agreements')
      .select('creator_profile_id, partner_profile_id, status')
      .eq('id', agreementId)
      .single();

    if (!agreementCheck) {
      return new Response(JSON.stringify({ error: 'Agreement not found' }), { status: 404, headers: corsHeaders });
    }

    // Internal callers carry no user identity, so the party check cannot apply to
    // them — the shared secret is their authorization, and these two checks are
    // their scope. accept_agreement sets status = 'active' (p443 migration), so an
    // internal 'accepted' notification is only ever legitimate for an active
    // agreement; without this, a leaked secret could fire "X co-signed your
    // agreement" at the creator of a pending, declined or terminated one.
    if (isInternal && agreementCheck.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    if (!isInternal) {
      const isParty =
        agreementCheck.creator_profile_id === callerId ||
        agreementCheck.partner_profile_id === callerId;

      if (!isParty) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    switch (action) {
      case 'invitation':
        await handleInvitation(supabaseClient, agreementId, appUrl);
        break;
      case 'accepted':
        await handleAccepted(supabaseClient, agreementId);
        break;
      case 'declined':
        await handleDeclined(supabaseClient, agreementId);
        break;
      case 'terminated':
        await handleTerminated(supabaseClient, agreementId);
        break;
      case 'resend':
        await handleResend(supabaseClient, agreementId, appUrl);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-agreement-emails error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
  }
});
