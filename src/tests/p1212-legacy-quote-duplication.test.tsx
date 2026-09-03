/**
 * @file p1212-legacy-quote-duplication.test.tsx
 * @description P1212 §4b legacy — the quote block must not print a quote the frozen
 * prose already prints.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE SOURCE-CONTRACT CANARIES. The canary in
 * p1212-agent-surface-contract.test.ts greps `live-story-card-expanded.tsx` for the
 * identifier `quotesAlreadyInContent`. A mutation run on 2026-09-03 proved that
 * assertion is nearly worthless on its own: replacing the whole filter with
 * `const quotesToRender = allQuotes; const quotesAlreadyInContent = false;` — which
 * restores the exact duplication bug — left all ten canaries GREEN, because the
 * identifier survived. Grepping for a name proves a name exists, never that the
 * behaviour behind it is right.
 *
 * The spec's Done-When asks for this directly: "A snapshot-fixture test asserts a pre-§1
 * sealed letter renders its quote block once, not twice (§4b legacy branch) — failing
 * before the fix, passing after."
 *
 * THE HAZARD BEING TESTED. The seal RPC freezes BOTH halves of a story into the letter
 * snapshot — `point_config.storyText` (which, before §1, had the quote bodies baked into
 * the prose) and `point_config.videoQuotes`
 * (`20260823120100_p1141_seal_rpc_video_fields.sql:102,105`). Snapshots are immutable, so
 * re-filing the story cannot repair an already-sealed letter. The moment §4b adds a quote
 * block to this surface, every letter sealed before §1 would render its quotes twice
 * unless the renderer branches — which is what these tests pin.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { quotesNotInStoryText } from '@/lib/video';
import type { StoryWithPoints } from '@/app/types';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const QUOTE_A = 'the models are not reasoning, they are interpolating';
const QUOTE_B = 'scaling alone will not produce a world model';

function makeStory(overrides: Partial<StoryWithPoints> = {}): StoryWithPoints {
  return {
    id: 'story-1',
    authorId: 'author-1',
    authorName: 'Test Sender',
    authorSlug: 'test-sender',
    authorAvatarColor: '#3B82F6',
    authorEarsCount: 0,
    content: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    understoodCount: 0,
    visibility: 'public',
    currentVersion: 1,
    tags: [],
    systemTags: [],
    points: [],
    ...overrides,
  } as StoryWithPoints;
}

/**
 * `defaultStoryExpanded` is load-bearing, not boilerplate. The card truncates its prose at
 * 100 characters, and every fixture here is longer than that. Left collapsed, the inline
 * copy of the quote would be cut off — so "appears exactly once" would pass for the wrong
 * reason, on a card that still duplicates the quote the moment a reader clicks "Show more".
 */
function renderCard(story: StoryWithPoints) {
  return render(
    <BrowserRouter>
      <LiveStoryCardExpanded story={story} defaultStoryExpanded />
    </BrowserRouter>
  );
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('P1212 §4b legacy — a letter sealed before §1 renders its quotes exactly once', () => {
  it('does not repeat a quote the frozen prose already contains', () => {
    const { container } = renderCard(
      makeStory({
        // The pre-§1 shape: the quote body sits inline in the prose AND in video_quotes.
        content: `Yann LeCun argues that current systems fall short of understanding, and he is explicit about the mechanism. Supporting quotes from Yann LeCun: "${QUOTE_A}"`,
        videoUrl: VIDEO_URL,
        videoQuotes: { quotes: [{ text: QUOTE_A, seconds: 42 }], durationSeconds: 300 },
      })
    );

    const text = container.textContent ?? '';
    expect(text).toContain(QUOTE_A);
    expect(occurrences(text, QUOTE_A)).toBe(1);
    expect(container.querySelector('[data-legacy-quotes-inline="true"]')).toBeTruthy();
  });

  it('renders the quote block normally when the prose does NOT contain the quotes (post-§1)', () => {
    const { container } = renderCard(
      makeStory({
        // The post-§1 shape: the label stays in the prose, the bodies live only in video_quotes.
        content:
          'Yann LeCun argues that current systems fall short of understanding, and he is explicit about the mechanism at work. Supporting quotes from Yann LeCun:',
        videoUrl: VIDEO_URL,
        videoQuotes: { quotes: [{ text: QUOTE_A, seconds: 42 }], durationSeconds: 300 },
      })
    );

    const text = container.textContent ?? '';
    expect(occurrences(text, QUOTE_A)).toBe(1);
    expect(container.querySelector('[data-testid="story-video-quotes"]')).toBeTruthy();
    expect(container.querySelector('[data-legacy-quotes-inline="true"]')).toBeNull();
  });

  /**
   * The case that rules out the spec's original "suppress the whole block" fix. Before §1
   * the drafting rule was "at most ONE quote per linked point inside the story text", so
   * the frozen prose typically holds a SUBSET. Suppressing the block on a match would hide
   * every quote that only ever lived in `video_quotes` — silent content loss on an
   * immutable snapshot, which the acceptance criteria forbid ("No letter loses content it
   * rendered before the change").
   */
  it('still renders the quotes the prose does NOT hold — subset case, nothing lost', () => {
    const { container } = renderCard(
      makeStory({
        content: `Yann LeCun argues that current systems fall short of real understanding. Supporting quotes from Yann LeCun: "${QUOTE_A}"`,
        videoUrl: VIDEO_URL,
        videoQuotes: {
          quotes: [
            { text: QUOTE_A, seconds: 42 },
            { text: QUOTE_B, seconds: 96 },
          ],
          durationSeconds: 300,
        },
      })
    );

    const text = container.textContent ?? '';
    expect(occurrences(text, QUOTE_A)).toBe(1);
    expect(occurrences(text, QUOTE_B)).toBe(1);
  });

  it('renders no quote block at all when the story has no video', () => {
    const { container } = renderCard(
      makeStory({
        content: 'A story with no video at all, and therefore nothing to seek into or quote from.',
        videoQuotes: { quotes: [{ text: QUOTE_A, seconds: 42 }], durationSeconds: 300 },
      })
    );

    expect(container.querySelector('[data-testid="story-video-quotes"]')).toBeNull();
  });
});

describe('quotesNotInStoryText — the predicate behind the legacy branch', () => {
  const q = (text: string) => [{ text, seconds: 1 }];

  it('drops a quote the prose contains verbatim', () => {
    expect(quotesNotInStoryText(`prose … "${QUOTE_A}" … more`, q(QUOTE_A))).toEqual([]);
  });

  it('keeps a quote the prose does not contain', () => {
    expect(quotesNotInStoryText('prose with nothing quoted', q(QUOTE_A))).toHaveLength(1);
  });

  it('matches across a line break where the prose had a space', () => {
    const wrapped = QUOTE_A.replace(' they are', '\n   they are');
    expect(quotesNotInStoryText(`prose ${wrapped} end`, q(QUOTE_A))).toEqual([]);
  });

  it('matches through typographic quotation marks and case', () => {
    const curly = `“${QUOTE_A.toUpperCase()}”`;
    expect(quotesNotInStoryText(`prose ${curly} end`, q(QUOTE_A))).toEqual([]);
  });

  it('matches when the prose truncated the tail — the prefix is what is compared', () => {
    const truncated = QUOTE_A.slice(0, 45) + '…';
    expect(quotesNotInStoryText(`prose ${truncated}`, q(QUOTE_A))).toEqual([]);
  });

  /**
   * A short quote compares WHOLE, not by prefix. A 40-character prefix rule applied to a
   * 10-character quote would collide with ordinary prose and hide a quote that is not
   * actually inline — and unlike the reverse direction, that is real content loss.
   */
  it('does not hide a short quote on a coincidental prefix collision', () => {
    expect(quotesNotInStoryText('we talked about the models today', q('the models are wrong'))).toHaveLength(1);
  });

  it('returns nothing to render when there are no quotes', () => {
    expect(quotesNotInStoryText('any prose', [])).toEqual([]);
  });

  it('keeps every quote when the prose is empty', () => {
    expect(quotesNotInStoryText('', q(QUOTE_A))).toHaveLength(1);
  });
});
