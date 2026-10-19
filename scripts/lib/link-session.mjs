/**
 * link-session.mjs — P1510: obtain a real user session WITHOUT a password.
 *
 * Prod refuses password sign-in (P1510), so prod-run tooling signs in the way a
 * person does: an emailed link. The service role mints the link (admin
 * generate_link sends no email), and the link's token is exchanged at the
 * public verify endpoint with the ANON key. The result is an ordinary user
 * session, so every later request still runs under that user's RLS — the
 * service role never touches the data path.
 *
 * Consumers: scripts/prod-smoke-test.mjs, e2e/verify-prod-*.spec.ts,
 * scripts/probe-gcs-upload*.mjs, scripts/bootstrap-align-agent.mjs.
 */

/**
 * @param {object} o
 * @param {string} o.url         project URL, e.g. https://<ref>.supabase.co
 * @param {string} o.anonKey     public anon key (used for the verify exchange)
 * @param {string} o.serviceKey  service-role key (used ONLY to mint the link)
 * @param {string} o.email       an EXISTING account; never creates one
 * @returns {Promise<{access_token: string, refresh_token: string, expires_in: number, expires_at: number, user: object}>}
 */
export async function linkSession({ url, anonKey, serviceKey, email }) {
  if (!url || !anonKey || !serviceKey || !email) {
    throw new Error('linkSession: url, anonKey, serviceKey and email are all required');
  }
  const base = url.replace(/\/+$/, '');

  // generate_link on an unknown address would CREATE the account (as a signup).
  // Tooling must sign in as an account that already exists, so look first.
  const lookup = await fetch(
    `${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=50`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!lookup.ok) throw new Error(`linkSession: user lookup failed (HTTP ${lookup.status})`);
  const { users = [] } = await lookup.json();
  if (!users.some((u) => (u.email || '').toLowerCase() === email.toLowerCase())) {
    throw new Error('linkSession: no account exists for that address — refusing to create one');
  }

  // Minting a link invalidates any earlier unexchanged link for the same account,
  // so two callers signing in as one account at once (parallel Playwright workers,
  // the daily smoke during a verify run) can fail each other with "invalid or has
  // expired". That one error is retried with a fresh link; anything else throws.
  for (let attempt = 1; ; attempt++) {
    try {
      return await mintAndExchange(base, anonKey, serviceKey, email);
    } catch (e) {
      if (attempt >= 4 || !/invalid or has expired/i.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 250 * attempt + Math.floor(Math.random() * 250)));
    }
  }
}

async function mintAndExchange(base, anonKey, serviceKey, email) {
  const gen = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const link = await gen.json().catch(() => ({}));
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  const type = link.verification_type ?? link.properties?.verification_type ?? 'magiclink';
  if (!gen.ok || !tokenHash) {
    throw new Error(`linkSession: generate_link failed (HTTP ${gen.status}: ${link.msg ?? link.error_description ?? 'no token'})`);
  }

  const ver = await fetch(`${base}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, token_hash: tokenHash }),
  });
  const session = await ver.json().catch(() => ({}));
  if (!ver.ok || !session.access_token) {
    throw new Error(`linkSession: link exchange failed (HTTP ${ver.status}: ${session.msg ?? session.error_description ?? 'no session'})`);
  }
  return session;
}
