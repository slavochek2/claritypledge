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
import { buildCorsHeaders } from '../_shared/cors.ts';

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const MAILGUN_BASE = MAILGUN_REGION === 'eu'
  ? 'https://api.eu.mailgun.net/v3'
  : 'https://api.mailgun.net/v3';

const FROM = `Clarity Pledge <letters@${MAILGUN_DOMAIN}>`;

// HTML-escape helper (defense-in-depth against name injection). Module scope so
// htmlEmail()/button() can use it — mirrors escapeHtml() in send-agreement-emails.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -- HTML email base template (mirrors send-agreement-emails) -----------------

function htmlEmail(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
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
  return `<a href="${esc(url)}" style="display:inline-block;background:#002B5C;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:500;margin-top:20px;">${esc(text)}</a>`;
}

// -- Mailgun send -------------------------------------------------------------

// P884: returns success so callers can unclaim the delivery on failure.
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
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
    return false;
  }
  return true;
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

serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error('[send-letter-emails] MAILGUN_API_KEY or MAILGUN_DOMAIN not configured');
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[send-letter-emails] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
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

    // P884: caller authorization — both call sites (seal + add-recipient) run
    // with a signed-in sender, so supabase.functions.invoke forwards the user
    // JWT. The bare anon key carries no user and is rejected here, closing the
    // "anyone with a letterId can trigger emails" gap.
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerJwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: callerData, error: callerError } = await supabase.auth.getUser(callerJwt);
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: corsHeaders });
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

    // P884: only the letter sender may trigger invitation emails.
    if (callerData.user.id !== letter.sender_id) {
      return new Response(JSON.stringify({ error: 'Only the letter sender can send letter emails' }), { status: 403, headers: corsHeaders });
    }

    // Fetch sender profile
    const { data: sender } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', letter.sender_id)
      .single() as { data: ProfileRow | null };

    const senderName = sender?.name ?? 'Someone';

    // Fetch deliveries with receiver_email that have NOT been notified yet.
    // P884: the notified_at filter is what makes repeat invokes (add-recipient,
    // double-click seal, network retry) email only new deliveries.
    const { data: deliveries } = await supabase
      .from('letter_deliveries')
      .select('id, receiver_email, receiver_name, invitation_token')
      .eq('letter_id', letterId)
      .not('receiver_email', 'is', null)
      .is('notified_at', null) as { data: DeliveryRow[] | null };

    if (!deliveries || deliveries.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email to each un-notified delivery
    const sendResults = await Promise.all(
      deliveries.map(async (delivery): Promise<boolean> => {
        if (!delivery.receiver_email || !delivery.invitation_token) return false;

        // P884: atomically claim this delivery before sending — a concurrent
        // or repeated invoke finds notified_at already set and skips the row,
        // so no delivery is ever emailed twice.
        const { data: claimed, error: claimError } = await supabase
          .from('letter_deliveries')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', delivery.id)
          .is('notified_at', null)
          .select('id');
        if (claimError || !claimed || claimed.length === 0) {
          if (claimError) console.error('P884: delivery claim failed:', claimError);
          return false;
        }

        // P884: unclaim so a later invoke can retry this delivery.
        const unclaim = async () => {
          const { error: unclaimError } = await supabase
            .from('letter_deliveries')
            .update({ notified_at: null })
            .eq('id', delivery.id);
          if (unclaimError) console.error('P884: delivery unclaim failed:', unclaimError);
        };

        try {
          // P710: For registered recipients, generate a magic link so they land already authenticated.
          // Falls back to plain token URL if lookup or link generation fails.
          let ctaUrl = `${appUrl}/letter/${delivery.id}?token=${delivery.invitation_token}`;
          // When the sender didn't type a recipient name, fall back to the registered
          // recipient's profile name so the greeting isn't a bare "Hi there,".
          let registeredName: string | null = null;
          try {
            const normalizedEmail = delivery.receiver_email.toLowerCase();
            const { data: authUserRows } = await supabase.rpc('get_auth_user_by_email', {
              p_email: normalizedEmail,
            });
            const isRegistered = Array.isArray(authUserRows) && authUserRows.length > 0;
            if (isRegistered) {
              const registeredUserId = authUserRows[0].id;

              if (!delivery.receiver_name) {
                const { data: regProfile } = await supabase
                  .from('profiles')
                  .select('name')
                  .eq('id', registeredUserId)
                  .maybeSingle();
                registeredName = regProfile?.name ?? null;
              }

              // P710 QA fix: pre-claim the delivery so the recipient sees it in their inbox
              // immediately — without having to click the email link first.
              // get_inbox_items filters WHERE receiver_profile_id = auth.uid(); without this
              // UPDATE the row stays unclaimed (NULL) and the inbox appears empty.
              // claim_letter_delivery is idempotent for the same user, so the email-link
              // click still works correctly after this pre-claim.
              try {
                await supabase
                  .from('letter_deliveries')
                  .update({ receiver_profile_id: registeredUserId })
                  .eq('id', delivery.id)
                  .is('receiver_profile_id', null); // only if not already claimed
              } catch (updateErr) {
                console.warn('P710: receiver_profile_id pre-claim failed (non-fatal):', updateErr);
              }

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

          // Personalized greeting: name typed at compose time, else the registered
          // recipient's profile name, else a generic greeting. trim()+\s+ split so a
          // leading/extra space doesn't drop a valid name. Keep `greeting` raw and
          // escape at the HTML boundary (below) — plaintext uses it unescaped.
          const effectiveName = delivery.receiver_name || registeredName;
          const receiverFirstName = effectiveName
            ? effectiveName.trim().split(/\s+/)[0]
            : '';
          const greeting = receiverFirstName ? `Hi ${receiverFirstName},` : 'Hi there,';

          // Strip control characters from subject (defense-in-depth against header injection)
          const subject = `${senderName.replace(/[\r\n]/g, '')} sent you a Clarity Letter`;

          const html = htmlEmail(subject, `
            <p style="margin:0 0 16px;font-size:16px;color:#111827;">${esc(greeting)}</p>
            <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;">${safeSenderName} sent you a Clarity Letter</h1>
            ${button('Open the Letter', ctaUrl)}
            <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">
              By opening this letter, you'll create a Clarity Pledge account.
              <a href="https://claritypledge.com/terms-of-service" style="color:#6b7280;">Terms of Service</a>
              &middot;
              <a href="https://claritypledge.com/privacy-policy" style="color:#6b7280;">Privacy Policy</a>
            </p>
            <p style="margin:20px 0 0;font-size:11px;color:#d1d5db;">
              Your email was shared by ${safeSenderName}. Remove: <a href="mailto:privacy@claritypledge.com" style="color:#d1d5db;">privacy@claritypledge.com</a>
            </p>
          `);

          const text = `${greeting}\n\n${senderName} sent you a Clarity Letter.\n\nOpen the Letter: ${ctaUrl}\n\nBy opening this letter, you'll create a Clarity Pledge account.\nTerms: https://claritypledge.com/terms-of-service | Privacy: https://claritypledge.com/privacy-policy\n\nYour email was shared by ${senderName}. Remove: privacy@claritypledge.com`;

          const sentOk = await sendEmail({ to: delivery.receiver_email, subject, html, text });
          if (!sentOk) {
            await unclaim();
            return false;
          }
          return true;
        } catch (deliveryErr) {
          // P884: claimed but not sent — release the claim so a retry can send.
          console.error('P884: delivery send failed:', deliveryErr);
          await unclaim();
          return false;
        }
      })
    );

    // P884: count only deliveries actually claimed and sent in THIS invoke.
    const sentCount = sendResults.filter(Boolean).length;

    return new Response(JSON.stringify({ ok: true, sent: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-letter-emails error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers: corsHeaders });
  }
});
