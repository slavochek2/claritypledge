import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * Parses plain text and returns ReactNode[] with URLs converted to <a> elements.
 * Supports both markdown [text](url) syntax AND auto-URL detection.
 * Processing order: markdown links first, then auto-URL on remaining text.
 * Uses allowlist approach: only https://, http://, and bare domain.tld patterns.
 * Dangerous schemes (javascript:, vbscript:, data:, blob:) are never emitted.
 * Bare domain hrefs are prefixed with https:// to avoid relative URL resolution.
 */
/**
 * P1141 — a link whose visible label CLAIMS a destination may render as a link
 * only when that claim is true. The 2026-08-20 finding is exactly this:
 * harvested comment text can display one address while pointing somewhere else,
 * published under a real person's agent account.
 *
 * NARROWED 2026-08-24, after review. The first implementation required EVERY
 * label to be a URL equal to the href, which is a much larger rule than the
 * finding asked for: it silently downgraded every ordinary descriptive link
 * (`[my site]`, `[click here]`, `[docs]`) to dead plain text across all ten
 * surfaces that render story and point text — measured, not inferred. That
 * regression was invisible because the pre-existing P540 test asserting
 * `[my site](https://example.com)` renders a link had its labels rewritten to
 * literal URLs so it would keep passing. Tests are specs; the spec was right.
 *
 * The rule is therefore scoped to labels that MAKE a claim. A label that looks
 * like an address is checked against the address; a label that is ordinary
 * prose asserts nothing about where it goes and is left alone, exactly as on
 * the open web.
 *
 * The comparison is made on PARSED urls, never raw strings — percent- and
 * punycode-encoding otherwise split what this check saw from what the browser
 * renders. The raw label token is compared, not a rendered one, so nested
 * markup (`[**evil.com**](https://evil.com)`) cannot diverge the comparison
 * from what the reader actually sees.
 */

/** Latin plus the marks that legitimately decorate it. Anything else is another script. */
const LATIN_SAFE_HOST = /^[a-z0-9.-]+$/;

/**
 * A destination host that mixes scripts, or is written in a non-Latin script at
 * all, cannot be judged by matching: a Cyrillic `а` in `аpple.com` is
 * byte-identical in label and href and passes any match rule. This is a
 * separate check because matching structurally cannot express it.
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

/** Normalizes a parsed URL down to what a reader would call "the same place". */
function urlIdentity(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${host}${path}${parsed.search}`;
}

/**
 * The label as the READER sees it, with markdown emphasis stripped.
 *
 * Load-bearing for the claim test, not cosmetic. `[**https://example.com**](https://evil.com)`
 * renders a bold address and is exactly the disguise this check exists to stop, but the RAW
 * token starts with `**` and so matches no address shape — it would sail through as prose.
 *
 * Only LEADING and TRAILING runs of markdown emphasis/code markers are removed. Interior
 * characters are untouched, because `_` and `~` are legal inside a real URL path
 * (`example.com/a_b`) and stripping them there would corrupt the very string being compared.
 */
function visibleLabel(rawLabel: string): string {
  return rawLabel.trim().replace(/^[*_~`]+/, '').replace(/[*_~`]+$/, '').trim();
}

/**
 * Every address-shaped token in the label — the claims the reader can see.
 *
 * Scans the WHOLE label, not just its first token. `[Read more at example.com](https://evil.com)`
 * makes a claim in its last word, and checking only the head let that through: measured, then
 * fixed. An empty result means the label is ordinary prose, promising nothing about where it
 * goes, which is the open web's normal behaviour and stays allowed.
 *
 * A shape test, run before any parsing: `new URL()` accepts a bare word as a hostname
 * (`new URL('https://docs')` is valid, host `docs`), so parse-success alone cannot separate an
 * address from prose — that is exactly how `[docs](https://example.com/docs)` came to be
 * rejected by the first implementation.
 */
function addressTokensIn(rawLabel: string): string[] {
  return visibleLabel(rawLabel)
    .split(/[\s,;]+/)
    .filter(Boolean)
    .filter(
      (token) =>
        /^https?:\/\//i.test(token) ||
        /^www\./i.test(token) ||
        /^[^\s/?#]+\.[a-z]{2,}([/?#]|$)/i.test(token)
    );
}

/**
 * True when the label may be rendered as a clickable link to `href`.
 *
 * Two separate questions, in order:
 *  1. Is the DESTINATION judgeable at all? A confusable host defeats matching
 *     structurally, so it is refused regardless of the label.
 *  2. Does the LABEL make a claim? If not, there is nothing to contradict and
 *     the link renders normally. If it does, the claim must hold exactly.
 *
 * Fail-safe within the claim branch: anything unparseable or mismatched returns
 * false and the caller renders the label as plain, non-clickable text.
 */
export function labelMatchesDestination(rawLabel: string, href: string): boolean {
  if (hasConfusableHost(href)) return false;
  const claims = addressTokensIn(rawLabel);
  if (claims.length === 0) return true;
  const hrefIdentity = urlIdentity(href.trim());
  if (!hrefIdentity) return false;
  // EVERY visible address must be the destination. A label naming two different
  // places cannot be honest about one link, so one matching token is not enough.
  return claims.every((token) => {
    const labelIdentity = urlIdentity(token);
    return labelIdentity !== null && labelIdentity === hrefIdentity;
  });
}

export function linkifyText(text: string): ReactNode[] {
  if (!text) return [];

  // Markdown link pattern: [non-empty text](https?://url)
  // Only allows http/https schemes (XSS prevention)
  const MARKDOWN_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

  // Phase 1: Extract markdown links, collect text segments for auto-URL processing
  const segments: Array<{ type: 'text'; value: string } | { type: 'mdlink'; label: string; href: string; key: number }> = [];
  let lastIndex = 0;
  let mdMatch: RegExpExecArray | null;

  MARKDOWN_PATTERN.lastIndex = 0;
  while ((mdMatch = MARKDOWN_PATTERN.exec(text)) !== null) {
    const start = mdMatch.index;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'mdlink', label: mdMatch[1], href: mdMatch[2], key: start });
    lastIndex = start + mdMatch[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  // Phase 2: Process each text segment through auto-URL detection, pass markdown links through
  const nodes: ReactNode[] = [];
  let keyCounter = 0;

  for (const segment of segments) {
    if (segment.type === 'mdlink') {
      if (!labelMatchesDestination(segment.label, segment.href)) {
        // Fail-safe: content is preserved, but a disguised link never reaches
        // the DOM. Rendered as the reader wrote it, plain and non-clickable.
        nodes.push(
          createElement('span', { key: `md-plain-${segment.key}` }, segment.label)
        );
      } else {
        nodes.push(
          createElement('a', {
            key: `md-${segment.key}`,
            href: segment.href,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'text-blue-500 hover:underline',
          }, segment.label)
        );
      }
    } else {
      // Auto-URL detection on plain text segments
      const urlNodes = linkifyUrls(segment.value, keyCounter);
      nodes.push(...urlNodes);
      keyCounter += urlNodes.length;
    }
  }

  return nodes;
}

/**
 * Auto-detects raw URLs in plain text and returns ReactNode[].
 * Internal helper — called per text segment after markdown extraction.
 */
function linkifyUrls(text: string, keyOffset: number): ReactNode[] {
  // Allowlist pattern: https?:// URLs OR bare domain.tld patterns
  // Bare domains: word.tld optionally followed by path
  // No negative-lookbehind assertion here (Safari < 16.4 throws SyntaxError at
  // construction when one is present — P983). The word-char-adjacency check a
  // lookbehind would have done is replicated in the match loop below instead
  // (see "Skip bare domains glued to a preceding word char").
  const URL_PATTERN = /(?:https?:\/\/[^\s]+|[\w-]+\.(?:com|org|net|io|co|me|dev|app|ai|uk|de|fr|au|ca|edu|gov|info|biz|tv|fm|ly|gl|gg|pm|club)(?:\/[^\s]*)?)/gi;
  // P1141 (d): `>` joins the trailing set. An autolink `<https://example.com>`
  // otherwise emits an href carrying the closing bracket — a link that renders
  // as correct and resolves to a 404. Confirmed by test, not by assumption.
  const TRAILING_PUNCT = /[.,;:!?)>]+$/;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    let url = match[0];
    const start = match.index;

    // Strip trailing punctuation (e.g. "example.com." → "example.com")
    const trailingMatch = url.match(TRAILING_PUNCT);
    if (trailingMatch) {
      url = url.slice(0, url.length - trailingMatch[0].length);
    }

    // Skip matches embedded in dangerous schemes (e.g. blob:https://...)
    if (start > 0 && text[start - 1] === ':') {
      if (start > lastIndex) {
        nodes.push(text.slice(lastIndex, start + url.length));
      }
      lastIndex = start + url.length;
      continue;
    }

    // Skip bare domains glued to a preceding word char (e.g. "xfoo.com") — this
    // used to be enforced by a negative-lookbehind assertion in URL_PATTERN,
    // removed for Safari < 16.4 compat (P983). Full http(s):// URLs are exempt.
    const isBareDomain = !/^https?:\/\//i.test(url);
    if (isBareDomain && start > 0 && /\w/.test(text[start - 1] ?? '')) {
      // start can equal lastIndex here (no gap — this match is glued directly
      // onto the previous one's tail), so guard on the full slice length, not
      // just the gap, or the glued text silently disappears from output.
      if (start + url.length > lastIndex) {
        nodes.push(text.slice(lastIndex, start + url.length));
      }
      lastIndex = start + url.length;
      continue;
    }

    // Add preceding plain text
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    // Build href: prefix bare domains with https://
    const href = url.match(/^https?:\/\//i) ? url : `https://${url}`;

    nodes.push(
      createElement('a', {
        key: `url-${keyOffset + start}`,
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        className: 'text-blue-500 hover:underline',
      }, url)
    );

    lastIndex = start + url.length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * P1141 — story text renders structure.
 *
 * P1096 banned markdown in story text outright, but that ban came from exactly
 * one finding (2026-08-20): a link can display one label while pointing
 * somewhere else. Bold, line breaks, blockquotes and headings were never the
 * concern, and a framed-argument story needs them to be readable. This is the
 * narrow parser that allows those four and nothing else — inline content still
 * goes through `linkifyText`, so the label/destination match applies inside
 * every structure.
 *
 * Headings map to `h3`/`h4`, never `h1`: story text is nested inside a page
 * that already owns its document outline.
 */
export function renderStoryText(text: string): ReactNode[] {
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (key: number) => {
    if (paragraph.length === 0) return;
    const body = paragraph.join('\n');
    blocks.push(
      createElement(
        'p',
        // Paragraphs need visible separation. Without it a blank line in the
        // source collapses to nothing and two paragraphs read as one run-on
        // block — found in a real-route render at 375px, not by a unit test,
        // because the unit test asserts the ELEMENTS and not the gap.
        { key: `p-${key}`, className: 'whitespace-pre-wrap mb-3 last:mb-0' },
        ...renderInline(body)
      )
    );
    paragraph = [];
  };

  lines.forEach((line, index) => {
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (heading) {
      flushParagraph(index);
      const tag = heading[1].length === 1 ? 'h3' : 'h4';
      const className =
        tag === 'h3' ? 'text-lg font-semibold mt-4 mb-2' : 'text-base font-semibold mt-3 mb-1';
      blocks.push(
        createElement('h' + (tag === 'h3' ? '3' : '4'), { key: `h-${index}`, className },
          ...renderInline(heading[2]))
      );
      return;
    }

    if (quote) {
      flushParagraph(index);
      blocks.push(
        createElement(
          'blockquote',
          {
            key: `bq-${index}`,
            className: 'border-l-4 border-gray-300 dark:border-gray-600 pl-3 italic my-2',
          },
          ...renderInline(quote[1])
        )
      );
      return;
    }

    if (line.trim() === '') {
      flushParagraph(index);
      return;
    }

    paragraph.push(line);
  });

  flushParagraph(lines.length);
  return blocks;
}

/** Bold spans, then links, within one block of text. */
function renderInline(text: string): ReactNode[] {
  const BOLD = /\*\*([^*]+)\*\*/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BOLD.lastIndex = 0;
  while ((match = BOLD.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...linkifyText(text.slice(lastIndex, match.index)));
    }
    nodes.push(
      createElement('strong', { key: `b-${match.index}`, className: 'font-semibold' },
        ...linkifyText(match[1]))
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(...linkifyText(text.slice(lastIndex)));
  }
  return nodes;
}
