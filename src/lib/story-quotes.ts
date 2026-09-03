/**
 * @file story-quotes.ts
 * @description P1212 §1 — one place that knows the `Supporting quotes from {Name}`
 * label, so the label lives in exactly one rendered position on every surface.
 *
 * THE DEFECT THIS CLOSES. `story.content` carries the label verbatim because
 * `/slava:disagreement:publish` asserts it there (its read-back grep is a mechanical
 * backstop on the story text, and P1212 §1 deliberately keeps it rather than moving a
 * gate that currently protects the label). `story-video-quotes.tsx` ALSO emits that
 * heading, above the quotes it renders from `video_quotes`. On the story detail page
 * both fired, so the same heading — and, before §1, the same quote bodies — rendered
 * twice on one page.
 *
 * THE RULE. No surface renders the label out of `content`. Every surface strips it
 * with `stripQuoteLabel` before display; the surfaces that render `StoryVideoQuotes`
 * get the heading from that component, which cannot render a heading without bodies
 * (it returns null on an empty array). "Renders the label" and "renders the bodies"
 * are therefore the same condition by construction, which is what
 * `p1212-quote-label-parity.test.ts` asserts over the surface list.
 *
 * THE LEGACY CASE. Sealed letters freeze `storyText` AND `videoQuotes` independently
 * (`20260823120100_p1141_seal_rpc_video_fields.sql:102,105`), so a letter sealed
 * before §1 has the quote BODIES inline in its frozen text as well as in its frozen
 * `videoQuotes`. Snapshots are immutable — re-filing the story cannot repair one — so
 * the branch has to live in the renderer: `quotesAlreadyInContent` detects it and the
 * live card suppresses its quote block for exactly those letters.
 */

import type { VideoQuote } from './video';

/** The label's fixed prefix. The full string is `${QUOTE_LABEL_PREFIX} {Full Name}`. */
export const QUOTE_LABEL_PREFIX = 'Supporting quotes from';

/** Matches the whole label line, wherever it sits in the body. */
const QUOTE_LABEL_LINE = /^[ \t]*Supporting quotes from .*$/gm;

/** True when the story text carries the publish gate's quote label. */
export function hasQuoteLabel(content: string | null | undefined): boolean {
  return !!content && content.includes(QUOTE_LABEL_PREFIX);
}

/**
 * Remove the quote label line from text about to be displayed.
 *
 * Content-only: the stored value is untouched, because the publish precondition
 * asserts the label against the read-back of `stories.content` and P1212 §1 keeps it
 * there deliberately. Surfaces call this at render.
 *
 * Collapses the blank line the removal leaves behind so a stripped body does not open
 * with a gap the unstripped one did not have.
 */
export function stripQuoteLabel(content: string | null | undefined): string {
  if (!content) return '';
  if (!content.includes(QUOTE_LABEL_PREFIX)) return content;
  return content
    .replace(QUOTE_LABEL_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * True when the quote BODIES are already inside the story text — the pre-§1 shape,
 * frozen into every letter sealed before the cutover.
 *
 * Tests the first quote rather than all of them: the pre-§1 drafting rule put at most
 * one quote per linked point into the text while `video_quotes` carried the full
 * verified set, so requiring every quote to appear would miss exactly the letters this
 * guards. A single body found inline means the frozen text already shows quotes, and
 * rendering the block as well would duplicate them.
 *
 * The label alone does NOT count — §1's whole point is that the label stays in
 * `content` while the bodies move out.
 */
export function quotesAlreadyInContent(
  content: string | null | undefined,
  quotes: VideoQuote[] | null | undefined
): boolean {
  if (!content || !quotes || quotes.length === 0) return false;
  const haystack = normalizeQuoteText(content);
  return quotes.some((quote) => {
    const needle = normalizeQuoteText(quote.text);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Quote bodies are stored with typographic quotation marks in some rows and straight
 * ones in others, and line-wrapped differently in `content` than in `video_quotes`.
 * Comparing raw strings misses those letters, and a missed letter renders the
 * duplication this function exists to detect.
 */
function normalizeQuoteText(value: string): string {
  return value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
