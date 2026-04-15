/**
 * @file send-letter-emails/index.ts
 * @description P581: Send email notifications for Clarity Letters.
 *
 * Receives { letterId } — queries clarity_letters + letter_deliveries + sender profile,
 * then sends an invitation email to each delivery with a receiver_email.
 *
 * Cloned from send-agreement-emails, adapted for letter-specific copy and CTA.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge <letters@${MAILGUN_DOMAIN}>`;

// -- HTML email base template (mirrors send-agreement-emails) -----------------

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
                Clarity Pledge &middot; <a href="https://claritypledge.com" style="color:#9ca3af;">claritypledge.com</a>
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

// -- Mailgun send -------------------------------------------------------------

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

// -- Types --------------------------------------------------------------------

interface LetterRow {
  id: string;
  sender_id: string;
  mode: string;
  status: string;
}

interface DeliveryRow {
  id: string;
  receiver_email: string | null;
  receiver_name: string | null;
  invitation_token: string | null;
}

interface ProfileRow {
  id: string;
  name: string | null;
  email: string | null;
}

// -- Entry point --------------------------------------------------------------

const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      return new Response(JSON.stringify({ error: 'Missing required env vars' }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing required env vars' }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Derive app URL from request origin so local dev gets localhost links
    const requestOrigin = req.headers.get('origin');
    const appUrl = (requestOrigin && requestOrigin.startsWith('http://localhost'))
      ? requestOrigin
      : APP_URL;

    const { letterId } = await req.json() as { letterId: string };

    if (!letterId) {
      return new Response(JSON.stringify({ error: 'Missing letterId' }), { status: 400, headers: corsHeaders });
    }

    // Fetch the letter
    const { data: letter } = await supabase
      .from('clarity_letters')
      .select('id, sender_id, mode, status')
      .eq('id', letterId)
      .single() as { data: LetterRow | null };

    if (!letter) {
      return new Response(JSON.stringify({ error: 'Letter not found' }), { status: 404, headers: corsHeaders });
    }

    // Fetch sender profile
    const { data: sender } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', letter.sender_id)
      .single() as { data: ProfileRow | null };

    const senderName = sender?.name ?? 'Someone';

    // Fetch deliveries with receiver_email
    const { data: deliveries } = await supabase
      .from('letter_deliveries')
      .select('id, receiver_email, receiver_name, invitation_token')
      .eq('letter_id', letterId)
      .not('receiver_email', 'is', null) as { data: DeliveryRow[] | null };

    if (!deliveries || deliveries.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // HTML-escape helper (defense-in-depth against name injection)
    function esc(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Send email to each delivery
    await Promise.all(
      deliveries.map(async (delivery) => {
        if (!delivery.receiver_email || !delivery.invitation_token) return;

        // P710: For registered recipients, generate a magic link so they land already authenticated.
        // Falls back to plain token URL if lookup or link generation fails.
        let ctaUrl = `${appUrl}/letter/${delivery.id}?token=${delivery.invitation_token}`;
        try {
          const normalizedEmail = delivery.receiver_email.toLowerCase();
          const { data: authUserRows } = await supabase.rpc('get_auth_user_by_email', {
            p_email: normalizedEmail,
          });
          const isRegistered = Array.isArray(authUserRows) && authUserRows.length > 0;
          if (isRegistered) {
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'magiclink',
              email: normalizedEmail,
              options: {
                redirectTo: `${appUrl}/letter/${delivery.id}?token=${delivery.invitation_token}`,
              },
            });
            if (!linkError && linkData?.properties?.action_link) {
              ctaUrl = linkData.properties.action_link;
            }
          }
        } catch (e) {
          console.warn('P710: magic-link generation failed, using plain token URL:', e);
        }
        const safeSenderName = esc(senderName);

        // Personalized greeting using receiver_name first name
        const receiverFirstName = delivery.receiver_name
          ? esc(delivery.receiver_name.split(' ')[0])
          : null;
        const greeting = receiverFirstName ? `Hi ${receiverFirstName},` : 'Hi,';

        // Strip control characters from subject (defense-in-depth against header injection)
        const subject = `${senderName.replace(/[\r\n]/g, '')} sent you a Clarity Letter`;

        const html = htmlEmail(subject, `
          <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting}</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;">${safeSenderName} sent you a Clarity Letter</h1>
          ${button('Open the Letter', ctaUrl)}
          <p style="margin:20px 0 0;font-size:11px;color:#d1d5db;">
            Your email was shared by ${safeSenderName}. Remove: <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
          </p>
        `);

        const textGreeting = receiverFirstName ? `Hi ${receiverFirstName},\n\n` : '';
        const text = `${textGreeting}${senderName} sent you a Clarity Letter.\n\nOpen the Letter: ${ctaUrl}\n\nYour email was shared by ${senderName}. Remove: privacy@claritypledge.com`;

        await sendEmail({ to: delivery.receiver_email, subject, html, text });
      })
    );

    return new Response(JSON.stringify({ ok: true, sent: deliveries.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-letter-emails error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
