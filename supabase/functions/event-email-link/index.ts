/**
 * P1380: redeem an event-email button. POST { t: <ticket> } → { to: <app path> }.
 *
 * The email button opens the APP page /auth/event-link?ticket=… ("Continue"). Only the tap on that
 * page calls this function — so a mail scanner or link preview, which fetches the URL but never
 * presses a button, mints nothing, spends nothing and records nothing (security review
 * 2026-10-01; founder chose this over one-click, 2026-10-02). This is the standard answer to
 * email link scanners: the link shows a page, a human press does the sign-in.
 *
 *   unused, valid ticket → it is spent (single use), a magic link is minted NOW for the RSVP's
 *                          owner, and the reply is /auth/verify?token_hash=… (P1257) which
 *                          signs them in and opens the page fixed by the ticket's purpose.
 *   used / expired / host / admin / anything else → /login?redirect=<that page> (or /events).
 *                          A spent button still lands the person where they were going, one
 *                          normal sign-in away.
 *
 * Deployed with --no-verify-jwt (scripts/deploy-functions.sh): the caller has no session yet.
 * The ticket is the only credential:
 *   - only sha256(ticket) is stored, and only service_role can read the table;
 *   - the destination comes from the ticket's purpose, never from the request;
 *   - single use: the first press stamps last_used_at atomically; every later press is refused;
 *   - it dies with the event (expires_at, re-checked against the event's CURRENT time), with the
 *     RSVP (ON DELETE CASCADE) and when the event is cancelled;
 *   - the event's host and admin accounts are never signed in this way.
 * Accepted (founder, 2026-10-02): the session it creates is a normal, whole-account session —
 * the point is to land them signed in, in the room. A forwarded email works once, for whoever
 * presses first.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { hashTicket, isLinkPurpose, purposePath, ticketExpiry } from '../_shared/event-links.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const TICKET_RE = /^[A-Za-z0-9_-]{40,64}$/;

type Row = {
  token_hash: string;
  purpose: string;
  expires_at: string;
  event_rsvps: {
    id: string;
    profile_id: string | null;
    events: { slug: string | null; status: string; datetime: string; duration_minutes: number | null; host_id: string | null } | null;
  } | null;
};

serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let ticket = '';
  try {
    const body = await req.json() as { t?: unknown };
    if (typeof body.t === 'string') ticket = body.t;
  } catch { /* not JSON */ }
  if (!TICKET_RE.test(ticket)) return json({ error: 'invalid ticket' }, 400);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ to: '/events' });

  const toLogin = (target: string | null) =>
    json({ to: target ? `/login?redirect=${encodeURIComponent(target)}` : '/events' });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const tokenHash = await hashTicket(ticket);
    const { data } = await supabase
      .from('event_email_links')
      .select(`
        token_hash, purpose, expires_at,
        event_rsvps!inner(id, profile_id, events!inner(slug, status, datetime, duration_minutes, host_id))
      `)
      .eq('token_hash', tokenHash)
      .maybeSingle();
    const row = data as unknown as Row | null;
    const rsvp = row?.event_rsvps;
    const event = rsvp?.events;
    if (!row || !isLinkPurpose(row.purpose) || !event?.slug) return toLogin(null);

    const target = purposePath(row.purpose, event.slug);
    if (event.status === 'cancelled') return json({ to: `/events/${encodeURIComponent(event.slug)}` });
    const expiresAt = Math.min(new Date(row.expires_at).getTime(), ticketExpiry(event).getTime());
    if (expiresAt <= Date.now() || !rsvp?.profile_id) return toLogin(target);
    if (rsvp.profile_id === event.host_id) return toLogin(target);
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', rsvp.profile_id).maybeSingle();
    if (prof?.is_admin) return toLogin(target);

    // Spend the ticket BEFORE minting: two presses racing cannot both get a session.
    const { data: spent } = await supabase
      .from('event_email_links')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('last_used_at', null)
      .select('token_hash')
      .maybeSingle();
    if (!spent) return toLogin(target);

    const { data: user, error: userErr } = await supabase.auth.admin.getUserById(rsvp.profile_id);
    const email = user?.user?.email;
    if (userErr || !email) return toLogin(target);

    const { data: gen, error: genErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = gen?.properties?.hashed_token;
    if (genErr || !hashed) {
      console.error('event-email-link: generateLink failed:', genErr?.message ?? 'no hashed_token');
      return toLogin(target);
    }

    const params = new URLSearchParams({ token_hash: hashed, type: 'magiclink', redirect: target });
    return json({ to: `/auth/verify?${params.toString()}` });
  } catch (err) {
    console.error('event-email-link error:', err);
    return toLogin(null);
  }
});
