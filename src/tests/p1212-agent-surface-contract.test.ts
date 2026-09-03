/**
 * @file p1212-agent-surface-contract.test.ts
 * @description P1212 canaries — RED ON PURPOSE. Each assertion here fails against
 * the tree as it stands on 2026-09-01 and turns green when the matching section of
 * P1212 ships. Nothing in this file is a passing regression guard yet; do not
 * "fix the test".
 *
 * Filed from the second adversarial review of the P1212 spec. Every defect below
 * was found by reading the artifact, not the spec's description of it — two of the
 * three contradict claims the spec's own first draft made.
 *
 * WHY SOURCE-CONTRACT ASSERTIONS AND NOT RENDER TESTS. Two of the three components
 * are private (`LinkedStoryCard` is a module-local function inside
 * StoryCardDetail.tsx; `StoryCardFull` likewise inside profile-page-v2.tsx), so
 * there is nothing to import and render. The repo already uses this shape for
 * exactly that reason — see p1141-letter-snapshot-contract.test.ts and
 * p1060-source-contract.test.ts. A source-contract test cannot prove a component
 * renders correctly; it CAN prove a component never reaches the code that would
 * make it correct, which is the whole defect class here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';

import { join } from 'node:path';
import { docStoryToSnapshot, snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import { AgentByline } from '@/app/components/shared/agent-byline';

const SRC = join(__dirname, '..');

/**
 * STRIP COMMENTS BEFORE MATCHING — this is not tidiness, it is the difference between
 * a test and a decoration.
 *
 * Found the hard way on 2026-09-03, implementing this spec. The fix for §4d and §4b was
 * written with a comment explaining WHY each card delegates to `AgentByline` — and those
 * comments named `MachineChip`. Both `toContain('MachineChip')` assertions went green on
 * the prose alone, while neither component referenced the chip in code at all. Nine of
 * nine passed. A source-contract test that reads comments is a grep for its own
 * documentation: it turns green exactly when someone writes about the fix, which is the
 * one moment it most needs to stay red.
 *
 * Every assertion in this file greps a component for a symbol, so every one of them was
 * exposed to this. The read helper strips comments once, here, rather than leaving each
 * assertion to remember.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments, including JSX {/* … */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments, sparing the // in URLs
}

const read = (...p: string[]) => codeOnly(readFileSync(join(SRC, ...p), 'utf8'));

const STORY_CARD_DETAIL = read('app', 'components', 'social', 'StoryCardDetail.tsx');
const LIVE_CARD = read('app', 'components', 'partners', 'live-story-card-expanded.tsx');
const PROFILE_PAGE = read('app', 'pages', 'profile-page-v2.tsx');

/**
 * RED CANARIES ARE SKIP-GATED, DELIBERATELY — and this is the weakest part of this file.
 *
 * They were written, RUN UNSKIPPED, and observed to fail on 2026-09-01: 7 failed, 2 passed
 * (the two passing ones are the `(premise, passes today)` controls, which exist so a green
 * run cannot mean "the probe found nothing because the probe is blind"). Only after that
 * were they gated. epistemic.md gate 7 is satisfied by that run, not by this comment.
 *
 * WHY GATED: P1212 is at create-spec, not /dev, and its §1 is blocked on a concurrent
 * session holding story-draft.md. Left red, this file fails pre-commit-checks.sh on the
 * SHARED main checkout and blocks every other session's unrelated commits for as long as
 * that block lasts.
 *
 * THE COST: a skipped canary is a canary nobody watches. Un-gate it — `const redCanary = it;`
 * — as step one of /dev on P1212, before writing any implementation. Each assertion below
 * names the section it belongs to.
 */
const redCanary = it;

/** Slice out one module-local function so an assertion cannot be satisfied by an
 *  unrelated part of a 900-line file — the failure mode a whole-file grep has. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found — it was renamed or removed; update this test deliberately`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

// ---------------------------------------------------------------------------
// §4d — the seventh surface. Spec claimed six, built by "reading data flow".
// ---------------------------------------------------------------------------

describe('P1212 §4d — LinkedStoryCard must not leak the stored `Agent · ` prefix', () => {
  const body = functionBody(STORY_CARD_DETAIL, 'LinkedStoryCard');

  // The defect agent-byline.tsx:39-41 records as fixed everywhere else: "the feed said
  // `Machine reading of X` while the profile header and every stance row said `Agent · X`,
  // the raw stored name. Same account, two identities, decided by which file a reader
  // happened to be looking at." One file was missed, and §5 makes it more reachable.
  redCanary('renders the agent name through AgentByline or stripAgentPrefix, never raw', () => {
    expect(body).toMatch(/AgentByline|stripAgentPrefix/);
  });

  /**
   * REWRITTEN 2026-09-03, during /dev. The original assertion was
   * `expect(body).toContain('MachineChip')`, and it was wrong in two ways that only
   * showed up once the fix existed.
   *
   * It asserted the wrong SHAPE. `AgentByline` renders the chip itself — it is "the one
   * place an agent account is named" and the chip is the first thing in it. A card that
   * delegates to `AgentByline` therefore carries the chip while containing no such token,
   * and a card that satisfied the original assertion literally would have to render a
   * SECOND chip beside the byline's. The assertion demanded the defect.
   *
   * And it was satisfiable by prose — see `codeOnly` above.
   *
   * What the requirement actually is: the reader sees the machine marker on this card.
   * That is delivered by composition, so it is pinned as composition — the card delegates
   * to `AgentByline` (asserted above), and `AgentByline` puts a chip on screen (asserted
   * here, by rendering it rather than by grepping it). Break either link and this fails,
   * which is more than the token grep ever checked.
   */
  redCanary('carries the machine chip — the drained card alone is not the disclosure contract', () => {
    cleanup();
    render(createElement(AgentByline, { name: 'Agent · Yann LeCun' }));
    expect(screen.getByTestId('machine-chip')).toBeTruthy();
    expect(screen.getByTestId('agent-byline-name').textContent).toBe('Yann LeCun');
  });

  // Guards the premise of the two assertions above: this card DOES know it is an agent.
  // If this ever fails, the defect is bigger than a missing byline and the fix differs.
  it('(premise, passes today) already detects agent accounts and drains the card', () => {
    expect(body).toContain('isAgentAccountId');
    expect(body).toContain('agent-card-drained');
  });
});

// ---------------------------------------------------------------------------
// §4b — the surface that is actually sent to another person.
// ---------------------------------------------------------------------------

describe('P1212 §4b — the live / sealed-letter card carries the agent contract', () => {
  redCanary('renders the quote block — §1 moves quote bodies here out of story.content', () => {
    expect(LIVE_CARD).toMatch(/<StoryVideoQuotes[\s/>]/);
  });

  redCanary('renders video, not image only — StoryMedia picks video over image', () => {
    expect(LIVE_CARD).toMatch(/<StoryMedia[\s/>]/);
  });

  // `MachineChip` dropped from this list for the reason given at length in §4d above:
  // it arrives with `AgentByline`, and a card naming both would render two chips.
  redCanary('carries the byline and footer on the surface with the least surrounding signal', () => {
    expect(LIVE_CARD).toMatch(/<AgentByline[\s/>]/);
    expect(LIVE_CARD).toMatch(/<AgentStoryFooter[\s/>]/);
  });

  /**
   * The constraint §4b names and the spec's own risk table calls out: on a sealed letter
   * `authorName` is the SENDER's name, because the seal RPC stores no story-author
   * identity and the mapper sets `authorId: ''`. A byline derived from that name would
   * put a machine marker on a human — false attribution on the surface actually sent to
   * another person. Agent-ness must come from the id.
   */
  redCanary('derives agent-ness from the author id, never from the mapped author name', () => {
    expect(LIVE_CARD).toMatch(/isAgentAccountId\(\s*story\.authorId\s*\)/);
  });

  // The ordering constraint §4b states, expressed as a test. §1 removes the inline
  // quote bodies from content; if this surface still cannot read video_quotes at that
  // point, every letter through it shows the label with nothing beneath it.
  redCanary('renders quotes BEFORE §1 removes them from content — ordering, not a follow-up', () => {
    expect(LIVE_CARD).toMatch(/<StoryVideoQuotes[\s/>]/);
  });
});

// ---------------------------------------------------------------------------
// §4b legacy — the duplication §4b's own fix resurrects on sealed letters.
// ---------------------------------------------------------------------------

describe('P1212 §4b legacy — a letter sealed before §1 must not render its quotes twice', () => {
  const QUOTE = 'the models are not reasoning, they are interpolating';

  /** A story shaped the way the pipeline files them TODAY: quote bodies inline in
   *  content AND the same quotes in video_quotes. This is the pre-§1 state that
   *  every already-sealed letter has frozen into its snapshot. */
  const preS1Story = {
    story_id: 's1',
    position: 0,
    story: {
      id: 's1',
      content: `Supporting quotes from Yann LeCun\n"${QUOTE}"`,
      title: '',
      imageUrl: '',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoQuotes: { quotes: [{ text: QUOTE, seconds: 42 }], durationSeconds: 300 },
      points: [],
    },
    point_config: {},
  };

  // Characterization, passes today. This is the hazard, stated as a fact rather than
  // as prose: the seal freezes BOTH copies, so the duplication is baked into every
  // existing snapshot and cannot be repaired by re-filing the story.
  // Mirrors the RPC at supabase/migrations/20260823120100_p1141_seal_rpc_video_fields.sql:102,105.
  it('(premise, passes today) the snapshot freezes the quote text in BOTH storyText and videoQuotes', () => {
    const snap = docStoryToSnapshot(preS1Story as never);
    const config = snap.point_config as { storyText: string; videoQuotes: { quotes: { text: string }[] } };

    expect(config.storyText).toContain(QUOTE);
    expect(config.videoQuotes.quotes[0].text).toBe(QUOTE);

    const mapped = snapshotToStoryWithPoints(snap as never, { name: 'Jane Doe' } as never);
    expect(mapped.content).toContain(QUOTE);
    expect(mapped.videoQuotes?.quotes[0].text).toBe(QUOTE);
  });

  // RED. The moment §4b adds StoryVideoQuotes to the live card, this snapshot renders
  // the quote inline (frozen storyText) AND in the new block (frozen videoQuotes).
  // Snapshots are immutable, so the branch must live in the renderer.
  redCanary('the live card branches on legacy snapshots whose content already holds the quotes', () => {
    expect(LIVE_CARD).toMatch(/quotesInContent|legacySnapshot|quotesAlreadyInContent/);
  });
});

// ---------------------------------------------------------------------------
// §4 — media renders wherever a story renders. The profile was the miss.
// ---------------------------------------------------------------------------

describe('P1212 §4 — the profile card renders video, not image only', () => {
  const body = functionBody(PROFILE_PAGE, 'StoryCardFull');

  /**
   * "If I send a profile of Yann LeCun to somebody, it should render the full card that we
   * have, like with the video and the timestamps" — founder, 2026-09-01.
   *
   * `StoryCardFull` is private to profile-page-v2.tsx and predates P1141, so the sweep
   * that put `StoryMedia` on the feed, the point-detail card and the story detail never
   * reached it. The spec's first draft missed this surface for a reason worth keeping in
   * view: the census was built by grepping the component name `StoryMedia`, which by
   * construction cannot find a surface that inlines its own markup instead.
   */
  redCanary('renders StoryMedia so a shared agent profile shows the video', () => {
    expect(body).toMatch(/<StoryMedia[\s/>]/);
  });

  /**
   * The image path must survive. `StoryMedia` falls back to `StoryImage` through
   * `imageProps`, so a story with no parseable video renders exactly what it rendered
   * before — "renders exactly as it does today" satisfied by construction rather than by
   * matching behaviour.
   */
  redCanary('keeps the image path wired through imageProps rather than dropping it', () => {
    expect(body).toContain('imageProps');
  });

  /**
   * The EDIT branch keeps `StoryImage` deliberately — it owns upload and delete of
   * `image_url`, which is an image control, not a media renderer. If this ever fails,
   * someone replaced the editor's image controls with a read-only media renderer.
   */
  it('(premise, passes today) the edit branch still owns image upload/delete', () => {
    expect(body).toContain('StoryImage');
    expect(body).toContain('handleChangeImage');
  });
});
