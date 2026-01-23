import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { IdeasStories } from '../app/prototypes/linkedin-like/components/ideas/IdeasStories';
import type { StoryIdea } from '../app/prototypes/linkedin-like/components/ideas/types';

// Mock data for testing
const mockIdeas: StoryIdea[] = [
  {
    id: 'idea-1',
    text: 'Remote work is more productive than office work',
    author: { id: 'alice', name: 'Alice', avatar: '👩' },
    myPosition: null,
    partnerPosition: 'agree',
    isVerified: false,
    timestamp: new Date().toISOString(),
  },
  {
    id: 'idea-2',
    text: 'AI will replace most knowledge work within 10 years',
    author: { id: 'bob', name: 'Bob', avatar: '🧑' },
    myPosition: 'disagree',
    partnerPosition: 'agree',
    isVerified: false,
    timestamp: new Date().toISOString(),
  },
  {
    id: 'idea-3',
    text: 'Code reviews are more valuable than automated testing',
    author: { id: 'carol', name: 'Carol', avatar: '👩‍💼' },
    myPosition: 'agree',
    partnerPosition: 'agree',
    isVerified: true,
    timestamp: new Date().toISOString(),
  },
];

const renderWithRouter = (ui: React.ReactNode) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('IdeasStories - Full Screen Stories UX', () => {
  let onPositionChange: ReturnType<typeof vi.fn>;
  let onVerify: ReturnType<typeof vi.fn>;
  let onAddIdea: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPositionChange = vi.fn();
    onVerify = vi.fn();
    onAddIdea = vi.fn();
    onClose = vi.fn();
  });

  describe('J1: Surface an idea (empty state)', () => {
    it('shows empty state with add idea CTA when no ideas exist', () => {
      renderWithRouter(
        <IdeasStories
          ideas={[]}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      expect(screen.getByText(/no ideas yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add idea/i })).toBeInTheDocument();
    });

    it('calls onAddIdea when add button is tapped', () => {
      renderWithRouter(
        <IdeasStories
          ideas={[]}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /add idea/i }));
      expect(onAddIdea).toHaveBeenCalled();
    });
  });

  describe('J2: See partner idea - progress bar and navigation', () => {
    it('shows progress bar with correct segment count', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      const progressSegments = screen.getAllByTestId('progress-segment');
      expect(progressSegments).toHaveLength(3);
    });

    it('shows first idea content by default', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      expect(screen.getByText(/remote work is more productive/i)).toBeInTheDocument();
    });

    it('advances to next idea on tap', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      const storyArea = screen.getByTestId('story-tap-area');
      fireEvent.click(storyArea);

      await waitFor(() => {
        expect(screen.getByText(/AI will replace/i)).toBeInTheDocument();
      });
    });

    it('closes on close button tap', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('J3: Stake position - poll overlay', () => {
    it('shows position buttons when idea has no myPosition', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      // New labels: "I Agree", "I Disagree", "Not Sure"
      expect(screen.getByRole('button', { name: /I Agree/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /I Disagree/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Not Sure/i })).toBeInTheDocument();
    });

    it('calls onPositionChange when position button is tapped', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /I Agree/i }));
      expect(onPositionChange).toHaveBeenCalledWith('idea-1', 'agree');
    });
  });

  describe('J4: See partner position', () => {
    it('shows partner position badge when they have staked', () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      // New display shows partner position with "agrees with this" label
      expect(screen.getByText(/agrees with this/i)).toBeInTheDocument();
    });
  });

  describe('J6: Trigger verification - divergent positions', () => {
    it('shows verify button when positions diverge', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          startIndex={1} // idea-2 has divergent positions
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      // New label: "Check Understanding"
      expect(screen.getByRole('button', { name: /verify understanding|check understanding/i })).toBeInTheDocument();
    });

    it('calls onVerify when verify button is tapped', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          startIndex={1}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /verify understanding|check understanding/i }));
      expect(onVerify).toHaveBeenCalledWith('idea-2');
    });
  });

  describe('J8: See history - verified badge', () => {
    it('shows verified badge on verified ideas', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          startIndex={2} // idea-3 is verified
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      // New label: "Understanding Verified"
      expect(screen.getByText(/understanding verified/i)).toBeInTheDocument();
    });
  });

  describe('Swipe gestures', () => {
    it('navigates forward on swipe left', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      const storyArea = screen.getByTestId('story-tap-area');

      // Simulate swipe left
      fireEvent.touchStart(storyArea, { touches: [{ clientX: 300 }] });
      fireEvent.touchEnd(storyArea, { changedTouches: [{ clientX: 100 }] });

      await waitFor(() => {
        expect(screen.getByText(/AI will replace/i)).toBeInTheDocument();
      });
    });

    it('navigates backward on swipe right', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          startIndex={1}
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      const storyArea = screen.getByTestId('story-tap-area');

      // Simulate swipe right
      fireEvent.touchStart(storyArea, { touches: [{ clientX: 100 }] });
      fireEvent.touchEnd(storyArea, { changedTouches: [{ clientX: 300 }] });

      await waitFor(() => {
        expect(screen.getByText(/remote work is more productive/i)).toBeInTheDocument();
      });
    });
  });

  describe('Auto-close behavior', () => {
    it('calls onClose after last idea', async () => {
      renderWithRouter(
        <IdeasStories
          ideas={mockIdeas}
          startIndex={2} // Start at last idea
          onPositionChange={onPositionChange}
          onVerify={onVerify}
          onAddIdea={onAddIdea}
          onClose={onClose}
        />
      );

      const storyArea = screen.getByTestId('story-tap-area');
      fireEvent.click(storyArea);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});

describe('IdeasHistoryView - History panel', () => {
  // Import would come from actual component
  // Simplified test structure for history view
  it.todo('shows all ideas with status indicators');
  it.todo('groups ideas by: pending, divergent, verified');
  it.todo('allows tapping idea to jump to it in stories');
});
