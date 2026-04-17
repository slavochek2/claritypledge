/**
 * @file send-letter-response-signin/index.ts
 * @description P684 — Branded Mailgun sender for the letter-response sign-in email.
 *
 * Receives: { to, actionLink, senderName }
 * Reads the HTML template from _shared/templates/letter-response-signin.html,
 * substitutes template variables, and posts to Mailgun.
 *
 * Called by: request-letter-response-signin (or future callers needing this email).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ── Env ───────────────────────────────────────────────────────────────────────

const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') ?? '';
const MAILGUN_DOMAIN = Deno.env.get('MAILGUN_DOMAIN') ?? '';
const MAILGUN_REGION = Deno.env.get('MAILGUN_REGION') ?? 'us';
const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? 'https://claritypledge.com';

const MAILGUN_BASE =
  MAILGUN_REGION === 'eu'
    ? 'https://api.eu.mailgun.net/v3'
    : 'https://api.mailgun.net/v3';

// FROM: prefer explicit MAILGUN_FROM env var; fall back to letters@<domain>
const FROM =
  Deno.env.get('MAILGUN_FROM') ?? `Clarity Pledge <letters@${MAILGUN_DOMAIN}>`;

// [FOUNDER DECISION: email subject line]
const SUBJECT = 'Save your letter responses — click to confirm';

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── HTML escaping ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Template loading ──────────────────────────────────────────────────────────

async function loadTemplate(): Promise<string> {
  // Deno edge functions run from the function's own directory; _shared is a sibling.
  const templatePath = new URL(
    '../_shared/templates/letter-response-signin.html',
    import.meta.url,
  );
  return await Deno.readTextFile(templatePath);
}

function renderTemplate(
  template: string,
  vars: { actionLink: string; senderName: string; recipientEmail: string },
): string {
  return template
    .replace(/\{\{ACTION_LINK\}\}/g, escapeHtml(vars.actionLink))
    .replace(/\{\{SENDER_NAME\}\}/g, escapeHtml(vars.senderName))
    .replace(/\{\{RECIPIENT_EMAIL\}\}/g, escapeHtml(vars.recipientEmail));
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

function buildTextBody(opts: {
  actionLink: string;
  senderName: string;
  recipientEmail: string;
}): string {
  return [
    `You're one step away from sharing your responses with ${opts.senderName}.`,
    '',
    'Click the link below to save your responses and create your ClarityPledge account:',
    '',
    opts.actionLink,
    '',
    'This link expires in 1 hour. If you didn\'t request this, you can ignore this email.',
    '',
    'Clarity Pledge · claritypledge.com',
  ].join('\n');
}

// ── Mailgun send ──────────────────────────────────────────────────────────────

async function sendEmail(opts: {
  to: string;
  html: string;
  text: string;
}): Promise<void> {
  const body = new FormData();
  body.append('from', FROM);
  body.append('to', opts.to);
  body.append('subject', SUBJECT);
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
    console.error('[send-letter-response-signin] Mailgun error:', res.status, err);
    throw new Error(`Mailgun send failed: ${res.status}`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Env guard
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error('[send-letter-response-signin] Missing MAILGUN_API_KEY or MAILGUN_DOMAIN');
      return new Response(JSON.stringify({ error: 'Missing required env vars' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    let parsed: { to?: unknown; actionLink?: unknown; senderName?: unknown };
    try {
      parsed = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { to, actionLink, senderName } = parsed;

    if (
      typeof to !== 'string' ||
      typeof actionLink !== 'string' ||
      typeof senderName !== 'string' ||
      !to.trim() ||
      !actionLink.trim() ||
      !senderName.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid fields: to, actionLink, senderName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Load and render template
    const template = await loadTemplate();
    const html = renderTemplate(template, {
      actionLink: actionLink.trim(),
      senderName: senderName.trim(),
      recipientEmail: to.trim(),
    });

    const text = buildTextBody({
      actionLink: actionLink.trim(),
      senderName: senderName.trim(),
      recipientEmail: to.trim(),
    });

    // Send
    await sendEmail({ to: to.trim(), html, text });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-letter-response-signin] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
