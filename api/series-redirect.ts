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
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const series = req.query.series as string;
  const pattern = SERIES[series];

  if (!pattern) {
    res.redirect(307, '/events');
    return;
  }

  try {
    const graceCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const url = `${SUPABASE_URL}/rest/v1/events?title=ilike.${encodeURIComponent(pattern)}&status=eq.upcoming&datetime=gt.${encodeURIComponent(graceCutoff)}&order=datetime.asc&limit=1&select=slug`;
    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const rows = await resp.json();
    const slug = Array.isArray(rows) && rows.length > 0 ? rows[0].slug : null;
    res.redirect(307, slug ? `/events/${slug}` : '/events');
  } catch {
    res.redirect(307, '/events');
  }
}
