import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoryCardWithLinks } from '@/app/components/social/story-card-with-links';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { Story, Point } from '@/app/components/shared/prototype-types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

/**
 * P1259 change 5 raised every story-body cut-off by 3x, on the founder's "i think we can
 * allow in all app more chars before we cut of maybe 3x more?".
 *
 * The numbers below moved WITH the implementation and the boundary cases moved with them:
 * 280 -> 840 for both StoryCardWithLinks branches, 200 -> 600 for QuotedStory. Filed agent
 * story bodies run 545-858 characters, so every one of them was being cut before the
 * argument arrived — 840 and 600 are the point of the change, not incidental constants.
 *
 * The at/one-above pairs are kept rather than collapsed: they are what proves the guard is
 * still `>` and not `>=`, which no amount of "a long string truncates" would catch.
 */
const SHORT_TEXT = 'Short story text that is definitely under 840 characters.'; // 57 chars
const AT_THRESHOLD = 'a'.repeat(840); // exactly 840 — should NOT truncate (guard is > 840)
const ONE_ABOVE = 'a'.repeat(841);    // 841 — first case that triggers truncation
const LONG_TEXT = 'a'.repeat(1000);   // well above the 840 threshold

const BASE_STORY: Story = {
  id: 'story-1',
  text: SHORT_TEXT,
  authorId: 'author-1',
  createdAt: new Date().toISOString(),
  understoodCount: 0,
  visibility: 'public',
};

const AUTHOR = {
  id: 'author-1',
  name: 'Alice Example',
  role: 'Coach',
  hasPledged: true,
  ear: 2,
};

const BASE_POINT: Point = {
  id: 'point-1',
  text: 'Test point claim',
  createdAt: new Date().toISOString(),
  positions: {},
  linkedStoryIds: ['story-1'],
  visibility: 'public',
};

function renderCard(text: string, compact: boolean) {
  return render(
    <MemoryRouter>
      <StoryCardWithLinks
        story={{ ...BASE_STORY, text }}
        author={AUTHOR}
        compact={compact}
      />
    </MemoryRouter>
  );
}

describe('Story text truncation with "...more" affordance', () => {
  describe('Standard card rendering (non-quote pattern)', () => {
    it('shows "...more" when compact=true and text > 840 chars', () => {
      renderCard(LONG_TEXT, true);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" when compact=true and text <= 840 chars', () => {
      renderCard(SHORT_TEXT, true);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('does NOT show "...more" when compact=false even with long text', () => {
      renderCard(LONG_TEXT, false);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('shows full text when compact=false and text is long', () => {
      renderCard(LONG_TEXT, false);
      expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    });

    it('"...more" span has blue styling when rendered', () => {
      renderCard(LONG_TEXT, true);
      const moreSpan = screen.getByTestId('more-link');
      expect(moreSpan.tagName).toBe('SPAN');
      expect(moreSpan.className).toContain('text-blue-600');
    });

    it('truncated text is sliced at 840 chars', () => {
      renderCard(LONG_TEXT, true);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_TEXT.slice(0, 840));
    });

    it('clicking "...more" expands full text inline (no navigation)', () => {
      renderCard(LONG_TEXT, true);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    });

    // Boundary cases
    it('does NOT truncate when text is exactly 840 chars (boundary: guard is > 840)', () => {
      renderCard(AT_THRESHOLD, true);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncates when text is exactly 841 chars (one above boundary)', () => {
      renderCard(ONE_ABOVE, true);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });
  });

  describe('Quote pattern rendering (context=point-detail with position)', () => {
    const PROFILE_POSITION = 'agree' as const;

    function renderQuoteCard(text: string, compact: boolean) {
      return render(
        <MemoryRouter>
          <StoryCardWithLinks
            story={{ ...BASE_STORY, text }}
            author={AUTHOR}
            compact={compact}
            context="point-detail"
            profileSubjectPosition={PROFILE_POSITION}
          />
        </MemoryRouter>
      );
    }

    it('shows "...more" in quote pattern when compact=true and text > 840 chars', () => {
      renderQuoteCard(LONG_TEXT, true);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" in quote pattern when compact=true and text <= 840 chars', () => {
      renderQuoteCard(SHORT_TEXT, true);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('does NOT show "...more" in quote pattern when compact=false', () => {
      renderQuoteCard(LONG_TEXT, false);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncated text in quote pattern is sliced at 840 chars', () => {
      renderQuoteCard(LONG_TEXT, true);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_TEXT.slice(0, 840));
    });

    it('clicking "...more" in quote pattern expands full text inline', () => {
      renderQuoteCard(LONG_TEXT, true);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    });
  });

  describe('QuotedStory inside PointCardWithLinks (threshold: 600 chars)', () => {
    const SHORT_QUOTED = 'Short quoted story.'; // under 600
    const AT_QUOTED_THRESHOLD = 'b'.repeat(600); // exactly 600 — should NOT truncate
    const ONE_ABOVE_QUOTED = 'b'.repeat(601);    // 601 — first case that triggers
    const LONG_QUOTED = 'b'.repeat(750);          // well above threshold

    function renderWithQuotedStory(storyText: string) {
      const story: Story = { ...BASE_STORY, id: 'story-1', text: storyText };
      const { container } = render(
        <MemoryRouter>
          <PointCardWithLinks
            point={BASE_POINT}
            linkedStories={[story]}
            liveSessionMode
            getStoryAuthor={() => AUTHOR}
          />
        </MemoryRouter>
      );
      // Expand the stories section — use aria-label to target the story expand
      // button specifically (PositionButtons also render DropdownMenu triggers
      // with aria-expanded for anonymous users since P458)
      const expandBtn = container.querySelector('button[aria-label="Expand linked stories"]');
      if (expandBtn) fireEvent.click(expandBtn);
      return { container };
    }

    it('shows "...more" in QuotedStory when text > 600 chars', () => {
      renderWithQuotedStory(LONG_QUOTED);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" in QuotedStory when text <= 600 chars', () => {
      renderWithQuotedStory(SHORT_QUOTED);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('does NOT truncate when text is exactly 600 chars (boundary: guard is > 600)', () => {
      renderWithQuotedStory(AT_QUOTED_THRESHOLD);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncates when text is exactly 601 chars (one above boundary)', () => {
      renderWithQuotedStory(ONE_ABOVE_QUOTED);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('truncated QuotedStory text is sliced at 600 chars', () => {
      renderWithQuotedStory(LONG_QUOTED);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_QUOTED.slice(0, 600));
    });

    it('clicking "...more" in QuotedStory expands full text inline', () => {
      renderWithQuotedStory(LONG_QUOTED);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_QUOTED)).toBeInTheDocument();
    });
  });
});
