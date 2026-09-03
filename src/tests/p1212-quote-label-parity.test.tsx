/**
 * @file p1212-quote-label-parity.test.tsx
 * @description P1212 Done-When 4, 6 and 7.
 *
 * DW-7 is the parameterised one and the reason this file is shaped the way it is:
 * "every surface that renders the quote LABEL also renders the quote bodies —
 * parameterised over the surface list, so adding a surface without quotes fails."
 *
 * The surface list below is the census from P1212 §4 + §4d — SEVEN surfaces, not the
 * four the spec's first draft carried and not the six its second draft carried. The
 * table was twice built by grepping a component name, which by construction cannot find
 * a surface that inlines its own markup. Adding an eighth surface without adding it here
 * does not fail this test; adding it here without wiring it does. That asymmetry is why
 * the list carries the file path of every surface and why `every surface file exists`
 * runs first — a renamed file must break loudly rather than silently drop a row.
 *
 * WHY SOURCE-CONTRACT FOR THE PARITY SWEEP. Four of the seven surfaces are private
 * module-local functions (LinkedStoryCard, StoryCardFull) or pages with page-sized data
 * dependencies. The repo already uses this shape for exactly that reason — see
 * p1141-letter-snapshot-contract.test.ts and p1060-source-contract.test.ts. The two
 * behavioural claims that a grep genuinely cannot make — that the legacy sealed letter
 * renders its quotes ONCE, and that a post-§1 letter renders them at all — are render
 * tests below, against a snapshot fixture built through the real mapper.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import { docStoryToSnapshot, snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import { QUOTE_LABEL_PREFIX, storyTextForDisplay, stripQuoteLabel } from '@/lib/story-quotes';
import { stripHashtags } from '@/lib/utils';

const SRC = join(__dirname, '..');

/**
 * STRIP COMMENTS BEFORE MATCHING — the same rule p1212-agent-surface-contract.test.ts
 * learned, and it bites in BOTH directions.
 *
 * There, a comment naming `MachineChip` turned an assertion green while no component
 * referenced the chip in code — a false pass. Here it produced the opposite: documenting
 * the eighth surface required writing the label string into a comment explaining the
 * defect, and `does not carry its own copy of the label string` went red on the prose
 * while the code was correct — a false fail, which is the failure mode that pressures you
 * to delete the explanation rather than fix the test.
 *
 * A source-contract assertion is a claim about CODE. Comments are not code.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments, including JSX {/* … */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments, sparing the // in URLs
}

const read = (rel: string) => codeOnly(readFileSync(join(SRC, rel), 'utf8'));

/**
 * `renders quotes` — the surface mounts StoryVideoQuotes, so the label it shows is that
 * component's own heading and cannot appear without bodies beneath it (the component
 * returns null on an empty array).
 *
 * `suppresses label` — the surface renders no quote block, so it must run its story text
 * through `stripQuoteLabel` before display. The label stays in the STORED `content`,
 * where /slava:disagreement:publish's read-back grep asserts it; what this forbids is
 * putting it on screen with nothing under it.
 *
 * There is deliberately no third option. A surface that renders `story.content` raw is
 * the defect, whichever way it is spelled.
 */
type QuotePolicy = 'renders quotes' | 'suppresses label';

/**
 * Whether the surface is a story CARD (must route media through StoryMedia) or a compact
 * EXCERPT of a story shown inside something else (a point card's expander), where a video
 * player would be wrong. Added with the eighth surface — see the QuotedStory row below.
 */
type MediaPolicy = 'card' | 'excerpt';

const SURFACES: ReadonlyArray<{ name: string; file: string; policy: QuotePolicy; media: MediaPolicy }> = [
  { name: 'Feed story card', file: 'app/components/feed/feed-story-card.tsx', policy: 'suppresses label', media: 'card' },
  { name: 'Point detail / linked story', file: 'app/components/social/story-card-with-links.tsx', policy: 'suppresses label', media: 'card' },
  { name: 'Story detail', file: 'app/components/social/StoryCardDetail.tsx', policy: 'renders quotes', media: 'card' },
  { name: 'Profile (StoryCardFull)', file: 'app/pages/profile-page-v2.tsx', policy: 'suppresses label', media: 'card' },
  { name: 'Live / sealed letter', file: 'app/components/partners/live-story-card-expanded.tsx', policy: 'renders quotes', media: 'card' },
  // §4d — the seventh surface. Private to StoryCardDetail.tsx, which is why it shares a
  // file with "Story detail" and why that file must satisfy BOTH policies.
  { name: 'Nested LinkedStoryCard', file: 'app/components/social/StoryCardDetail.tsx', policy: 'suppresses label', media: 'card' },
  /**
   * THE EIGHTH SURFACE, found 2026-09-03 while implementing §5.
   *
   * `QuotedStory` is module-private to point-card-with-links.tsx — a POINT card file, which
   * is why a census built from story-card filenames missed it twice. It renders story text
   * inside the profile point card's story expander and in live sessions, and it called
   * `stripHashtags` alone: the label reached the screen with no quote block under it, the
   * exact §1 defect, verified in a browser at /p/machine-yann-lecun before the fix.
   *
   * `excerpt`, not `card`: it is a compact quotation of a story inside another card. It
   * shows author, text and image; mounting a video player there was never the intent, so
   * the StoryMedia assertion below would be demanding the wrong thing.
   *
   * The feed point card (§5) renders THIS component rather than its own preview, so it
   * inherits the fix and is deliberately not a separate row — a second excerpt renderer
   * would be the ninth surface.
   */
  { name: 'QuotedStory (point-card expander)', file: 'app/components/social/point-card-with-links.tsx', policy: 'suppresses label', media: 'excerpt' },
];

describe('P1212 DW-7 — label and bodies are the same condition on every surface', () => {
  it('every surface file in the census exists (a rename must break loudly)', () => {
    for (const surface of SURFACES) {
      expect(() => read(surface.file), `${surface.name} — ${surface.file}`).not.toThrow();
    }
  });

  it.each(SURFACES)('$name either renders the quote block or strips the label', ({ file, policy }) => {
    const source = read(file);
    if (policy === 'renders quotes') {
      expect(source).toContain('StoryVideoQuotes');
    } else {
      // `storyTextForDisplay` is the ONLY accepted spelling — see the behavioural test
      // below for why a bare `stripQuoteLabel` is not enough.
      expect(source).toContain('storyTextForDisplay');
    }
  });

  /**
   * THE ASSERTION ABOVE IS A GREP, AND A GREP IS WHAT LET THE DEFECT SHIP.
   *
   * The first implementation of §1 satisfied it on all five "suppresses label" surfaces
   * and still printed the label on four of them, live in a browser. Every surface called
   * `stripQuoteLabel(stripHashtags(content, tags))` — inner first — and `stripHashtags`
   * collapses newlines to spaces, so by the time `stripQuoteLabel` ran, its anchored
   * `/^…$/m` had no line to match. Measured on the four live agent stories, the composed
   * call was byte-identical to not calling it at all. 3533 unit tests passed.
   *
   * So this asserts the OUTCOME on the real stored content shape — prose, blank line,
   * label on its own line, blank line, quote bodies — which is what the pipeline writes
   * and what a grep can never check. It fails if the order is ever inverted again, if the
   * label regex stops matching the stored shape, or if a surface stops calling the helper.
   */
  const STORED_SHAPE = [
    'The blocker is not size but who holds the data.',
    '',
    'Supporting quotes from Yann LeCun',
    '',
    '"we\'re not going to be no private company as big as it can do this by itself." — 14:36',
  ].join('\n');

  it('the display helper actually removes the label from the real stored content shape', () => {
    const shown = storyTextForDisplay(STORED_SHAPE, ['aisafety1']);

    expect(shown).not.toContain(QUOTE_LABEL_PREFIX);
    // The prose and the quote bodies both survive — this strips a heading, not content.
    expect(shown).toContain('The blocker is not size but who holds the data.');
    expect(shown).toContain('as big as it can do this by itself');
  });

  it('the inverted composition is a no-op — the regression this pins', () => {
    // Documents the exact failure, so the next author sees why the order is load-bearing
    // rather than reading `storyTextForDisplay` as a cosmetic wrapper.
    const inverted = stripQuoteLabel(stripHashtags(STORED_SHAPE, ['aisafety1']));
    expect(inverted).toContain(QUOTE_LABEL_PREFIX);
    expect(inverted).toBe(stripHashtags(STORED_SHAPE, ['aisafety1']));
  });

  // The half a policy table cannot state: no surface may print the label out of `content`.
  // StoryVideoQuotes owns the heading string; a second literal anywhere in a surface file
  // is the same-page duplicate §1 deletes, re-introduced.
  it.each(SURFACES)('$name does not carry its own copy of the label string', ({ file }) => {
    expect(read(file)).not.toContain(QUOTE_LABEL_PREFIX);
  });

  // DW-4. The profile card handled `imageUrl` itself and never imported StoryMedia, so a
  // shared profile — the link most likely to reach someone who has never seen the site —
  // showed no video at all.
  it.each(SURFACES.filter(s => s.media === 'card'))(
    '$name renders media through StoryMedia, not a private image path',
    ({ file }) => {
      expect(read(file)).toContain('StoryMedia');
    }
  );
});

// ---------------------------------------------------------------------------
// DW-6 — the sealed letter. Render tests, because the claim is about what a reader
// sees on a snapshot that cannot be re-filed.
// ---------------------------------------------------------------------------

const QUOTE = 'the models are not reasoning, they are interpolating';
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function sealedStory(content: string) {
  const snapshot = docStoryToSnapshot({
    story_id: 's1',
    position: 0,
    story: {
      id: 's1',
      content,
      title: '',
      imageUrl: '',
      videoUrl: VIDEO,
      videoQuotes: { quotes: [{ text: QUOTE, seconds: 42 }], durationSeconds: 300 },
      points: [],
    },
    point_config: {},
  } as never);
  // The letter path derives the byline from the SENDER — the assumption story-walk.tsx
  // states in a comment and §4b flags. Passing a human sender here is the realistic case.
  return snapshotToStoryWithPoints(snapshot as never, { name: 'Jane Doe' } as never);
}

function renderCard(content: string) {
  return render(
    <MemoryRouter>
      <LiveStoryCardExpanded story={sealedStory(content)} readOnly defaultStoryExpanded />
    </MemoryRouter>
  );
}

/** Count non-overlapping occurrences of the quote body in the rendered text. */
function quoteOccurrences(): number {
  const text = document.body.textContent ?? '';
  return text.split(QUOTE).length - 1;
}

describe('P1212 DW-6 — a letter sealed BEFORE §1 renders its quotes exactly once', () => {
  // The seal RPC freezes storyText AND videoQuotes independently
  // (20260823120100_p1141_seal_rpc_video_fields.sql:102,105), so a pre-§1 letter carries
  // the bodies twice. Snapshots are immutable: re-filing the story repairs nothing, and
  // adding the quote block unconditionally would show every existing letter its quotes
  // twice — the precise defect §1 exists to delete.
  it('the legacy shape (bodies inline in the frozen text) renders them once, not twice', () => {
    renderCard(`${QUOTE_LABEL_PREFIX} Yann LeCun\n"${QUOTE}"`);
    expect(quoteOccurrences()).toBe(1);
    expect(screen.queryByTestId('story-video-quotes')).toBeNull();
  });

  it('the legacy shape keeps its frozen label — it still has bodies under it', () => {
    renderCard(`${QUOTE_LABEL_PREFIX} Yann LeCun\n"${QUOTE}"`);
    expect(document.body.textContent).toContain(QUOTE_LABEL_PREFIX);
  });

  // DW-2, from the reader's side rather than the source's: after §1 the bodies are gone
  // from `content` and the block is the only thing that can show them.
  it('the post-§1 shape (label only, bodies in video_quotes) renders the block, once', () => {
    renderCard(`${QUOTE_LABEL_PREFIX} Yann LeCun`);
    expect(screen.getByTestId('story-video-quotes')).toBeTruthy();
    expect(quoteOccurrences()).toBe(1);
    // Exactly one heading: the body's copy is stripped, the block supplies its own.
    const headings = (document.body.textContent ?? '').split(QUOTE_LABEL_PREFIX).length - 1;
    expect(headings).toBe(1);
  });

  it('a timecode is shown, and it is a control rather than a label', () => {
    renderCard(`${QUOTE_LABEL_PREFIX} Yann LeCun`);
    expect(screen.getByTestId('story-video-quote-timecode')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// §4b — the disclosure contract on the surface that is actually sent to someone.
// ---------------------------------------------------------------------------

vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({
      isAgentAccountId: (id?: string | null) => id === 'agent-1',
      operatorNameFor: () => 'ClarityPledge',
      isLoading: false,
    }),
  };
});

function renderAgentLetter() {
  const story = sealedStory(`${QUOTE_LABEL_PREFIX} Yann LeCun`);
  return render(
    <MemoryRouter>
      <LiveStoryCardExpanded
        story={{ ...story, authorId: 'agent-1', authorName: 'Agent · Yann LeCun' }}
        readOnly
        defaultStoryExpanded
      />
    </MemoryRouter>
  );
}

/**
 * GATED PENDING A FOUNDER DECISION — not because these tests are wrong.
 *
 * Every assertion in this block requires the sealed-letter snapshot to carry the STORY
 * AUTHOR's identity. It does not: the seal RPC stores no story-author id and the mapper
 * sets `authorId: ''`, taking `authorName` from the SENDER. So agent-ness cannot be
 * derived on this surface today, and a byline derived from the name it does carry would
 * brand a human sender as a machine.
 *
 * The spec puts the fix to the founder and names both branches: add author id + agent
 * flag to the snapshot contract now, or restrict §4b on this surface to quotes + media
 * and file the byline separately. This merge takes NEITHER — the implementation renders
 * quotes and media on sealed letters and withholds the byline, which is safe under both
 * branches and pre-commits neither.
 *
 * UN-GATE when the founder picks branch 1, together with the snapshot field and its
 * migration. These assertions are the acceptance criteria for that branch, written before
 * the decision so they cannot be shaped by it.
 */
describe.skip('P1212 §4b — the letter surface carries the agent contract [BLOCKED: founder decision]', () => {
  it('renders the byline component, not the raw stored name', () => {
    renderAgentLetter();
    expect(screen.getByTestId('agent-byline')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Agent ·');
  });

  it('carries the machine chip — on story surfaces the drained-chrome class is absent, so the chip is the signal', () => {
    renderAgentLetter();
    expect(screen.getAllByTestId('machine-chip').length).toBeGreaterThan(0);
  });

  it('carries the footer, with the /machines link', () => {
    renderAgentLetter();
    expect(screen.getByTestId('agent-story-footer')).toBeTruthy();
    expect(screen.getByTestId('agent-story-footer-link').getAttribute('href')).toBe('/machines');
  });

  // The disclosure must not make a claim about a page it is not on. Level 3 of the
  // contract says "except the quotes"; on a surface showing no quote block that clause
  // points at nothing.
  it('the "except the quotes" clause appears only when a quote block actually renders', () => {
    renderAgentLetter();
    expect(screen.getByTestId('agent-story-footer').textContent).toContain('except the quotes');
  });

  it('an agent letter shows no ear count — a machine account holds no reputation', () => {
    renderAgentLetter();
    expect(screen.queryByTestId('ear-badge')).toBeNull();
  });
});
