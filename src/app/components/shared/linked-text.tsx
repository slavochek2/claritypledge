/**
 * @file linked-text.tsx
 * @description Renders plain text with markdown-style links [text](url) as clickable <a> tags.
 * Only supports link syntax — no other markdown features.
 */

import type { ReactNode } from 'react';

const LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

/** Parse text containing [label](url) into React nodes with clickable links. */
function parseLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  LINK_REGEX.lastIndex = 0;

  while ((match = LINK_REGEX.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const [, label, url] = match;
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        {label}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Drop-in replacement for rendering text that may contain [label](url) links. */
export function LinkedText({ text }: { text: string }) {
  return <>{parseLinks(text)}</>;
}
