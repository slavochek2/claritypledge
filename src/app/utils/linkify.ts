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
      nodes.push(
        createElement('a', {
          key: `md-${segment.key}`,
          href: segment.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-blue-500 hover:underline',
        }, segment.label)
      );
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
  const URL_PATTERN = /(?:https?:\/\/[^\s]+|(?<!\w)[\w-]+\.(?:com|org|net|io|co|me|dev|app|ai|uk|de|fr|au|ca|edu|gov|info|biz|tv|fm|ly|gl|gg|pm|club)(?:\/[^\s]*)?)/gi;
  const TRAILING_PUNCT = /[.,;:!?)]+$/;

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
