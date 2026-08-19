import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel Serverless Function — serves dynamic OG meta tags to bot crawlers.
// Routed via vercel.json rewrites that match bot user-agents on shareable paths.
// Non-bot requests never reach this function — they get the Vite SPA directly.

// VITE_ vars are set in Vercel env — available to both Vite build and serverless runtime.
// Fallback to non-prefixed names in case they're configured separately.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const BASE_URL = 'https://claritypledge.com';
const DEFAULT_IMAGE = `${BASE_URL}/clarity-pledge-icon.png`;

// ── Supabase REST ───────────────────────────────────────────────────────

async function supabaseGet(
  table: string,
  query: string,
): Promise<Record<string, unknown> | null> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// ── OG data types ───────────────────────────────────────────────────────

interface OgData {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
}

// ── Route-specific fetchers ─────────────────────────────────────────────

async function ogForEvent(slug: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'events',
    `slug=eq.${encodeURIComponent(slug)}&select=title,description,datetime,location,banner_url`,
  );
  if (!row) return null;

  const date = row.datetime
    ? new Date(row.datetime as string).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const location = (row.location as string) || '';
  const rawDesc = (row.description as string) || '';
  const desc = rawDesc
    ? rawDesc.replace(/[#*_~`>[\]]/g, '').slice(0, 200)
    : [date, location].filter(Boolean).join(' \u2014 ');

  return {
    title: `${(row.title as string) || 'Event'} | ClarityPledge`,
    description: desc,
    image: (row.banner_url as string) || DEFAULT_IMAGE,
    url: `${BASE_URL}/events/${slug}`,
    type: 'article',
  };
}

// P1104: an agent account carries no avatar, no shape and no colour off-platform — the
// crawler surface is text only. `agent_accounts(operator_name)` is embedded through the
// SAME FK-embed mechanism this function already uses for profiles, and the returned row
// being non-null is what says "this is a machine's reading", not any name-string test.
const AGENT_EMBED = 'agent_accounts(operator_name)';

/** The operator answerable for this profile, or null when it is an ordinary person. */
function agentOperator(profile: Record<string, unknown> | null): string | null {
  if (!profile) return null;
  // PostgREST returns a one-to-one embed as an object, a one-to-many as an array.
  // Handle both rather than depending on which shape it picks for this FK.
  const embed = profile.agent_accounts;
  const row = Array.isArray(embed) ? embed[0] : embed;
  if (!row || typeof row !== 'object') return null;
  const name = (row as Record<string, unknown>).operator_name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

async function ogForStory(id: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'stories',
    `id=eq.${encodeURIComponent(id)}&select=title,content,banner_url,profiles!stories_author_id_fkey(name,${AGENT_EMBED})`,
  );
  if (!row) return null;

  const profile = row.profiles as Record<string, unknown> | null;
  const authorName = (profile?.name as string) || 'Someone';
  const operator = agentOperator(profile);
  const title = (row.title as string) || 'A Story';
  const content = (row.content as string) || '';
  const excerpt = content.replace(/[#*_~`>[\]]/g, '').slice(0, 160).replace(/\n/g, ' ').trim();

  return {
    title: operator
      ? `${title} \u2014 read by ${authorName} | ClarityPledge`
      : `${title} \u2014 by ${authorName} | ClarityPledge`,
    description: operator
      ? `A machine-generated reading, not the person. ${authorName} is published by ${operator} on ClarityPledge.`
      : (excerpt || `A story shared on ClarityPledge by ${authorName}.`),
    image: (row.banner_url as string) || DEFAULT_IMAGE,
    url: `${BASE_URL}/story/${id}`,
    type: 'article',
  };
}

async function ogForPoint(id: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'points',
    `id=eq.${encodeURIComponent(id)}&select=statement,banner_url,profiles!points_first_validator_id_fkey(name,${AGENT_EMBED})`,
  );
  if (!row) return null;

  const profile = row.profiles as Record<string, unknown> | null;
  const creatorName = (profile?.name as string) || 'Someone';
  const operator = agentOperator(profile);
  const statement = (row.statement as string) || 'A point';
  const short = statement.length > 70 ? statement.slice(0, 67) + '...' : statement;

  return {
    title: `${short} | ClarityPledge`,
    description: operator
      ? `Shared by ${creatorName}, a machine-generated reading published by ${operator} \u2014 not the person. Take a position on ClarityPledge.`
      : `Shared by ${creatorName} \u2014 take a position on ClarityPledge.`,
    image: (row.banner_url as string) || DEFAULT_IMAGE,
    url: `${BASE_URL}/point/${id}`,
    type: 'article',
  };
}

async function ogForProfile(slug: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'profiles',
    `slug=eq.${encodeURIComponent(slug)}&select=name,role,avatar_url,banner_url,${AGENT_EMBED}`,
  );
  if (!row) return null;

  const name = (row.name as string) || 'A Professional';
  const role = (row.role as string) || '';
  const operator = agentOperator(row);
  // An agent account has signed nothing. The pre-P1104 copy asserted the pledge for
  // every profile, which is false for these accounts in the one place that reaches a
  // reader who never opens the site.
  const desc = operator
    ? `${name} is a machine-generated reading of a person, published by ${operator} on ClarityPledge. It is not that person and holds no pledge.`
    : (role
      ? `${name} \u2014 ${role}. Signed the Clarity Pledge.`
      : `${name} signed the Clarity Pledge \u2014 a public commitment to clear communication.`);

  return {
    title: `${name} | ClarityPledge`,
    description: desc,
    // P1104: an agent's card must not lead with an image derived from the real person.
    // On a share card the picture is the dominant element and og:description is routinely
    // truncated or dropped by the platform, so the portrait would carry the whole
    // impression while the only disclosure got cut.
    image: operator
      ? DEFAULT_IMAGE
      : ((row.banner_url as string) || (row.avatar_url as string) || DEFAULT_IMAGE),
    url: `${BASE_URL}/p/${slug}`,
    type: 'profile',
  };
}

// ── HTML builder ────────────────────────────────────────────────────────

function ogHtml(og: OgData): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(og.title)}</title>
  <meta property="og:type" content="${esc(og.type)}" />
  <meta property="og:url" content="${esc(og.url)}" />
  <meta property="og:title" content="${esc(og.title)}" />
  <meta property="og:description" content="${esc(og.description)}" />
  <meta property="og:image" content="${esc(og.image)}" />
  <meta property="og:site_name" content="ClarityPledge" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(og.title)}" />
  <meta name="twitter:description" content="${esc(og.description)}" />
  <meta name="twitter:image" content="${esc(og.image)}" />
  <meta name="description" content="${esc(og.description)}" />
</head>
<body></body>
</html>`;
}

// ── Route matching ──────────────────────────────────────────────────────

const ROUTES: Array<{
  pattern: RegExp;
  handler: (match: RegExpMatchArray) => Promise<OgData | null>;
}> = [
  { pattern: /^\/events\/([^/]+)$/, handler: (m) => ogForEvent(m[1]) },
  { pattern: /^\/story\/([^/]+)$/, handler: (m) => ogForStory(m[1]) },
  { pattern: /^\/point\/([^/]+)$/, handler: (m) => ogForPoint(m[1]) },
  { pattern: /^\/p\/([^/]+)$/, handler: (m) => ogForProfile(m[1]) },
];

// ── Handler ─────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Missing env vars — return fallback without Supabase lookup
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('og.ts: Missing SUPABASE_URL or SUPABASE_ANON_KEY — returning generic OG tags');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(ogHtml({
      title: 'ClarityPledge',
      description: 'Calibrated communication practice for professionals.',
      image: DEFAULT_IMAGE,
      url: BASE_URL,
      type: 'website',
    }));
    return;
  }

  // The path is passed as a query param by vercel.json rewrite
  // Vercel yields an ARRAY when a query param repeats (?path=a&path=b), and arrays have
  // no .startsWith — the endpoint 500s. /api/og is directly addressable, so this is
  // reachable without going through the bot-UA rewrite.
  const pathParam = req.query.path;
  const rawPath = (Array.isArray(pathParam) ? pathParam[0] : pathParam) || '/';
  const ogPath = rawPath.startsWith('/') && !rawPath.includes('//') ? rawPath : '/';

  for (const route of ROUTES) {
    const match = ogPath.match(route.pattern);
    if (match) {
      const og = await route.handler(match);
      if (og) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        res.status(200).send(ogHtml(og));
        return;
      }
    }
  }

  // Fallback — generic OG
  const fallback: OgData = {
    title: 'ClarityPledge',
    description: 'Calibrated communication practice for professionals.',
    image: DEFAULT_IMAGE,
    url: BASE_URL,
    type: 'website',
  };
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(ogHtml(fallback));
}
