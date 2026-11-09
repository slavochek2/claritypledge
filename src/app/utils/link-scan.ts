/**
 * The one address scanner behind linkify.ts and the chat (P540: one link system). It cuts a run of plain text into
 * text and link segments; linkify.ts draws them as anchors, the chat draws them with its own components.
 *
 * Two modes. The default mode is what story, point and profile text always had. CHAT mode (P1652) is stricter and
 * adds `www.` addresses: chat text is untrusted (anyone holding a person's code can open a 1:1), so a link's visible
 * text is always its real destination. In chat the markdown form `[label](address)` stays exactly as typed, with no
 * link anywhere in it. `spoken` (transcriptions and voice transcripts) links a bare domain only on the app's own
 * domain, because speech-to-text produces strings such as `let.me`.
 *
 * Only http and https are ever emitted. Full addresses (every mode) are refused when the host is not plain Latin
 * (a Cyrillic look-alike) or when the address carries credentials (a trusted name, an at sign, then the real host): the browser would go
 * to the host after the at sign while the reader sees the name before it.
 */

export interface ScanOptions {
  chat?: boolean;
  spoken?: boolean;
}

export type Segment = { type: 'text'; value: string } | { type: 'link'; text: string; href: string; start: number };

/** Latin plus the marks that legitimately decorate it. Anything else is another script. */
const LATIN_SAFE_HOST = /^[a-z0-9.-]+$/;

/**
 * A destination host that mixes scripts, or is written in a non-Latin script at all, cannot be judged by matching:
 * a Cyrillic `а` in `аpple.com` is byte-identical in label and href and passes any match rule.
 */
export function hasConfusableHost(href: string): boolean {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return true;
  }
  // `URL` punycodes non-Latin hosts on parse; both forms are rejected.
  if (host.startsWith('xn--') || host.includes('.xn--')) return true;
  return !LATIN_SAFE_HOST.test(host);
}

const TLDS = 'com|org|net|io|co|me|dev|app|ai|uk|de|fr|au|ca|edu|gov|info|biz|tv|fm|ly|gl|gg|pm|club';
// No lookbehind (Safari < 16.4 throws SyntaxError at construction, P983): the adjacency checks run in the loop.
const DEFAULT_SRC = `https?:\\/\\/[^\\s]+|[\\w-]+\\.(?:${TLDS})(?:\\/[^\\s]*)?`;
const CHAT_SRC = `https?:\\/\\/[^\\s]+|www\\.[^\\s]+|(?:[\\w-]+\\.)+(?:${TLDS})(?![\\w-])(?:\\/[^\\s]*)?`;
// P1141 (d): `>` joins the trailing set (an autolink `<https://example.com>` otherwise keeps the bracket in its href).
// Closing brackets strip only when unbalanced inside the address (`Foo_(bar)` keeps its `)`, `(see https://a.com)` drops it);
// a closing quote strips once (`"https://a.com"` links the address without its wrapper).
const TRAILING_PLAIN = '.,;:!?>';
const TRAILING_QUOTES = '"\'”’»';
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const count = (text: string, ch: string): number => text.split(ch).length - 1;

function stripTrailing(match: string): string {
  let url = match;
  let quoteStripped = false;
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (TRAILING_PLAIN.includes(last)) {
      url = url.slice(0, -1);
    } else if (TRAILING_QUOTES.includes(last) && !quoteStripped) {
      quoteStripped = true;
      url = url.slice(0, -1);
    } else if (CLOSERS[last] && count(url, last) > count(url, CLOSERS[last])) {
      url = url.slice(0, -1);
    } else {
      break;
    }
  }
  return url;
}
/** Control and format characters (bidi overrides, zero-width, soft hyphen): invisible or reordering, never part of an honest link. */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const BIDI_CONTROL = /[‪-‮⁦-⁩]/;
const PLAIN_ASCII = /^[\x21-\x7e]*$/;
const NUMERIC_HOST = /^(?:0x[0-9a-f]*|\d+)(?:\.(?:0x[0-9a-f]*|\d+))*$/i;
const DOTTED_QUAD = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const OWN_DOMAINS = ['claritypledge.com', 'www.claritypledge.com'];
const WWW_HOST = /^www\.[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

type Kind = 'full' | 'www' | 'bare';

const kindOf = (url: string): Kind => (/^https?:\/\//i.test(url) ? 'full' : /^www\./i.test(url) ? 'www' : 'bare');

function parse(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** The host text exactly as typed (no port, no credentials), or null when the address has none. */
function rawHostOf(href: string): { authority: string; host: string } | null {
  const m = /^https?:\/\/([^/?#\\]*)/i.exec(href);
  if (!m) return null;
  const authority = m[1] ?? '';
  return { authority, host: authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '') };
}

/** The typed host must be what the browser will use: plain ASCII (no compatibility forms), and a numeric host only as a plain dotted quad shown as such. */
function hostIsHonest(href: string, shown: string, parsedHost: string): boolean {
  const raw = rawHostOf(href);
  if (!raw || !PLAIN_ASCII.test(raw.authority)) return false;
  if (!NUMERIC_HOST.test(raw.host)) return true;
  if (!DOTTED_QUAD.test(raw.host) || parsedHost !== raw.host) return false;
  return shown.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase() === raw.host;
}

/** The href a matched address may link to, or null when it must stay plain text. */
function resolveHref(url: string, kind: Kind, opts: ScanOptions): string | null {
  if (CONTROL_OR_FORMAT.test(url)) return null;
  const href = kind === 'full' ? url : `https://${url}`;
  if (kind === 'bare' && !opts.chat) return href;
  const parsed = parse(href);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return null;
  if (parsed.username || parsed.password || hasConfusableHost(href)) return null;
  if (!hostIsHonest(href, url, parsed.hostname.toLowerCase())) return null;
  const host = parsed.hostname.toLowerCase();
  if (kind === 'www' && !WWW_HOST.test(host)) return null;
  if (kind === 'bare' && opts.spoken && !OWN_DOMAINS.includes(host)) return null;
  return href;
}

const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);

/** Whether the text around a match lets it be an address at all (not embedded in another word, scheme or email). */
function standsAlone(text: string, start: number, end: number, kind: Kind, opts: ScanOptions): boolean {
  const prev = start > 0 ? text[start - 1] : undefined;
  if (prev === ':' || (prev && BIDI_CONTROL.test(prev))) return false;
  if (kind !== 'bare') return true;
  if (prev && /\w/.test(prev)) return false;
  // A non-ASCII letter before the match means the match is only the tail of a word (`аpple.com`, `bücher.de`).
  if (isLetter(prev)) return false;
  if (!opts.chat) return true;
  return prev !== '@' && !isLetter(prev) && !isLetter(text[end]);
}

export function scanUrls(text: string, opts: ScanOptions = {}): Segment[] {
  const out: Segment[] = [];
  const pattern = new RegExp(opts.chat ? CHAT_SRC : DEFAULT_SRC, 'gi');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const url = stripTrailing(match[0]);
    const end = start + url.length;
    const kind = kindOf(url);
    const href = standsAlone(text, start, end, kind, opts) ? resolveHref(url, kind, opts) : null;
    if (href === null) {
      // Refused: the words stay as typed. `end` can equal `last` when glued onto the previous match's tail.
      if (end > last) out.push({ type: 'text', value: text.slice(last, end) });
      last = Math.max(last, end);
      continue;
    }
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) });
    out.push({ type: 'link', text: url, href, start });
    last = end;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

const MD_TOKEN = /\[[^\]]+\]\([^)]*\)/g;

/** Chat text: markdown link syntax stays as typed (no link anywhere in it), everything else is scanned in chat mode. */
export function scanChat(text: string, opts: Omit<ScanOptions, 'chat'> = {}): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const scan = (from: number, to: number) => {
    for (const s of scanUrls(text.slice(from, to), { ...opts, chat: true })) {
      out.push(s.type === 'link' ? { ...s, start: s.start + from } : s);
    }
  };
  for (const m of text.matchAll(MD_TOKEN)) {
    scan(last, m.index);
    out.push({ type: 'text', value: m[0] });
    last = m.index + m[0].length;
  }
  scan(last, text.length);
  return out;
}
