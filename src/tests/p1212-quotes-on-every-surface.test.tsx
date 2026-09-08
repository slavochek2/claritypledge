/**
 * @file p1212-quotes-on-every-surface.test.tsx
 * @description P1212 §4 — the supporting quotes reach every surface that renders a story.
 *
 * WHY THIS EXISTS, AND WHY IT IS A REGRESSION THIS SPEC CAUSED.
 *
 * §4's verified surface table marked the Quotes column ✅ on exactly ONE of six surfaces
 * (story detail) and noted underneath: "Five of six surfaces render no quote block at all.
 * They are readable today only because the quote bodies sit inline in `story.content`."
 *
 * §1 then removed that inline copy. The crutch went and nothing replaced it, so a story on
 * the feed or a profile showed the argument and NOT the evidence for it. §4b's own heading
 * says "§1 breaks it further" — it fixed the sealed-letter surface and left these.
 *
 * Founder, 2026-09-04: "supporting quotes with their time spans and jumping needs to appear
 * ... in feed when the stories appear, but also in profiles", and on the profile earlier:
 * "it should render the full card that we have, like with the video and the timestamps".
 *
 * THE TIMECODES WORK WITHOUT A PLAYER. `StoryVideoQuotes` already handles it: omit `onSeek`
 * and every timecode becomes a link opening the source at that second. So the §4 rule
 * "timecodes render only where clicking one works" is satisfied off-detail too — the rule
 * was about dead numbers, and these are not dead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { QUOTE_LABEL_PREFIX } from '@/lib/story-quotes';
import type { StoryWithAuthor } from '@/app/types';

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
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' }, isLoading: false }),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const VIDEO = 'https://www.youtube.com/watch?v=abc12345678';
const QUOTE_A = 'The blocker is not size.';
const QUOTE_B = 'Open weights change the balance.';

function agentStory(overrides: Partial<StoryWithAuthor> = {}): StoryWithAuthor {
  return {
    id: 'story-1',
    authorId: 'agent-1',
    content: 'A model holding all human knowledge would have to be fine-tuned locally.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    tags: [],
    systemTags: [],
    authorName: 'Agent · Yann LeCun',
    authorSlug: 'agent-yann-lecun',
    videoUrl: VIDEO,
    videoQuotes: {
      quotes: [{ text: QUOTE_A, seconds: 42 }, { text: QUOTE_B, seconds: 605 }],
      durationSeconds: 1200,
    },
    ...overrides,
  } as StoryWithAuthor;
}

beforeEach(() => { navigate.mockClear(); cleanup(); });

describe('P1212 §4 — the feed story card carries the quotes, not just the argument', () => {
  it('renders the quote BODIES, not only the heading', () => {
    render(<MemoryRouter><FeedStoryCard story={agentStory()} /></MemoryRouter>);
    expect(screen.getByTestId('story-video-quotes')).toBeTruthy();
    expect(document.body.textContent).toContain(QUOTE_A);
    expect(document.body.textContent).toContain(QUOTE_B);
  });

  /** The label is the component's own <h3>. It must appear exactly once — the whole point of
   *  §1 was that it appeared twice when the bodies also sat inline in `content`. */
  it('renders the label exactly once', () => {
    render(<MemoryRouter><FeedStoryCard story={agentStory()} /></MemoryRouter>);
    const occurrences = (document.body.textContent ?? '').split(QUOTE_LABEL_PREFIX).length - 1;
    expect(occurrences, 'the quote heading must render once — twice is the §1 defect returning').toBe(1);
  });

  /**
   * A timecode with nowhere to go is the thing §4's rule actually forbids. THE RULE IS
   * UNCHANGED; WHAT SATISFIES IT ON THIS SURFACE IS NOT.
   *
   * §4 shipped with "off-detail there is no player, so each one must be a link that opens
   * the source AT that second" — correct then, and the leak P1259 exists to close. Founder,
   * 2026-09-07: "when I click on a timestamp, we stay on the same page in the same way we do
   * that when we are on a story card." The feed now mounts a real player, so each timecode is
   * a SEEK BUTTON carrying its second, and the new-tab link is what it degrades to when the
   * embed is blocked (StoryVideoQuotes' `playerBlocked` path, unchanged and still covered by
   * p1141-video-seek.test.tsx).
   *
   * The seconds are asserted off `data-seconds` rather than an href because that attribute is
   * on BOTH branches — so this assertion keeps holding whichever one a surface renders, which
   * is exactly what went wrong the first time.
   */
  it('every timecode carries its second and seeks in place rather than leaving the page', () => {
    render(<MemoryRouter><FeedStoryCard story={agentStory()} /></MemoryRouter>);
    const block = screen.getByTestId('story-video-quotes');
    const timecodes = [...block.querySelectorAll('[data-testid="story-video-quote-timecode"]')];
    expect(timecodes.length).toBeGreaterThanOrEqual(2);

    const seconds = timecodes.map(el => el.getAttribute('data-seconds') ?? '');
    expect(seconds).toContain('42');
    expect(seconds).toContain('605');

    for (const el of timecodes) {
      expect(
        el.tagName,
        'a timecode on a surface with a player must seek it, not open a tab — that is the leak P1259 closes',
      ).toBe('BUTTON');
      expect(el.getAttribute('target')).toBeNull();
    }
  });

  it('renders no quote block at all when the story has no quotes', () => {
    render(<MemoryRouter><FeedStoryCard story={agentStory({ videoQuotes: undefined })} /></MemoryRouter>);
    expect(screen.queryByTestId('story-video-quotes')).toBeNull();
    expect(document.body.textContent).not.toContain(QUOTE_LABEL_PREFIX);
  });
});
