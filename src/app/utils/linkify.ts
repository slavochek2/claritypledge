import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * Parses plain text and returns ReactNode[] with URLs converted to <a> elements.
 * Uses allowlist approach: only https://, http://, and bare domain.tld patterns.
 * Dangerous schemes (javascript:, vbscript:, data:, blob:) are never emitted.
 * Bare domain hrefs are prefixed with https:// to avoid relative URL resolution.
 */
export function linkifyText(text: string): ReactNode[] {
  if (!text) return [];

  // Allowlist pattern: https?:// URLs OR bare domain.tld patterns
  // Bare domains: word.tld optionally followed by path
  const URL_PATTERN = /(?:https?:\/\/[^\s]+|(?<!\w)[\w-]+\.(?:com|org|net|io|co|me|dev|app|ai|uk|de|fr|au|ca|edu|gov|info|biz|tv|fm|ly|gl|gg|pm|club)(?:\/[^\s]*)?)/gi;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  URL_PATTERN.lastIndex = 0;

  while ((match = URL_PATTERN.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;

    // Skip matches embedded in dangerous schemes (e.g. blob:https://...)
    // If the character immediately before the match is ':', the URL is part of
    // a non-http scheme (blob:, data:, etc.) and must not be linkified.
    if (start > 0 && text[start - 1] === ':') {
      // Emit the entire consumed portion as plain text and continue
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
        key: start,
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
