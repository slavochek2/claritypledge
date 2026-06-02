import { Fragment, type ReactNode } from 'react';

/**
 * Single-source renderer for the verified-understanding oath body.
 *
 * Both the Clarity Pledge (PLEDGE_VERSIONS renderers in pledge-text.tsx) and the
 * Clarity Partner Agreement certificate render emphasis through this helper, so
 * the bolded phrases live ONCE in VERIFIED_UNDERSTANDING_OATH[*].boldPhrases and
 * can never diverge between surfaces (P857).
 *
 * Layout contract (matches the hand-written pledge v4 renderers byte-for-byte):
 * - Split `text` into paragraphs on blank lines (\n\n).
 * - Single paragraph  → inline fragment (no block wrapper).
 * - Multiple paragraphs → block spans: first `block`, the rest `block mt-3`
 *   (tailwind) / `display:block` + `marginTop:0.75em` (inline).
 * - Each occurrence of a boldPhrase is wrapped in a bold span
 *   (`font-bold` tailwind / `fontWeight:'bold'` inline).
 *
 * `variant: 'inline'` is for the canvas/PNG export certificates (no Tailwind).
 */
export function OathText({
  text,
  boldPhrases = [],
  variant = 'tailwind',
}: {
  text: string;
  boldPhrases?: readonly string[];
  variant?: 'tailwind' | 'inline';
}): ReactNode {
  const paragraphs = text.split('\n\n');
  const multi = paragraphs.length > 1;

  return paragraphs.map((para, i) => {
    const content = boldSegments(para, boldPhrases, variant);
    if (!multi) return <Fragment key={i}>{content}</Fragment>;
    if (variant === 'tailwind') {
      return (
        <span key={i} className={i > 0 ? 'block mt-3' : 'block'}>
          {content}
        </span>
      );
    }
    return (
      <span key={i} style={{ display: 'block', marginTop: i > 0 ? '0.75em' : undefined }}>
        {content}
      </span>
    );
  });
}

function boldSegments(
  paragraph: string,
  boldPhrases: readonly string[],
  variant: 'tailwind' | 'inline',
): ReactNode {
  if (boldPhrases.length === 0) return paragraph;

  // boldPhrases are curated authored constants (VERIFIED_UNDERSTANDING_OATH) and
  // must be whole, whitespace/punctuation-bounded phrases: there is no \b guard,
  // so a phrase that is a mid-word substring of the text would be falsely bolded.
  // Longest phrases first so a phrase that contains another still matches whole.
  const escaped = [...boldPhrases]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const splitter = new RegExp(`(${escaped.join('|')})`, 'g');
  const phraseSet = new Set(boldPhrases);

  return paragraph.split(splitter).map((part, i) => {
    if (!phraseSet.has(part)) return <Fragment key={i}>{part}</Fragment>;
    return variant === 'tailwind' ? (
      <span key={i} className="font-bold">
        {part}
      </span>
    ) : (
      <span key={i} style={{ fontWeight: 'bold' }}>
        {part}
      </span>
    );
  });
}
