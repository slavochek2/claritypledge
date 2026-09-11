/**
 * @file p1296-source-group.test.tsx
 * @description P1296 item 7 — a group of stories on one video: one player, a count heading,
 * two stories then "Show N more", and every member card keeping its footer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SourceGroup, type GroupPlayer } from '@/app/components/shared/source-group';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import type { StoryWithAuthor } from '@/app/types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null, user: null }) }));
vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({ isAgentAccountId: () => false, operatorNameFor: () => null, isLoading: false }),
  };
});

const VIDEO = 'https://www.youtube.com/watch?v=abcDEF12345';

const story = (id: string, url = VIDEO): StoryWithAuthor => ({
  id,
  authorId: `author-${id}`,
  content: `Story ${id}.`,
  visibility: 'public',
  currentVersion: 1,
  understoodCount: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  tags: [],
  systemTags: [],
  authorName: `Author ${id}`,
  authorSlug: `author-${id}`,
  videoUrl: url,
  videoQuotes: { quotes: [{ text: `quote of ${id}`, seconds: 30 }], durationSeconds: 600 },
} as StoryWithAuthor);

const renderCard = (s: StoryWithAuthor, groupPlayer?: GroupPlayer) => (
  <FeedStoryCard key={s.id} story={s} linkedPoints={[]} groupPlayer={groupPlayer} />
);

beforeEach(() => cleanup());

function renderGroup(stories: StoryWithAuthor[]) {
  return render(
    <MemoryRouter>
      <SourceGroup stories={stories} renderStory={renderCard} />
    </MemoryRouter>,
  );
}

const memberCards = () => screen.getAllByRole('button', { name: /^Story by / });

describe('P1296 — what a group looks like', () => {
  it('a heading that states the count and nothing else', () => {
    renderGroup([story('a'), story('b'), story('c')]);
    expect(screen.getByTestId('source-group-heading').textContent).toBe('3 stories from this video');
    expect(screen.getByRole('region', { name: '3 stories from this video' })).toBeTruthy();
  });

  it('ONE player for the group — the member cards mount no media box of their own', () => {
    renderGroup([story('a'), story('b')]);
    const group = screen.getByTestId('source-group');
    expect(group.querySelectorAll('[data-testid="video-thumbnail-link"], [data-testid="story-video-player"]')).toHaveLength(1);
    for (const card of memberCards()) {
      expect(card.querySelector('[data-testid="video-thumbnail-link"], [data-testid="story-video-player"]')).toBeNull();
    }
  });

  it('shows two stories, then "Show N more", and the control reveals the rest', () => {
    renderGroup([story('a'), story('b'), story('c'), story('d')]);
    expect(memberCards()).toHaveLength(2);
    const more = screen.getByTestId('source-group-show-more');
    expect(more.textContent).toBe('Show 2 more stories');
    expect(more.className).toContain('min-h-[40px]');
    fireEvent.click(more);
    expect(memberCards()).toHaveLength(4);
    expect(screen.queryByTestId('source-group-show-more')).toBeNull();
  });

  it('"Show 1 more story" is singular', () => {
    renderGroup([story('a'), story('b'), story('c')]);
    expect(screen.getByTestId('source-group-show-more').textContent).toBe('Show 1 more story');
  });

  it('every member card keeps its full footer and its folded quotes', () => {
    renderGroup([story('a'), story('b')]);
    for (const card of memberCards()) {
      const footer = within(card).getByTestId('story-card-footer');
      expect(within(footer).getByRole('button', { name: 'Share story' })).toBeTruthy();
      expect(within(footer).getByRole('button', { name: 'Open story' })).toBeTruthy();
      expect(within(card).getByTestId('story-video-quotes-toggle').textContent).toBe('1 supporting quote');
    }
  });

  it("a member's timecode is a SEEK control handed to the group's player, not a link out", () => {
    const seen: GroupPlayer[] = [];
    render(
      <MemoryRouter>
        <SourceGroup
          stories={[story('a'), story('b')]}
          renderStory={(s, groupPlayer) => {
            seen.push(groupPlayer);
            return renderCard(s, groupPlayer);
          }}
        />
      </MemoryRouter>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Every member gets the SAME player's seek.
    expect(new Set(seen.map((g) => g.onSeek)).size).toBe(1);
    const card = memberCards()[0]!;
    fireEvent.click(within(card).getByTestId('story-video-quotes-toggle'));
    expect(within(card).getByTestId('story-video-quote-timecode').tagName).toBe('BUTTON');
  });
});
