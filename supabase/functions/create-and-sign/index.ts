/**
 * @file create-and-sign/index.ts
 * @description P527 → P1487: the agreement invitee's first sign-in, delivered to their mailbox.
 *
 * Wiring only: environment, the service-role client, the Mailgun sender, serve(). The request
 * logic, including the caller gate (the invitation check), is in handler.ts.
 *
 * Deployed --no-verify-jwt: invitees reach it before they have an account.
 */

import { createClient } from '@supabase/supabase-js';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { createHandler, type AgreementSignInEmail } from './handler.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';
const FROM = `Clarity Pledge <agreements@${MAILGUN_DOMAIN}>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same frame as the other agreement and letter emails. */
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

async function sendSignInEmail(email: AgreementSignInEmail): Promise<void> {
  const firstName = email.partnerName?.trim().split(/\s+/)[0] || 'there';
  const creator = email.creatorName.replace(/[\r\n]/g, '');
  const subject = `Sign in to sign your agreement with ${creator}`;

  const html = htmlEmail(subject, `
    <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">One step left</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4b5563;">
      Click the button below to sign in and complete your Clarity Partner Agreement with
      ${escapeHtml(creator)}. This link works on any device.
    </p>
    <a href="${escapeHtml(email.link)}" style="display:inline-block;background:#002B5C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">Sign in and sign</a>
    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      This link expires in 1 hour and can be used once. If you didn't ask to sign an agreement, you can ignore this email.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">
      By clicking the button, you confirm your acceptance of the Terms of Service and Privacy Policy.
      Questions? <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
    </p>
  `);

  const text = `Hi ${firstName},\n\nSign in and complete your Clarity Partner Agreement with ${creator}:\n\n${email.link}\n\nThis link expires in 1 hour, can be used once, and works on any device.\n\nIf you didn't ask to sign an agreement, you can ignore this email.\n\nClarity Pledge`;

  const body = new FormData();
  body.append('from', FROM);
  body.append('to', email.to);
  body.append('subject', subject);
  body.append('html', html);
  body.append('text', text);

  const res = await fetch(`${MAILGUN_BASE}/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}` },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[create-and-sign] Mailgun error:', res.status, err);
    throw new Error(`Mailgun send failed: ${res.status}`);
  }
}

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ipHashSecret = Deno.env.get('IP_HASH_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !MAILGUN_API_KEY || !MAILGUN_DOMAIN || !ipHashSecret) {
    console.error('[create-and-sign] SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAILGUN_API_KEY, MAILGUN_DOMAIN or IP_HASH_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'INTERNAL', message: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return createHandler({
    supabase: createClient(supabaseUrl, serviceRoleKey),
    appUrl: Deno.env.get('APP_URL') ?? 'https://claritypledge.com',
    sendSignInEmail,
    ipHashSecret,
  })(req);
});
