/**
 * @file sift.test.tsx
 * @description Tests for P98 Sifter Prototype - AI-powered thought clarification
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sift } from '@/app/prototypes/linkedin-like/components/Sift';

// Helper to render with router context
const renderWithRouter = (ui: React.ReactElement, { route = '/prototype/linkedin-like/sift' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
};

// Helper to advance timers and flush all pending updates
const advanceTimersAndFlush = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  // Allow any pending state updates to flush
  await act(async () => {
    await Promise.resolve();
  });
};

describe('Sift - P98 Sifter Prototype', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Entry Phase', () => {
    it('renders entry screen with text input and CTA button', () => {
      renderWithRouter(<Sift />);

      // Should show title
      expect(screen.getByText(/Dump your thoughts/i)).toBeInTheDocument();

      // Should have textarea for input
      expect(screen.getByPlaceholderText(/e\.g\./i)).toBeInTheDocument();

      // Should have CTA button
      expect(screen.getByRole('button', { name: /Sift my thoughts/i })).toBeInTheDocument();
    });

    it('disables CTA button when input is empty', () => {
      renderWithRouter(<Sift />);

      const button = screen.getByRole('button', { name: /Sift my thoughts/i });
      expect(button).toBeDisabled();
    });

    it('enables CTA button when input has text', () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'I have been thinking about remote work...' } });

      const button = screen.getByRole('button', { name: /Sift my thoughts/i });
      expect(button).toBeEnabled();
    });

    it('transitions to processing phase when CTA is clicked', async () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts about commuting' } });

      const button = screen.getByRole('button', { name: /Sift my thoughts/i });
      fireEvent.click(button);

      // Should immediately show processing screen
      expect(screen.getByText(/Sifting your thoughts/i)).toBeInTheDocument();
    });
  });

  describe('Processing Phase', () => {
    it('shows loading steps during processing', async () => {
      renderWithRouter(<Sift />);

      // Enter text and submit
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.click(screen.getByRole('button', { name: /Sift my thoughts/i }));

      // Should show processing messages
      expect(screen.getByText(/Finding your Stories/i)).toBeInTheDocument();
    });

    it('transitions to story-review after processing completes', async () => {
      renderWithRouter(<Sift />);

      // Enter text and submit
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.click(screen.getByRole('button', { name: /Sift my thoughts/i }));

      // Advance through all processing steps (4 steps * 600ms each + final 400ms)
      // Run timer steps individually to allow React effects to fire
      for (let i = 0; i < 5; i++) {
        await advanceTimersAndFlush(600);
      }

      expect(screen.getByText(/Do you feel understood/i)).toBeInTheDocument();
    });
  });

  describe('Story Review Phase', () => {
    const goToStoryReview = async () => {
      renderWithRouter(<Sift />);
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.click(screen.getByRole('button', { name: /Sift my thoughts/i }));
      for (let i = 0; i < 5; i++) {
        await advanceTimersAndFlush(600);
      }
    };

    it('shows current story version and rating buttons', async () => {
      await goToStoryReview();

      // Should show rating question
      expect(screen.getByText(/Do you feel understood/i)).toBeInTheDocument();
      // Should show rating buttons 0-10 (check Submit button is present)
      expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
      // Check rating buttons exist by finding the rating buttons container
      const ratingButtons = screen.getAllByRole('button');
      const numericButtons = ratingButtons.filter(btn => /^[0-9]$|^10$/.test(btn.textContent || ''));
      expect(numericButtons.length).toBe(11); // 0-10
    });

    it('shows options when rating is less than 10', async () => {
      await goToStoryReview();

      // Select rating 7 and submit
      fireEvent.click(screen.getByText('7'));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      // Should show refinement options with AI uncertainty
      expect(screen.getByText(/what's closer/i)).toBeInTheDocument();
    });

    it('transitions to done phase when rating is 10', async () => {
      await goToStoryReview();

      // Select rating 10 and submit
      fireEvent.click(screen.getByText('10'));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      // Should show celebration
      expect(screen.getByText(/understood you perfectly/i)).toBeInTheDocument();
    });
  });

  describe('Done Phase', () => {
    const goToDone = async () => {
      renderWithRouter(<Sift />);
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.click(screen.getByRole('button', { name: /Sift my thoughts/i }));
      for (let i = 0; i < 5; i++) {
        await advanceTimersAndFlush(600);
      }
      fireEvent.click(screen.getByText('10'));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    };

    it('shows celebration and action buttons', async () => {
      await goToDone();

      // Should show celebration emoji
      expect(screen.getByText('🎉')).toBeInTheDocument();
      // Should show "Invite someone to verify" CTA
      expect(screen.getByRole('button', { name: /Invite someone to verify/i })).toBeInTheDocument();
      // Should show "Back to profile" secondary button
      expect(screen.getByRole('button', { name: /Back to profile/i })).toBeInTheDocument();
    });

    it('shows journey summary with all versions', async () => {
      await goToDone();

      // Should show journey section
      expect(screen.getByText(/Your journey/i)).toBeInTheDocument();
    });
  });

  describe('Journey with Versions', () => {
    it('tracks rating history across refinement rounds', async () => {
      renderWithRouter(<Sift />);

      // Entry -> Processing
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.click(screen.getByRole('button', { name: /Sift my thoughts/i }));

      for (let i = 0; i < 5; i++) {
        await advanceTimersAndFlush(600);
      }

      // First rating: 7
      fireEvent.click(screen.getByText('7'));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      // Should show refinement screen with "You rated 7/10"
      expect(screen.getByText(/You rated 7\/10/i)).toBeInTheDocument();
    });
  });
});
