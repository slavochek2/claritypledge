import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY')!;
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN')!;
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge <agreements@${MAILGUN_DOMAIN}>`;

// ── HTML email base template ──────────────────────────────────────────────────

function htmlEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
  return `<a href="${url}" style="display:inline-block;background:#002B5C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">${text}</a>`;
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

async function handleInvitation(
  supabase: ReturnType<typeof createClient>,
  agreementId: string
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
  const acceptUrl = `${APP_URL}/agreements/${agreementId}/accept?token=${agreement.invitation_token}`;

  const subject = `${creatorName} invited you to a Clarity Partner Agreement`;
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">You've been invited</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      <strong>${creatorName}</strong> has invited you to a Clarity Partner Agreement —
      a mutual commitment to maintain communication health through regular /live sessions.
    </p>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">
      You can review the full agreement terms before deciding to accept or decline.
    </p>
    ${button('Review & Sign Agreement', acceptUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      This invitation expires in 7 days. If you're new to Clarity Pledge,
      you'll be able to create an account as part of the signing flow.
    </p>
  `);
  const text = `${creatorName} invited you to a Clarity Partner Agreement.\n\nReview and sign: ${acceptUrl}\n\nThis invitation expires in 7 days.\nClarity Pledge`;

  await sendEmail({ to: agreement.partner_email, subject, html, text });
}

async function handleAccepted(
  supabase: ReturnType<typeof createClient>,
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
  const agreementUrl = `${APP_URL}/agreements/${agreementId}`;
  const subject = `${partnerName} co-signed your Clarity Partner Agreement`;
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Agreement sealed</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      <strong>${partnerName}</strong> has accepted and co-signed your Clarity Partner Agreement.
      Your agreement is now active.
    </p>
    ${button('View Agreement', agreementUrl)}
  `);
  const text = `${partnerName} co-signed your Clarity Partner Agreement. It's now active.\n\nView: ${agreementUrl}\nClarity Pledge`;

  await sendEmail({ to: creator.email, subject, html, text });
}

async function handleDeclined(
  supabase: ReturnType<typeof createClient>,
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
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Invitation declined</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      The recipient at <strong>${agreement.partner_email}</strong> declined your Clarity Partner Agreement invitation.
    </p>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      Consider connecting through a /live session first — agreements signed from shared experience tend to stick.
    </p>
  `);
  const text = `${agreement.partner_email} declined your Clarity Partner Agreement invitation.\n\nConsider a /live session first.\nClarity Pledge`;

  await sendEmail({ to: creator.email, subject, html, text });
}

async function handleTerminated(
  supabase: ReturnType<typeof createClient>,
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
  const html = htmlEmail(subject, `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Agreement terminated</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      One party has terminated this Clarity Partner Agreement.
      The agreement is now archived and no longer active.
    </p>
    ${button('View Agreement History', agreementUrl)}
  `);
  const text = `Your Clarity Partner Agreement has been terminated.\n\nView history: ${agreementUrl}\nClarity Pledge`;

  // Collect emails to notify
  const emailsToNotify: string[] = [];
  if (profiles) {
    for (const p of profiles) {
      if (p.email) emailsToNotify.push(p.email);
    }
  }
  // If partner never registered, notify via partner_email
  if (!agreement.partner_profile_id && agreement.partner_email) {
    emailsToNotify.push(agreement.partner_email);
  }

  await Promise.all(
    emailsToNotify.map(email => sendEmail({ to: email, subject, html, text }))
  );
}

async function handleResend(
  supabase: ReturnType<typeof createClient>,
  agreementId: string
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
  await handleInvitation(supabase, agreementId);
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Use service role for DB operations — bypasses RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { action, agreementId } = await req.json() as {
      action: 'invitation' | 'accepted' | 'declined' | 'terminated' | 'resend';
      agreementId: string;
    };

    if (!action || !agreementId) {
      return new Response(JSON.stringify({ error: 'Missing action or agreementId' }), { status: 400 });
    }

    switch (action) {
      case 'invitation':
        await handleInvitation(supabaseClient, agreementId);
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
        await handleResend(supabaseClient, agreementId);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-agreement-emails error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
