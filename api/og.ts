import { getThumbnailUrl } from '../src/lib/video';
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

/** A non-OK HTTP response from the Supabase REST call. P1108: this used to be
 *  collapsed into the same `null` as "row not found", which meant a permission
 *  error or a timeout silently rendered as an absent row. Thrown so the caller
 *  can tell the two apart. */
class OgFetchError extends Error {
  constructor(public readonly status: number) {
    super(`og.ts: Supabase REST request failed with status ${status}`);
  }
}

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
  if (!res.ok) throw new OgFetchError(res.status);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** Throws if `column` is not present, boundary-anchored, in `selectedColumns`
 *  — a bare `,`/`(`/`)`/string-edge on both sides, so it matches a nested embed
 *  selector (`profiles!fkey(name,agent_accounts(operator_name))`) without also
 *  matching a column name that merely appears as a SUBSTRING of an unrelated
 *  one (e.g. `role` inside a future `moderator_role`). `/finish` code review
 *  (2026-08-20, MEDIUM) found the original plain-substring check (from the
 *  same-day adversarial-review fix) had exactly that false-positive shape,
 *  untested. `selectedColumns` must BE the source the select string is built
 *  from (`selectedColumns.join(',')`), so this check is causally upstream of
 *  the fetch: editing the query without editing the array is impossible.
 *  Runs at MODULE LOAD, not per-request: a handler that claims a column it
 *  forgot to select fails on the very first import, not in a code review. */
export function bindClaim(selectedColumns: readonly string[], column: string, claim: string): void {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundary = new RegExp(`(^|[,(])${escaped}([,)]|$)`);
  if (!selectedColumns.some((c) => boundary.test(c))) {
    throw new Error(
      `og.ts claim binding violated: "${claim}" requires column "${column}" to be ` +
        `selected, but only [${selectedColumns.join(', ')}] is fetched.`,
    );
  }
}

/** Adversarial review (2026-08-20, CRITICAL): `bindClaim` proves a claim's
 *  COLUMN is fetched, but a free-text column (`name`, `role`) that lands in
 *  the SAME sentence as a verified claim can just contain the claim's own
 *  words — no gate reads that. Any user can set `role: "Engineer. Signed the
 *  Clarity Pledge"` and render exactly the sentence the `has_pledged` check
 *  exists to prevent. Strips the pledge phrase from free text before it is
 *  ever interpolated, so the phrase can only originate from the verified
 *  boolean, never from a user-authored field — applied unconditionally
 *  (not just when `has_pledged` is false) so its presence stays a reliable
 *  signal regardless of the subject's real pledge status.
 *
 *  `/finish` code review (2026-08-20, HIGH) found the first version of this
 *  function used `\s+` between words, which does not match zero-width or
 *  other invisible Unicode format characters (U+200B, bidi overrides, etc.) —
 *  a role like `"Engineer. Signed" + U+200B + "the" + U+200B + "Clarity" + U+200B + "Pledge"`
 *  reads identically to a human/crawler while defeating the `\s+` match entirely,
 *  re-opening the CRITICAL bug through the function built to close it.
 *  Stripping every Unicode format character (`\p{Cf}`) first closes that, and
 *  incidentally also closes a separate LOW finding from the same review round
 *  (bidi override characters surviving into the rendered card). */
export function stripForgeableClaims(s: string): string {
  return s
    .replace(/\p{Cf}/gu, '')
    .replace(/signed\s+the\s+clarity\s+pledge/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  // No bindClaim here: every word below is either a fetched column verbatim
  // (`description`) or a formatted `datetime`/`location` — no synthesized
  // assertion is made, so there is nothing to bind.

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
    : [date, location].filter(Boolean).join(' — ');

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

/** "No agent account exists" and "the agent lookup failed" must be distinguishable —
 *  a `null` collapse of both is the P1108 fail-open bug, one level below the row fetch. */
type AgentLookup =
  | { kind: 'no-agent' }
  | { kind: 'agent'; operator: string }
  | { kind: 'malformed' };

function agentOperator(profile: Record<string, unknown> | null): AgentLookup {
  if (!profile) return { kind: 'no-agent' };
  // Adversarial review (2026-08-20): PostgREST can pick an array shape for a
  // to-one embed (the same ambiguity handled below for `agent_accounts`
  // itself). `row.profiles` reaches here through an unchecked cast — an
  // array here means the embed didn't resolve the way this code assumes,
  // not that no agent exists. Misclassifying it as 'no-agent' silently
  // dropped the P1104 disclosure for the array shape; 'malformed' throws
  // instead (caught by handler()'s try/catch — Decision 2).
  if (Array.isArray(profile)) return { kind: 'malformed' };
  if (!('agent_accounts' in profile)) return { kind: 'no-agent' };
  const embed = profile.agent_accounts;
  if (embed === null) return { kind: 'no-agent' };
  const row = Array.isArray(embed) ? (embed.length > 0 ? embed[0] : null) : embed;
  if (row === null) return { kind: 'no-agent' };
  if (typeof row !== 'object') return { kind: 'malformed' };
  const name = (row as Record<string, unknown>).operator_name;
  if (typeof name !== 'string' || name.length === 0) return { kind: 'malformed' };
  return { kind: 'agent', operator: name };
}

/** Reads an AgentLookup for a synthesized "operated by" claim. Throws on
 *  `'malformed'` — a shape a correctly-functioning PostgREST response would
 *  never produce — so `handler()`'s try/catch (Decision 2) turns it into the
 *  subject-silent fallback instead of silently rendering the ordinary-person card. */
function requireAgentOperator(profile: Record<string, unknown> | null): string | null {
  const lookup = agentOperator(profile);
  if (lookup.kind === 'malformed') {
    throw new Error('og.ts: malformed agent_accounts embed — refusing to render either card');
  }
  return lookup.kind === 'agent' ? lookup.operator : null;
}

// The array IS the select query (joined below) — not a separate declaration that
// can drift from it. Adversarial review found the prior version declared this
// array and hand-wrote an identical-looking select string beside it; deleting the
// embed from the string left the array (and bindClaim) untouched and green.
const STORY_COLUMNS = ['title', 'content', 'banner_url', 'video_url', `profiles!stories_author_id_fkey(name,${AGENT_EMBED})`] as const;
bindClaim(STORY_COLUMNS, AGENT_EMBED, 'is a machine-generated reading, operated by {operator}');

async function ogForStory(id: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'stories',
    `id=eq.${encodeURIComponent(id)}&select=${STORY_COLUMNS.join(',')}`,
  );
  if (!row) return null;

  const profile = row.profiles as Record<string, unknown> | null;
  const authorName = (profile?.name as string) || 'Someone';
  const operator = requireAgentOperator(profile);
  const title = (row.title as string) || 'A Story';
  const content = (row.content as string) || '';
  const excerpt = content.replace(/[#*_~`>[\]]/g, '').slice(0, 160).replace(/\n/g, ' ').trim();

  return {
    title: operator
      ? `${title} — read by ${authorName} | ClarityPledge`
      : `${title} — by ${authorName} | ClarityPledge`,
    description: operator
      ? `A machine-generated reading, not the person. ${authorName} is operated by ${operator} on ClarityPledge.`
      : (excerpt || `A story shared on ClarityPledge by ${authorName}.`),
    // P1141: a story with a video shows the video's own thumbnail, derived from
    // the single stored field by the same pure parser the app uses — so no
    // crawler card can ever show a still that has drifted from its video. No
    // play overlay is baked into the image: a static meta-tag card cannot carry
    // one (Slack/Twitter/Discord unfurls never do), which is an industry limit
    // rather than a deviation from the UI Contract.
    image: getThumbnailUrl(row.video_url as string | null) || (row.banner_url as string) || DEFAULT_IMAGE,
    url: `${BASE_URL}/story/${id}`,
    type: 'article',
  };
}

// Same causal fix as STORY_COLUMNS above — the array builds the query.
const POINT_COLUMNS = ['statement', 'banner_url', `profiles!points_first_validator_id_fkey(name,${AGENT_EMBED})`] as const;
bindClaim(POINT_COLUMNS, AGENT_EMBED, 'a machine-generated reading operated by {operator}');

async function ogForPoint(id: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'points',
    `id=eq.${encodeURIComponent(id)}&select=${POINT_COLUMNS.join(',')}`,
  );
  if (!row) return null;

  const profile = row.profiles as Record<string, unknown> | null;
  const creatorName = (profile?.name as string) || 'Someone';
  const operator = requireAgentOperator(profile);
  const statement = (row.statement as string) || 'A point';
  const short = statement.length > 70 ? statement.slice(0, 67) + '...' : statement;

  return {
    title: `${short} | ClarityPledge`,
    description: operator
      ? `Shared by ${creatorName}, a machine-generated reading operated by ${operator} — not the person. Take a position on ClarityPledge.`
      : `Shared by ${creatorName} — take a position on ClarityPledge.`,
    image: (row.banner_url as string) || DEFAULT_IMAGE,
    url: `${BASE_URL}/point/${id}`,
    type: 'article',
  };
}

const PROFILE_COLUMNS = ['name', 'role', 'avatar_url', 'banner_url', 'has_pledged', AGENT_EMBED] as const;
bindClaim(PROFILE_COLUMNS, 'has_pledged', 'signed the Clarity Pledge');
bindClaim(PROFILE_COLUMNS, AGENT_EMBED, 'is a machine-generated reading, operated by {operator}');

async function ogForProfile(slug: string): Promise<OgData | null> {
  const row = await supabaseGet(
    'profiles',
    `slug=eq.${encodeURIComponent(slug)}&select=${PROFILE_COLUMNS.join(',')}`,
  );
  if (!row) return null;

  // Strip before defaulting: a name that IS entirely the forged phrase must not
  // collapse to an empty string — it should read as if no name was supplied.
  const name = stripForgeableClaims((row.name as string) || '') || 'A Professional';
  const role = stripForgeableClaims((row.role as string) || '');
  const operator = requireAgentOperator(row);
  // An agent account has signed nothing. The pre-P1108 copy asserted the pledge for
  // every profile regardless of `has_pledged` — false for every non-pledger in the
  // one place that reaches a reader who never opens the site.
  const desc = operator
    ? `${name} is a machine-generated reading of a person, operated by ${operator} on ClarityPledge. It is not that person and holds no pledge.`
    : (row.has_pledged === true
      ? (role
        ? `${name} — ${role}. Signed the Clarity Pledge.`
        : `${name} signed the Clarity Pledge — a public commitment to clear communication.`)
      : (role
        ? `${name} — ${role}.`
        : `${name} on ClarityPledge.`));

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

/** ESC-1: escapes all five of `&`, `"`, `<`, `>`, `'`. `&` runs first so the entities
 *  this function itself introduces are never re-escaped. */
export const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');

function ogHtml(og: OgData): string {
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
      let og: OgData | null;
      try {
        og = await route.handler(match);
      } catch (err) {
        // A failed or malformed fetch must never fall through to the generic
        // route-miss card below (BASE_URL, sitewide) OR — the P1108 bug — silently
        // render as an ordinary-person card. Fail loud, respond safe: log the real
        // error server-side, and respond with a card that asserts nothing about
        // the subject. Cache-Control is a SHORT positive TTL (not `no-store`): the
        // degraded card self-clears within a minute, and origin load stays bounded
        // at roughly one request per URL per minute at the edge — an uncached
        // failure path would let a spoofed-UA caller drive unbounded DB hits during
        // exactly the window the database is already unhealthy.
        console.error('og.ts: route handler failed', err);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=0');
        res.status(200).send(ogHtml({
          title: 'ClarityPledge',
          description: 'Preview temporarily unavailable.',
          image: DEFAULT_IMAGE,
          url: `${BASE_URL}${ogPath}`,
          type: 'website',
        }));
        return;
      }
      if (og) {
        // Adversarial review (2026-08-20, HIGH): the prior 3600/86400 pairing
        // let a card that asserts a claim about a real person (the pledge, or
        // the agent disclosure) stay stale for up to ~25h after a state change
        // this OWN edge cache controls — e.g. `set_my_pledge(false)` right
        // after a "Signed the Clarity Pledge" card was cached. This does not
        // touch the separate, already-accepted risk of third-party platforms
        // (Facebook/LinkedIn/Slack) caching a scrape from before this deploy —
        // no header here can reach that. Shrunk to bound the window this
        // header DOES control to roughly an hour worst-case.
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
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
