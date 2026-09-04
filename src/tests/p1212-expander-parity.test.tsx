/**
 * @file p1212-expander-parity.test.tsx
 * @description P1212 §5 — the point<->story link renders the same affordance on every
 * surface that shows it, in both directions.
 *
 * WHAT §5 IS ACTUALLY ABOUT. Before this section the link rendered four different ways:
 * profile point cards and the point detail page had a chevron + count expander; feed point
 * cards had no route to the linked stories at all; feed story cards had a static count
 * with nothing behind it. Same relation, four presentations, decided by which page a
 * reader happened to be on — the drift this whole spec exists to close.
 *
 * WHY THESE ARE RENDER TESTS AND NOT A SOURCE-CONTRACT SWEEP. The rest of P1212 uses
 * source greps because four of its seven surfaces are module-private functions that
 * cannot be imported. Both §5 surfaces are exported components taking plain props, so
 * there is nothing stopping a real render — and P1212's own history is the argument for
 * preferring one: §1's parity test asserted the TOKEN `stripQuoteLabel` appeared in each
 * file, passed on all five surfaces, and the label was still on screen on four of them.
 * A grep proves a symbol is present; only a render proves a reader sees the right thing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { linkKeyFor, linksFor } from '@/lib/linked-content';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import { QUOTE_LABEL_PREFIX } from '@/lib/story-quotes';
import type { StoryWithAuthor, PointSummary } from '@/app/types';

/**
 * Agent-ness comes from the REGISTRY, never from the name — the §4b rule that keeps a
 * machine marker off a human's byline on the sealed-letter surface. So a test that wants
 * the agent branch has to say so through the registry; passing a name that merely looks
 * like an agent's must NOT flip it, and the un-mocked default below is what proves that.
 */
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

/** FeedPointCard reads the session for its position buttons; the expander does not
 *  depend on auth, so an anonymous viewer is the right default here. */
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' }, isLoading: false }),
}));

/**
 * The position write path. Asserting the SERVICE call rather than a parent callback is
 * deliberate: the defect was that no callback existed, so a test written against a
 * callback prop would have had nothing to bind to.
 */
const setPosition = vi.fn().mockResolvedValue(undefined);
vi.mock('@/app/data/points-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/data/points-service')>();
  return {
    ...actual,
    pointsService: { ...actual.pointsService, setPosition: (...a: unknown[]) => setPosition(...a) },
  };
});

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

/**
 * ENRICHED 2026-09-04. The previous fixture carried only id/statement/tags/visibility and the
 * suite mocked an anonymous viewer — so it rendered, and certified, a card with ZERO interactive
 * controls while the profile rendered three. Adversarial review counted them: profile 3, feed 0.
 * A parity fixture that cannot express the fields under test cannot detect their absence.
 */
const POINTS: PointSummary[] = [
  {
    id: 'pt-1',
    statement: 'Concentration of AI capability is a governance problem, not a safety one.',
    tags: [],
    systemTags: [],
    visibility: 'public',
    positionCounts: { agree: 2, disagree: 1 },
    userPosition: null,
  },
  {
    id: 'pt-2',
    statement: 'Open weights do more against concentration than regulation will.',
    tags: [],
    systemTags: [],
    visibility: 'public',
    positionCounts: { agree: 1 },
    userPosition: null,
  },
] as PointSummary[];

function makeStory(overrides: Partial<StoryWithAuthor> = {}): StoryWithAuthor {
  return {
    id: 'story-1',
    authorId: 'author-1',
    content: 'A model holding all human knowledge would have to be fine-tuned locally.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    tags: [],
    systemTags: [],
    authorName: 'Yann LeCun',
    authorSlug: 'yann-lecun',
    ...overrides,
  };
}

function renderFeedStoryCard(props: Partial<Parameters<typeof FeedStoryCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FeedStoryCard story={makeStory()} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockClear();
  cleanup();
});

describe('P1212 §5 — feed story card: linked-point expander', () => {
  /**
   * The three-state prop is the part worth pinning. `undefined` is "the batch query has
   * not resolved", and it must render NOTHING — a card that prints "0 points" while its
   * links are still in flight is stating a falsehood about the story rather than a fact
   * about the fetch, and the reader has no way to tell the two apart.
   */
  it('renders no footer at all while the links are still loading', () => {
    renderFeedStoryCard({ linkedPoints: undefined });
    expect(screen.queryByTestId('feed-story-point-expander')).toBeNull();
    expect(screen.queryByText(/points?$/)).toBeNull();
  });

  it('renders "0 points" once loaded with none linked — loaded-and-empty is not loading', () => {
    renderFeedStoryCard({ linkedPoints: [] });
    expect(screen.getByText('0 points')).toBeTruthy();
    expect(screen.queryByTestId('feed-story-point-expander')).toBeNull();
  });

  it('renders a collapsed expander with the count, matching the profile card affordance', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    const expander = screen.getByTestId('feed-story-point-expander');
    expect(expander.textContent).toContain('2 points');
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    // Collapsed means collapsed — the statements must not be in the DOM yet.
    expect(screen.queryByText(POINTS[0]!.statement)).toBeNull();
  });

  /**
   * THE ASSERTION THE FOUNDER'S EYE MADE AND THIS FILE DID NOT — added 2026-09-04.
   *
   * Everything above pins the TRIGGER (chevron, count, aria-expanded) and that the
   * statement TEXT appears once expanded. All of it passed while the feed rendered each
   * linked point as a bare `<button>` of plain text — no card, no author, no affordance
   * until hover — beside a profile surface rendering the same relation as a full quoted
   * card, and a feed POINT card rendering ITS linked stories as `QuotedStory` cards.
   * Screenshot 2026-09-04: "weird this is not consistent with rest?".
   *
   * `getByText(statement)` cannot separate those two renderings; both put the text on
   * screen. So the assertion has to name the COMPONENT, not the string. `quoted-point-card`
   * is emitted only by the shared component both surfaces now render through, which makes
   * "same component" structurally true rather than asserted in prose.
   */
  it('expands to quoted-point CARDS, not bare text — one per linked point', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));

    const cards = screen.getAllByTestId('quoted-point-card');
    expect(
      cards.length,
      'the feed must render each linked point through the SHARED QuotedPointCard the profile uses — bare text passes every other assertion in this file',
    ).toBe(POINTS.length);

    // And the statement must live INSIDE that card, not merely somewhere on the page:
    // a card rendered empty beside loose text would satisfy the count alone.
    expect(cards.some((c) => c.textContent?.includes(POINTS[0]!.statement))).toBe(true);
    expect(cards.some((c) => c.textContent?.includes(POINTS[1]!.statement))).toBe(true);
  });

  /**
   * KEYBOARD, NOT MOUSE — added 2026-09-04 after adversarial review found this and the
   * committed test could not.
   *
   * The card above it stops CLICK propagation on its container, so a mouse click on a linked
   * point navigates once and every existing assertion passes. `keydown` is not stopped there,
   * and the outer story card handles the same key — so Tab to a point, press Enter, and the
   * app navigates twice and lands on the STORY, not the point. Keyboard users got a different
   * destination from mouse users, and `fireEvent.click` is structurally blind to it.
   */
  it('Enter on a linked point navigates ONCE, to the point — not on to the story', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));

    const card = screen.getAllByTestId('quoted-point-card')[0]!;
    // `querySelector`, NOT `closest`: the point's own control is a DESCENDANT of the
    // testid node. `closest` walks UP and finds the outer story card — a different control,
    // firing on which proves nothing about propagation. First draft of this test did that
    // and reported the fix as failing when it was working.
    const target = card.querySelector('[role="button"]') ?? card;
    fireEvent.keyDown(target, { key: 'Enter', code: 'Enter' });

    expect(navigate.mock.calls, `expected one navigation, got ${JSON.stringify(navigate.mock.calls)}`).toHaveLength(1);
    expect(navigate).toHaveBeenCalledWith(`/point/${POINTS[0]!.id}`);
  });

  it('Space behaves the same as Enter — one navigation, to the point', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));
    const card = screen.getAllByTestId('quoted-point-card')[0]!;
    // `querySelector`, NOT `closest`: the point's own control is a DESCENDANT of the
    // testid node. `closest` walks UP and finds the outer story card — a different control,
    // firing on which proves nothing about propagation. First draft of this test did that
    // and reported the fix as failing when it was working.
    const target = card.querySelector('[role="button"]') ?? card;
    fireEvent.keyDown(target, { key: ' ', code: 'Space' });
    expect(navigate.mock.calls).toHaveLength(1);
  });

  /**
   * THE CONTROL COUNT — added 2026-09-04. Adversarial review rendered both surfaces and
   * counted interactive controls inside the quoted card: profile 3, feed 0. The card was
   * shared, so the difference came entirely from what each surface FEEDS it — the feed's
   * query supplied no counts and no viewer position, and the card was handed no viewer.
   * Sharing a component is not parity if only one caller fills its props.
   */
  it('renders the point position controls, not a read-only slab', () => {
    renderFeedStoryCard({ linkedPoints: POINTS, currentUserId: 'viewer-1' });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));
    const card = screen.getAllByTestId('quoted-point-card')[0]!;
    const controls = card.querySelectorAll('button');
    // toBeGreaterThan(0) was the first form of this assertion and it was too weak: the
    // finding was "profile 3, feed 0", and >0 passes at 1 — so a regression dropping two of
    // the three controls, or one supplying positionCounts without userPosition, stayed
    // green. Pin the number the review actually measured.
    expect(
      controls.length,
      'the feed card must offer the same THREE position controls the profile does — 0 means the surface fed it nothing, and 1 or 2 means it fed it half',
    ).toBe(3);
  });

  /**
   * DEAD CONTROLS — found 2026-09-04 by an adversarial review, AFTER the count assertion
   * above was written and green. Rendering the buttons was never the claim; recording a
   * position is.
   *
   * `handlePositionClick` in quoted-point-card.tsx sets optimistic local state and THEN
   * calls `onPositionSelect?.()`. The profile passes that prop; the feed did not. So the
   * button lit up, the count incremented, and nothing was written — the position was gone
   * on the next load. That is worse than the read-only slab this section replaced, because
   * a slab does not claim a position was recorded.
   *
   * The count test above cannot catch it: a control that persists nothing renders exactly
   * like one that does.
   */
  it('a position click on the feed PERSISTS, it does not just light up the button', async () => {
    setPosition.mockClear();
    renderFeedStoryCard({ linkedPoints: POINTS, currentUserId: 'viewer-1' });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));

    const card = screen.getAllByTestId('quoted-point-card')[0]!;
    const agree = [...card.querySelectorAll('button')].find(
      b => /agree/i.test(b.textContent ?? '') && !/disagree/i.test(b.textContent ?? ''),
    );
    expect(agree, 'the fixture must expose an Agree control to click').toBeTruthy();

    fireEvent.click(agree!);

    await vi.waitFor(() => {
      expect(
        setPosition.mock.calls.length,
        'clicking Agree on the feed must reach pointsService.setPosition — an optimistic highlight that writes nothing is a dead control',
      ).toBe(1);
    });
    expect(setPosition.mock.calls[0]?.[0]).toBe('pt-1');
    expect(setPosition.mock.calls[0]?.[2]).toBe('agree');
  });

  /**
   * KEYBOARD — found by the same review. The card root is `role="button"` with an
   * `onKeyDown` that calls `preventDefault()` on Enter/Space and navigates, and it does not
   * check the event TARGET. So a keydown on any control inside the card bubbles to the
   * root, gets its default activation cancelled, and navigates instead.
   *
   * For the expander that means: Tab to "2 points", press Enter, and instead of expanding
   * you are thrown to the story detail page. The `role="presentation"` wrapper around the
   * footer stops `onClick` only, so the mouse path was fine and the keyboard path was not —
   * which is exactly why a click-only test suite certified this.
   *
   * This is the same class the branch already fixed INSIDE QuotedPointCard by adding
   * stopPropagation to its own onKeyDown. Fixing it per-control is a treadmill; the root
   * guard fixes every control the card will ever contain.
   */
  /**
   * THE SAME ROOT BUG, ON THE CONTROL §4 ADDED. Found by the same review, after the
   * expander case above was fixed — which is the argument for the root-level guard rather
   * than a per-control one. With no `onSeek`, each timecode renders as an `<a target=
   * "_blank">` opening the source at that second. The `role="presentation"` wrapper stops
   * onClick, so the mouse path opens the video; the keydown path reached the root, had the
   * anchor's activation cancelled, and navigated to the story instead.
   *
   * §4's own stated rule is "timecodes only where clicking works". For a keyboard reader
   * clicking did not work on ANY of the three surfaces §4 put quotes on.
   */
  /**
   * THE SAME DRIFT, IN THE ACCESSIBILITY LAYER — found 2026-09-04 by the UI review, after
   * the visual parity work was done.
   *
   * The profile's story card root carries `aria-label={`Story by ${author.name}`}`
   * (profile-page-v2.tsx:1363). The feed's did not. A `role="button"` with no accessible
   * name takes it from its subtree, so the SAME story announced as a cleanly named control
   * on the profile and as one button whose name is the concatenation of the story text, the
   * counts, the expander label and — once §5 landed — the entire quoted point list on the
   * feed. §4 and §5 are what put those anchors and buttons inside the root, so the branch
   * made the concatenation longer.
   *
   * The raw `authorName` is used deliberately, matching the profile: for an agent account it
   * is `Agent · {Name}`, so a screen-reader user hears the marker. Stripping the prefix here
   * would delete the disclosure from the one channel that has no chip and no drained card.
   *
   * This does NOT fix the nested-widget structure (role="button" inside role="button"),
   * which needs the outer card to stop being a widget and is its own spec.
   */
  it('the card root has an accessible name, so it is not announced as its whole subtree', () => {
    renderFeedStoryCard({ linkedPoints: POINTS, currentUserId: 'viewer-1' });
    const root = document.querySelector('[role="button"][tabindex="0"]');
    expect(root, 'the card root must exist').toBeTruthy();
    expect(
      root!.getAttribute('aria-label'),
      'the feed card must name itself the way the profile card does — without it a screen reader reads the entire subtree as the control name',
    ).toBe('Story by Yann LeCun');
  });

  /** The agent case: the marker must survive into the accessible name. */
  it('an agent story keeps its marker in the accessible name', () => {
    render(
      <MemoryRouter>
        <FeedStoryCard story={makeStory({ authorId: 'agent-1', authorName: 'Agent · Yann LeCun' })} />
      </MemoryRouter>
    );
    const root = document.querySelector('[role="button"][tabindex="0"]');
    expect(root!.getAttribute('aria-label')).toContain('Agent ·');
  });

  it('Enter on a quote timecode does NOT navigate to the story', () => {
    navigate.mockClear();
    render(
      <MemoryRouter>
        <FeedStoryCard
          story={makeStory({
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            videoQuotes: { quotes: [{ text: 'they are interpolating', seconds: 134 }], durationSeconds: 300 },
          } as Partial<StoryWithAuthor>)}
        />
      </MemoryRouter>
    );

    const timecode = document.querySelector('a[href*="dQw4w9WgXcQ"]');
    expect(timecode, 'the fixture must render a timecode link to press Enter on').toBeTruthy();

    fireEvent.keyDown(timecode!, { key: 'Enter' });

    expect(
      navigate.mock.calls,
      'Enter on a timecode must open the source, not cancel the anchor and navigate to the story',
    ).toHaveLength(0);
  });

  it('Enter on the expander expands it, and does NOT navigate away', () => {
    navigate.mockClear();
    renderFeedStoryCard({ linkedPoints: POINTS });
    const expander = screen.getByTestId('feed-story-point-expander');

    fireEvent.keyDown(expander, { key: 'Enter' });

    expect(
      navigate.mock.calls,
      'a keydown on a control INSIDE the card must not reach the card root and navigate',
    ).toHaveLength(0);
  });

  it('singularises the count — "1 point", not "1 points"', () => {
    renderFeedStoryCard({ linkedPoints: [POINTS[0]!] });
    expect(screen.getByTestId('feed-story-point-expander').textContent).toContain('1 point');
    expect(screen.getByTestId('feed-story-point-expander').textContent).not.toContain('1 points');
  });

  it('expands in place to the point statements, and flips aria-expanded', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));

    expect(screen.getByTestId('feed-story-point-expander').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(POINTS[0]!.statement)).toBeTruthy();
    expect(screen.getByText(POINTS[1]!.statement)).toBeTruthy();
  });

  it('navigates to the point, not the story, when a linked point is clicked', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));
    fireEvent.click(screen.getByText(POINTS[1]!.statement));

    expect(navigate).toHaveBeenCalledWith('/point/pt-2');
  });

  /**
   * §5 must not re-open §1. The feed story card is a `suppresses label` surface: it
   * renders no quote block, so the stored label must never reach the screen — including
   * once the new footer is on the card.
   */
  it('still suppresses the quote label after §5 adds the footer', () => {
    renderFeedStoryCard({
      linkedPoints: POINTS,
      story: makeStory({
        content: `The blocker is not size.\n\n${QUOTE_LABEL_PREFIX} Yann LeCun\n\n"a quote" — 14:36`,
      }),
    });
    expect(document.body.textContent).not.toContain(QUOTE_LABEL_PREFIX);
    expect(document.body.textContent).toContain('The blocker is not size.');
  });
});

// ---------------------------------------------------------------------------
// The eighth surface. Found while implementing §5, fixed here, and pinned by a RENDER
// test rather than a census row — because the census row does not work.
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS NOT A CENSUS ROW IN p1212-quote-label-parity.test.tsx.
 *
 * It was, first. The census's `suppresses label` policy asserts the file contains
 * `storyTextForDisplay` — and when the fix below was reverted to the leaking
 * `stripHashtags` call, the suite still reported 27 passed, because the IMPORT of
 * `storyTextForDisplay` survived the revert and the grep matched that. The row was
 * decorative: it could not distinguish the fixed component from the broken one.
 *
 * That is the same defect §1 shipped with, one layer up — a source grep proving a symbol
 * is present rather than used. `QuotedStory` was made exportable by §5 (the feed point
 * card renders it), so unlike the four module-private surfaces there is no reason to
 * settle for a grep here.
 */
describe('P1212 §1 (eighth surface) — QuotedStory suppresses the quote label', () => {
  const LABEL_STORY = {
    id: 'qs-1',
    authorId: 'author-1',
    text: `The blocker is not size.\n\n${QUOTE_LABEL_PREFIX} Yann LeCun\n\n"a quote" — 14:36`,
    createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public' as const,
    linkedPointIds: [],
    understoodCount: 0,
  };

  function renderQuoted() {
    return render(
      <MemoryRouter>
        <QuotedStory story={LABEL_STORY} onClick={() => {}} />
      </MemoryRouter>
    );
  }

  it('does not print the label — it renders no quote block, so it must show no heading', () => {
    renderQuoted();
    expect(document.body.textContent).not.toContain(QUOTE_LABEL_PREFIX);
  });

  it('keeps the prose and the quote body — this strips a heading, not content', () => {
    renderQuoted();
    expect(document.body.textContent).toContain('The blocker is not size.');
    expect(document.body.textContent).toContain('a quote');
  });

  /**
   * §4 ON THE EIGHTH SURFACE — found 2026-09-04 by an adversarial review, after the two
   * tests above were written and green.
   *
   * They pin that the LABEL is suppressed here. Nothing pinned that the quotes it labels
   * are rendered instead. `QuotedStory` called `StoryImage` alone, so a story whose only
   * media is a video showed no media at all, and no quote block — the reader got the claim
   * with its evidence removed by §1 and never restored by §4. Survivable while this card
   * lived only under a profile point; §5 put it on the feed.
   *
   * The two converters that feed it (feed-point-card.tsx, point-detail-page.tsx) dropped
   * videoUrl/videoQuotes silently, so the data was available at both call sites all along.
   */
  it('renders the video and its quote block, not an image path only', () => {
    render(
      <MemoryRouter>
        <QuotedStory
          story={{
            ...LABEL_STORY,
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            videoQuotes: { quotes: [{ text: 'the blocker is not size', seconds: 876 }], durationSeconds: 1200 },
          }}
          onClick={() => {}}
        />
      </MemoryRouter>
    );

    // The quote block, with a working timecode link into the source at that second.
    const timecode = document.querySelector('a[href*="dQw4w9WgXcQ"]');
    expect(
      timecode,
      'a story with quotes must render them here too — this surface is on the feed now',
    ).toBeTruthy();
    expect(document.body.textContent).toContain('the blocker is not size');
  });
});

/**
 * The §4d defect, in the component §4d did not reach. `QuotedStory` rendered the STORED
 * profile name, which on an agent account carries the reserved `Agent · ` prefix the
 * database enforces (p1104_agent_accounts.sql:206-209) and `stripAgentPrefix` exists to
 * keep off screen. It leaked 4x on the feed, verified in a browser before this fix.
 *
 * The spec's risk table states the rule for the sibling case — "§5 makes this card MORE
 * reachable, so §5 must not ship before §4d" — and §5 is what puts this component on the
 * feed, so the same sentence binds here.
 */
describe('P1212 §4d (QuotedStory) — the stored `Agent · ` prefix never reaches the screen', () => {
  const AGENT_STORY = {
    id: 'qs-2',
    authorId: 'agent-1',
    text: 'A model holding all human knowledge would have to be fine-tuned locally.',
    createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public' as const,
    linkedPointIds: [],
    understoodCount: 0,
  };

  it('renders the subject name without the reserved prefix', () => {
    render(
      <MemoryRouter>
        <QuotedStory
          story={AGENT_STORY}
          onClick={() => {}}
          getStoryAuthor={() => ({ id: 'agent-1', name: 'Agent · Yann LeCun' })}
        />
      </MemoryRouter>
    );

    expect(document.body.textContent).toContain('Yann LeCun');
    expect(document.body.textContent).not.toContain('Agent ·');
  });
});

// ---------------------------------------------------------------------------
// The re-fetch bug. Found by review of the first §5 commit, not by these tests.
// ---------------------------------------------------------------------------

/**
 * THE DEFECT. The first version stored the batch-fetched link map on its own and derived
 * the card prop as `map?.get(id) ?? (map ? [] : undefined)`. Correct on first load. But
 * `fetchData` reset `loading` and `error` and NOT the map, so on any re-fetch — tag click,
 * sort toggle, error-state Retry — the new cards painted while the PREVIOUS fetch's map
 * was still in state. Truthy map, id it has never seen, `.get()` undefined, fallback `[]`:
 * every new card asserted "0 points" as a loaded fact about content whose links had not
 * been fetched. Exactly the falsehood the three states exist to prevent.
 *
 * The fix is not "remember to clear it in fetchData" — that leaves the correctness in a
 * side effect a future fetch path can forget, failing silently when it does. The map is
 * stored with the id set it answers, and a map whose key is not the current one is
 * structurally indistinguishable from no map.
 */
describe('P1212 §5 — a link map from a previous fetch is never read as an answer', () => {
  const stale = { key: linkKeyFor(['old-1', 'old-2']), map: new Map([['old-1', POINTS]]) };

  it('returns undefined — "not loaded" — for ids the stale map never covered', () => {
    const currentKey = linkKeyFor(['new-1', 'new-2']);
    expect(linksFor(stale, currentKey, 'new-1')).toBeUndefined();
  });

  it('refuses the stale map even for an id it DOES hold — the key, not the hit, decides', () => {
    // The subtle half: `old-1` is in the stale map, so a `.get()`-based check would happily
    // return last page's links for a card on this page.
    const currentKey = linkKeyFor(['old-1', 'new-2']);
    expect(linksFor(stale, currentKey, 'old-1')).toBeUndefined();
  });

  it('returns [] — "loaded, none linked" — only when the map answers the current set', () => {
    const currentKey = linkKeyFor(['old-1', 'old-2']);
    expect(linksFor(stale, currentKey, 'old-2')).toEqual([]);
  });

  it('returns the links when the map answers the current set and holds the id', () => {
    const currentKey = linkKeyFor(['old-1', 'old-2']);
    expect(linksFor(stale, currentKey, 'old-1')).toEqual(POINTS);
  });

  it('returns undefined when nothing has loaded yet', () => {
    expect(linksFor(undefined, linkKeyFor(['a']), 'a')).toBeUndefined();
  });

  /** A re-sort reorders the same content. Throwing the map away there would flash the
   *  expanders off for no reason, so the key is order-independent. */
  it('survives a re-sort — same ids in a different order is the same set', () => {
    expect(linkKeyFor(['b', 'a', 'c'])).toBe(linkKeyFor(['c', 'b', 'a']));
  });
});

// ---------------------------------------------------------------------------
// FeedPointCard — the other direction. Untested in the first §5 commit.
// ---------------------------------------------------------------------------

const LINKED_STORIES: StoryWithAuthor[] = [
  makeStory({ id: 'ls-1', content: 'First linked story body.', authorName: 'Agent · Yann LeCun', authorId: 'agent-1' }),
  makeStory({ id: 'ls-2', content: 'Second linked story body.', authorName: 'Jane Doe', authorId: 'human-1' }),
];

const POINT = {
  id: 'p-1',
  statement: 'Open weights do more against concentration than regulation will.',
  text: 'Open weights do more against concentration than regulation will.',
  tags: [],
  systemTags: [],
  visibility: 'public',
  createdAt: '2026-09-01T00:00:00Z',
  positionCounts: { agree: 1, disagree: 0, unsure: 0 },
  userPosition: null,
} as never;

function renderFeedPointCard(linkedStories?: StoryWithAuthor[]) {
  return render(
    <MemoryRouter>
      <FeedPointCard point={POINT} linkedStories={linkedStories} />
    </MemoryRouter>
  );
}

describe('P1212 §5 — feed point card: story-count expander', () => {
  it('renders no expander while the links are still loading', () => {
    renderFeedPointCard(undefined);
    expect(screen.queryByTestId('feed-point-story-expander')).toBeNull();
    expect(screen.queryByText('0 stories')).toBeNull();
  });

  it('renders "0 stories" once loaded with none linked', () => {
    renderFeedPointCard([]);
    expect(screen.getByText('0 stories')).toBeTruthy();
    expect(screen.queryByTestId('feed-point-story-expander')).toBeNull();
  });

  it('singularises the count — "1 story", not "1 storys"', () => {
    renderFeedPointCard([LINKED_STORIES[0]!]);
    expect(screen.getByTestId('feed-point-story-expander').textContent).toContain('1 story');
  });

  it('expands to the linked stories and flips aria-expanded', () => {
    renderFeedPointCard(LINKED_STORIES);
    const expander = screen.getByTestId('feed-point-story-expander');
    expect(expander.textContent).toContain('2 stories');
    expect(expander.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/First linked story body/)).toBeTruthy();
    expect(screen.getByText(/Second linked story body/)).toBeTruthy();
  });

  /**
   * The reason this card renders QuotedStory rather than its own excerpt: the agent
   * disclosure contract arrives with the component. A local preview would have had to
   * re-implement the drained treatment, the chip and the prefix strip — and the §5 commit
   * shows what happens when a surface re-implements one of those.
   */
  it('renders agent stories through QuotedStory, so the disclosure contract comes with them', () => {
    renderFeedPointCard(LINKED_STORIES);
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));

    expect(document.querySelectorAll('[data-agent-row="true"]').length).toBe(1);
    expect(document.body.textContent).not.toContain('Agent ·');
    expect(document.body.textContent).toContain('Yann LeCun');
  });
});
