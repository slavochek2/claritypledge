import type { VercelRequest, VercelResponse } from '@vercel/node';

// /<alias> and /events/<alias> → the nearest upcoming event of that series (P1649).
//
// The rule behind each alias (title pattern, stored series key, /next's "no topic yet" + fallback to /night)
// lives in the database table public.series_aliases, which the public key cannot read or write. This
// function passes ONLY the alias key to public.resolve_series_alias, which returns one slug or null.
// That is what lets an alias reach a hidden event (P1603) without giving the public key a search:
// a caller cannot supply a pattern, a series value or a cutoff. Precedence (public before hidden, across
// /next's whole chain), the 5-hour grace cutoff and status=upcoming are all applied inside the function.
// Adding an alias = a row in series_aliases (prod data change) + a vercel.json pair.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Same shape the table's CHECK enforces; anything else cannot be an alias, so skip the round trip.
const ALIAS_KEY = /^[a-z0-9-]{1,40}$/;

// P1669: a shared short link carries the channel it was posted in (utm_*). Forward those five keys,
// and only those, to the event page, cleaned the same way index.html cleans them, so the visit is
// attributed. Everything else (the ?d= cache-buster, anything a visitor appends) is dropped.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export function utmSuffix(query: VercelRequest['query']): string {
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const raw = query[key];
    const value = ((Array.isArray(raw) ? raw[0] : raw) ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const series = req.query.series;
  const utm = utmSuffix(req.query);
  if (typeof series !== 'string' || !ALIAS_KEY.test(series)) {
    res.redirect(307, `/events${utm}`);
    return;
  }

  try {
    const slug = await resolve(series);
    res.redirect(307, slug ? `/events/${encodeURIComponent(slug)}${utm}` : `/events${utm}`);
  } catch (err) {
    // A failed call is NOT "no match": report it so a missing migration or a broken grant is visible,
    // then still send the visitor somewhere useful.
    console.error('[series-redirect] resolve_series_alias failed', { series, error: String(err) });
    res.redirect(307, `/events${utm}`);
  }
}

/** The slug the alias points at, or null when nothing is upcoming. Throws on any failed call. */
async function resolve(key: string): Promise<string | null> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_series_alias`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_key: key }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body: unknown = await resp.json();
  if (body === null || body === '') return null;
  if (typeof body === 'string') return body;
  throw new Error(`unexpected response shape: ${JSON.stringify(body).slice(0, 100)}`);
}
