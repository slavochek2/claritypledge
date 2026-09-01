/**
 * Markdown rendering utilities using `marked` (CJS, zero transitive deps).
 * Replaces react-markdown to eliminate ESM-only dep tree that caused recurring
 * Vite "504 Outdated Optimize Dep" errors.
 *
 * Each renderer uses its own Marked instance to avoid global state mutation.
 */
import { Marked, type MarkedExtension, type Tokens } from 'marked';
import katex from 'katex';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // strip HTML tags
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-');
}

/** Escape HTML special characters in untrusted strings */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Validate href — only allow safe protocols. Returns sanitized href or empty string. */
function sanitizeHref(href: string): string {
  try {
    const url = new URL(href, 'https://placeholder.invalid');
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return href.replace(/"/g, '&quot;');
    }
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// KaTeX extension for marked
// ---------------------------------------------------------------------------

function katexExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src: string) { return src.indexOf('$$'); },
        tokenizer(src: string) {
          const match = src.match(/^\$\$\n?([\s\S]+?)\n?\$\$/);
          if (match) {
            return { type: 'mathBlock', raw: match[0], text: match[1].trim() };
          }
        },
        renderer(token: Tokens.Generic) {
          try {
            return `<div class="katex-display">${katex.renderToString(token.text, { displayMode: true, throwOnError: false })}</div>\n`;
          } catch {
            return `<div class="katex-display"><code>${escapeHtml(token.text)}</code></div>\n`;
          }
        },
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src: string) {
          // Only match $ that looks like math: preceded by start-of-string, space,
          // or opening paren — NOT preceded by a digit (avoids "$1.2 trillion")
          const match = src.match(/(?:^|[\s(])(\$)/);
          if (match) {
            return (match.index ?? 0) + match[0].length - 1; // position of the $
          }
          return -1;
        },
        tokenizer(src: string) {
          const match = src.match(/^\$([^\n$]+?)\$/);
          if (match) {
            // Don't match if the content looks like a currency amount (starts with digit)
            if (/^\d/.test(match[1].trim())) return;
            return { type: 'mathInline', raw: match[0], text: match[1].trim() };
          }
        },
        renderer(token: Tokens.Generic) {
          try {
            return katex.renderToString(token.text, { displayMode: false, throwOnError: false });
          } catch {
            return `<code>${escapeHtml(token.text)}</code>`;
          }
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Renderer extensions
// ---------------------------------------------------------------------------

/** For trusted content: adds target=_blank to links, escapes href */
const trustedLinkRenderer: MarkedExtension = {
  renderer: {
    link({ href, text }) {
      const safeHref = href.replace(/"/g, '&quot;');
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
};

// CTA marker sentinel — used to split HTML for React component injection
const CTA_MARKER = '<!-- CTA_INJECTION_POINT -->';

/** Heading IDs that should have CTA blocks after them */
const CTA_HEADING_IDS = new Set([
  'the-hidden-cost-in-your-life',
  'the-clarity-principle-the-solution',
  'from-individual-pledge-to-societal-movement',
]);

const articleRenderer: MarkedExtension = {
  renderer: {
    // In marked v17, custom renderers receive token objects where `text` is raw markdown.
    // Must use this.parser.parseInline(tokens) to get rendered HTML with bold/italic/links.
    heading({ tokens, depth }) {
      const body = this.parser.parseInline(tokens);
      const id = slugify(body);
      let html = `<h${depth} id="${id}">${body}</h${depth}>\n`;
      if (depth === 2 && CTA_HEADING_IDS.has(id)) {
        html += CTA_MARKER;
      }
      return html;
    },
    paragraph({ tokens }) {
      const body = this.parser.parseInline(tokens);
      // Add anchor IDs for bold "N. Title" patterns (deep-linkable numbered items)
      const match = body.match(/^<strong>(\d+\.\s*)(.+?)<\/strong>/);
      if (match) {
        const id = slugify(match[2]);
        return `<p id="${id}" class="scroll-mt-24">${body}</p>\n`;
      }
      return `<p>${body}</p>\n`;
    },
    link({ href, text }) {
      const safeHref = href.replace(/"/g, '&quot;');
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
};

// ---------------------------------------------------------------------------
// Pre-configured Marked instances (no global state mutation)
// ---------------------------------------------------------------------------

/** For user-generated content: strips raw HTML + images, validates link protocols */
const safeMd = new Marked({
  renderer: {
    html() { return ''; },
    image() { return ''; },
    link({ href, text }) {
      const safe = sanitizeHref(href);
      if (!safe) return escapeHtml(text);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    },
  },
});

/** For trusted content (committed content like ToS) */
const trustedMd = new Marked(trustedLinkRenderer);

/**
 * P1219: For the legal documents (ToS, Privacy Policy). They are committed files, but the
 * pages render them via dangerouslySetInnerHTML, so "no raw HTML" must be a property the
 * renderer enforces rather than one the markdown happens to satisfy today. Raw HTML tokens
 * (block or inline) are escaped to visible, inert text; images are dropped; links go
 * through the same protocol allowlist as user content.
 */
const legalMd = new Marked({
  renderer: {
    html({ text }) { return escapeHtml(text); },
    image() { return ''; },
    link({ href, tokens }) {
      const body = this.parser.parseInline(tokens);
      const safe = sanitizeHref(href);
      if (!safe) return body;
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${body}</a>`;
    },
  },
});

/** For the manifesto article: KaTeX, heading IDs, paragraph anchors, CTA markers */
const articleMd = new Marked(katexExtension(), articleRenderer);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render user-generated markdown (strips raw HTML, validates link protocols) */
export function renderMarkdownSafe(content: string): string {
  if (!content) return '';
  return safeMd.parse(content) as string;
}

/** Render trusted markdown (committed content like ToS) */
export function renderMarkdownTrusted(content: string): string {
  if (!content) return '';
  return trustedMd.parse(content) as string;
}

/** Render a legal document (ToS / Privacy Policy): raw HTML escaped, links protocol-checked */
export function renderMarkdownLegal(content: string): string {
  if (!content) return '';
  return legalMd.parse(content) as string;
}

/**
 * Render the manifesto article with KaTeX, heading IDs, paragraph anchors,
 * and CTA injection markers.
 *
 * Returns an array of HTML segments split at CTA injection points.
 * Caller interleaves React CTA components between segments.
 */
export function renderArticle(content: string): string[] {
  if (!content) return [''];
  const html = articleMd.parse(content) as string;
  return html.split(CTA_MARKER);
}
