import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoryCardWithLinks } from '@/app/components/social/story-card-with-links';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { Story, Point } from '@/app/prototypes/shared/types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const SHORT_TEXT = 'Short story text that is definitely under 150 characters.'; // 57 chars
const AT_THRESHOLD = 'a'.repeat(150); // exactly 150 — should NOT truncate (guard is > 150)
const ONE_ABOVE = 'a'.repeat(151);    // 151 — first case that triggers truncation
const LONG_TEXT =
  'This is a very long story text that exceeds the one hundred and fifty character threshold so that the truncation logic will kick in and show the blue more link at the end of the visible portion.'; // 196 chars

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
    it('shows "...more" when compact=true and text > 150 chars', () => {
      renderCard(LONG_TEXT, true);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" when compact=true and text <= 150 chars', () => {
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

    it('truncated text is sliced at 150 chars', () => {
      renderCard(LONG_TEXT, true);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_TEXT.slice(0, 150));
    });

    it('clicking "...more" expands full text inline (no navigation)', () => {
      renderCard(LONG_TEXT, true);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    });

    // Boundary cases
    it('does NOT truncate when text is exactly 150 chars (boundary: guard is > 150)', () => {
      renderCard(AT_THRESHOLD, true);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncates when text is exactly 151 chars (one above boundary)', () => {
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

    it('shows "...more" in quote pattern when compact=true and text > 150 chars', () => {
      renderQuoteCard(LONG_TEXT, true);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" in quote pattern when compact=true and text <= 150 chars', () => {
      renderQuoteCard(SHORT_TEXT, true);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('does NOT show "...more" in quote pattern when compact=false', () => {
      renderQuoteCard(LONG_TEXT, false);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncated text in quote pattern is sliced at 150 chars', () => {
      renderQuoteCard(LONG_TEXT, true);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_TEXT.slice(0, 150));
    });

    it('clicking "...more" in quote pattern expands full text inline', () => {
      renderQuoteCard(LONG_TEXT, true);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    });
  });

  describe('QuotedStory inside PointCardWithLinks (threshold: 100 chars)', () => {
    const SHORT_QUOTED = 'Short quoted story.'; // under 100
    const AT_QUOTED_THRESHOLD = 'b'.repeat(100); // exactly 100 — should NOT truncate
    const ONE_ABOVE_QUOTED = 'b'.repeat(101);    // 101 — first case that triggers
    const LONG_QUOTED = 'b'.repeat(120);          // well above threshold

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

    it('shows "...more" in QuotedStory when text > 100 chars', () => {
      renderWithQuotedStory(LONG_QUOTED);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('does NOT show "...more" in QuotedStory when text <= 100 chars', () => {
      renderWithQuotedStory(SHORT_QUOTED);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('does NOT truncate when text is exactly 100 chars (boundary: guard is > 100)', () => {
      renderWithQuotedStory(AT_QUOTED_THRESHOLD);
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
    });

    it('truncates when text is exactly 101 chars (one above boundary)', () => {
      renderWithQuotedStory(ONE_ABOVE_QUOTED);
      expect(screen.getByTestId('more-link')).toBeInTheDocument();
    });

    it('truncated QuotedStory text is sliced at 100 chars', () => {
      renderWithQuotedStory(LONG_QUOTED);
      const para = screen.getByTestId('more-link').closest('p');
      expect(para?.textContent).toContain(LONG_QUOTED.slice(0, 100));
    });

    it('clicking "...more" in QuotedStory expands full text inline', () => {
      renderWithQuotedStory(LONG_QUOTED);
      fireEvent.click(screen.getByTestId('more-link'));
      expect(screen.queryByTestId('more-link')).not.toBeInTheDocument();
      expect(screen.getByText(LONG_QUOTED)).toBeInTheDocument();
    });
  });
});
