/**
 * P1259 change 3 — the SUBJECT's own public links, validated at RENDER.
 *
 * THE INVARIANT (spec, Invariants section): "Any URL rendered as a link from the new
 * `links` field must pass a scheme allowlist (`https:` only) applied at render, not only
 * at write. An unvalidated JSONB list rendered as anchors on a public page accepts
 * `javascript:` and `data:` URLs. The field is operator-written today, which is not a
 * reason to skip it — the invariant is what keeps it true when it stops being."
 *
 * WHY THE SCHEMA CANNOT CARRY THIS. The sibling precedent, `events.links` (P1179), stores
 * a TAG and resolves it to `/stake/:tag`, so an open redirect is impossible by
 * construction. That is not available here: these are third-party URLs to Wikipedia, a
 * personal site, YouTube. So the column CHECK guarantees only "this is an array", and the
 * scheme gate lives here, on the last edge before an `href`.
 *
 * `https:` ONLY, not "https or http". A profile link is a public claim about a real
 * person who never consented to the account; sending a reader to a plaintext page under
 * that claim is the one avoidable part. Every link the four filed subjects actually have
 * (Wikipedia, personal sites, YouTube, X, Instagram) is https.
 *
 * Parsing is delegated to `new URL()` rather than a regex. A regex over a scheme prefix is
 * defeated by whitespace, control characters and case ("java\tscript:", "HTTPS:") that the
 * URL parser normalizes before the comparison; `url.protocol` is always lowercase and
 * already stripped of those.
 */

/** One entry of `profiles.links`. `label` is optional — the host is the fallback. */
export interface ProfileLink {
  url: string;
  label?: string;
}

/** The only scheme that may reach an `href`. */
const ALLOWED_PROTOCOL = 'https:';

/**
 * True when `value` is a string that parses as an absolute `https:` URL.
 *
 * Everything else is false, including: a relative path (no scheme to check), a
 * `javascript:`/`data:`/`blob:`/`vbscript:` URL, a `http:` URL, and any non-string.
 */
export function isSafeProfileLinkUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return new URL(value).protocol === ALLOWED_PROTOCOL;
  } catch {
    // Not an absolute URL at all.
    return false;
  }
}

/**
 * The host, without `www.`, as the visible label when the operator supplied none.
 * Never throws — callers only reach it for a URL that already passed the gate.
 */
export function profileLinkLabel(link: ProfileLink): string {
  const label = typeof link.label === 'string' ? link.label.trim() : '';
  if (label) return label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return link.url;
  }
}

/**
 * Normalizes the raw JSONB into a render-safe list.
 *
 * Drops, silently and by design: non-array input, non-object entries, entries whose `url`
 * fails the scheme gate, and duplicates. A dropped entry is an operator data error, not a
 * reader-facing one — the row is simply absent, which is what the spec's UX note asks for
 * ("Social links, none set: the row is absent, not an empty placeholder").
 */
export function normalizeProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProfileLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { url, label } = entry as { url?: unknown; label?: unknown };
    if (!isSafeProfileLinkUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(typeof label === 'string' && label.trim() ? { url, label: label.trim() } : { url });
  }
  return out;
}

/**
 * P1259 (founder follow-up, 2026-09-08) — recognise the PLATFORM behind a link so the row
 * can read "X" / "Instagram" / "Wikipedia" with a matching icon, instead of a bare host.
 *
 * Founder: *"just say something like Twitter and the link, or Instagram and link and so on.
 * Maybe with icons."*
 *
 * Host matching only, and only on an exact host or a `.`-anchored suffix — never a substring.
 * `includes('x.com')` would match `notx.com.evil.example`, which is precisely the shape a
 * malicious operator entry would take to borrow a trusted icon. The URL already passed the
 * https gate before it reaches here; this decides presentation, so a miss is cosmetic (the
 * host is shown) while a false positive is a trust claim.
 *
 * The kind is presentation only. It NEVER widens what may be rendered — an unrecognised
 * host is still a perfectly valid link, it just carries the generic icon.
 */
export type ProfileLinkKind =
  | 'wikipedia'
  | 'x'
  | 'youtube'
  | 'instagram'
  | 'linkedin'
  | 'facebook'
  | 'github'
  | 'website';

/** Host suffix → kind. Order is irrelevant; matching is exact-or-dot-anchored. */
const HOST_KINDS: ReadonlyArray<readonly [string, ProfileLinkKind]> = [
  ['wikipedia.org', 'wikipedia'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['instagram.com', 'instagram'],
  ['linkedin.com', 'linkedin'],
  ['facebook.com', 'facebook'],
  ['fb.com', 'facebook'],
  ['github.com', 'github'],
];

/** The default visible name per platform, used when the operator supplied no label. */
const KIND_LABELS: Record<ProfileLinkKind, string | null> = {
  wikipedia: 'Wikipedia',
  x: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  github: 'GitHub',
  // A personal site has no platform name to fall back on — the host is the honest label.
  website: null,
};

/**
 * Which platform a link points at. `website` for anything unrecognised, which is the
 * correct answer for a personal homepage as much as for a host we simply do not know.
 */
export function profileLinkKind(link: ProfileLink): ProfileLinkKind {
  let host: string;
  try {
    host = new URL(link.url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'website';
  }
  for (const [suffix, kind] of HOST_KINDS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return kind;
  }
  return 'website';
}

/**
 * The label to show: the operator's own label wins; otherwise the platform name; otherwise
 * the host. Keeps `profileLinkLabel`'s contract intact — that function is still the host
 * fallback, and this one only inserts the platform step between the two.
 */
export function profileLinkDisplayLabel(link: ProfileLink): string {
  const explicit = typeof link.label === 'string' ? link.label.trim() : '';
  if (explicit) return explicit;
  const platform = KIND_LABELS[profileLinkKind(link)];
  return platform ?? profileLinkLabel(link);
}
