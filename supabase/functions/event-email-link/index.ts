/**
 * P1380: redeem an event-email button. GET ?t=<ticket> → 302.
 *
 *   valid ticket → a magic link minted NOW for the RSVP's owner, delivered through the app's
 *                  /auth/verify (token_hash, P1257), which then opens the ticket's page.
 *   anything else → /login?redirect=<that page> when the page is known, else /events.
 *                  Never an error page: a dead button still lands the person where they
 *                  were going, one sign-in away.
 *
 * Deployed with --no-verify-jwt (scripts/deploy-functions.sh): it is opened from an inbox,
 * with no session. The ticket is the only credential, so:
 *   - only sha256(ticket) is stored, and only service_role can read the table;
 *   - the destination comes from the ticket's purpose, never from the request;
 *   - the ticket dies with the event (expires_at), with the RSVP (ON DELETE CASCADE) and when
 *     the event is cancelled;
 *   - nothing is written on behalf of the person here. "I'm here" is recorded by the app,
 *     after sign-in, in the person's own browser — a mail scanner that pre-fetches this URL
 *     mints an unused link and changes nothing (a later mint replaces it).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { hashTicket, isLinkPurpose, purposePath } from '../_shared/event-links.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://claritypledge.com').replace(/\/+$/, '');

const TICKET_RE = /^[A-Za-z0-9_-]{40,64}$/;

function redirect(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${SITE_URL}${path}`,
      // The Location of a valid ticket carries a sign-in token: never cache, never leak.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

const toLogin = (target: string | null) =>
  redirect(target ? `/login?redirect=${encodeURIComponent(target)}` : '/events');

serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const ticket = new URL(req.url).searchParams.get('t') ?? '';
  if (!TICKET_RE.test(ticket) || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return toLogin(null);

  // HEAD (link previews, some scanners) learns nothing and mints nothing.
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: link } = await supabase
      .from('event_email_links')
      .select(`
        token_hash, purpose, expires_at,
        event_rsvps!inner(id, profile_id, events!inner(slug, status))
      `)
      .eq('token_hash', await hashTicket(ticket))
      .maybeSingle();

    const row = link as unknown as {
      token_hash: string;
      purpose: string;
      expires_at: string;
      event_rsvps: { id: string; profile_id: string | null; events: { slug: string | null; status: string } | null } | null;
    } | null;
    const rsvp = row?.event_rsvps;
    const event = rsvp?.events;
    if (!row || !isLinkPurpose(row.purpose) || !event?.slug) return toLogin(null);

    const target = purposePath(row.purpose, event.slug);
    if (event.status === 'cancelled') return redirect(`/events/${event.slug}`);
    if (new Date(row.expires_at).getTime() <= Date.now() || !rsvp?.profile_id) return toLogin(target);

    const { data: user, error: userErr } = await supabase.auth.admin.getUserById(rsvp.profile_id);
    const email = user?.user?.email;
    if (userErr || !email) return toLogin(target);

    const { data: gen, error: genErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = gen?.properties?.hashed_token;
    if (genErr || !tokenHash) {
      console.error('event-email-link: generateLink failed:', genErr?.message ?? 'no hashed_token');
      return toLogin(target);
    }

    await supabase.from('event_email_links')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', row.token_hash);

    const params = new URLSearchParams({ token_hash: tokenHash, type: 'magiclink', redirect: target });
    return redirect(`/auth/verify?${params.toString()}`);
  } catch (err) {
    console.error('event-email-link error:', err);
    return toLogin(null);
  }
});
