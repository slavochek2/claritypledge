import type { VercelRequest, VercelResponse } from '@vercel/node';

// Maps /events/<key> → Supabase title ILIKE pattern (nearest upcoming event wins).
// Query must filter by BOTH status=upcoming AND datetime > (now - EVENT_GRACE_HOURS=5h) —
// status alone misses same-day events whose status hasn't been flipped yet. See getPastEvents().
const SERIES: Record<string, string> = {
  'ai-run': 'AI Running Club%',
  // '%Hike%', not 'Clarity Hike%': the series was renamed to "Social Hike"
  // on 2026-08-24 and the old prefix silently stopped matching, so
  // /events/hike fell through to the generic /events list with no error.
  // Match the word wherever it appears so a rename cannot orphan the link.
  'hike': '%Hike%',
  // AI-safety Clarity Nights. Matches the topic, not the series prefix, because
  // not every Clarity Night is about AI safety.
  'aisafety': '%AI Safety%',
  // Every Clarity Night, whatever its topic: /night resolves to the nearest
  // upcoming one. Matches the series prefix because the title convention is
  // "Clarity Night #N: <topic>" — see docs/events/clarity-practice-event.md.
  'night': 'Clarity Night%',
  // Philip Keay's self-inquiry workshops (guest host, Communication Activism CM).
  'spiritual-revolution': 'A Spiritual Revolution%',
};

// Keys matched on stored fields rather than a title. /next (P1414): the nearest upcoming Clarity
// Night whose topic is not chosen yet — the placeholder that carries the topic vote. Same rule as
// showsTopicVote(): the series key, and no statement_tag. With no placeholder it falls back to
// /night's match, so the link always lands on the next night.
const FIELD_SERIES: Record<string, { filter: string; fallback: string }> = {
  next: { filter: 'series_slug=eq.clarity-night&statement_tag=is.null', fallback: 'night' },
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const series = req.query.series as string;
  const field = FIELD_SERIES[series];
  const pattern = SERIES[series];

  if (!field && !pattern) {
    res.redirect(307, '/events');
    return;
  }

  try {
    let slug = field ? await nearest(field.filter) : null;
    const titlePattern = field ? SERIES[field.fallback] : pattern;
    if (!slug && titlePattern) slug = await nearest(`title=ilike.${encodeURIComponent(titlePattern)}`);
    res.redirect(307, slug ? `/events/${slug}` : '/events');
  } catch {
    res.redirect(307, '/events');
  }
}

/** The nearest upcoming event matching a PostgREST filter, or null. */
async function nearest(filter: string): Promise<string | null> {
  const graceCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/events?${filter}&status=eq.upcoming&datetime=gt.${encodeURIComponent(graceCutoff)}&order=datetime.asc&limit=1&select=slug`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0].slug : null;
}
