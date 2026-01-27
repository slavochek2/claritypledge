/**
 * @file sift.test.tsx
 * @description Tests for P98 Sifter Prototype
 *
 * NOTE: Most tests skipped - Sift design changed from chat-style to interpretation-selection.
 * Will rewrite tests once design settles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sift } from '@/app/prototypes/linkedin-like/components/Sift';

// Mock scrollIntoView (not available in jsdom)
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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

describe('Sift - P98 ChatGPT-Style Sifter with 0-10 Rating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Entry Phase', () => {
    it('renders ChatGPT-style entry screen with centered content', () => {
      renderWithRouter(<Sift />);

      // Should show Clarity AI header
      expect(screen.getByText('Clarity AI')).toBeInTheDocument();

      // Should show main prompt
      expect(screen.getByText(/What's on your mind/i)).toBeInTheDocument();

      // Should have textarea for input
      expect(screen.getByPlaceholderText(/e\.g\./i)).toBeInTheDocument();
    });

    it('shows Leave button in header (matches /live pattern)', () => {
      renderWithRouter(<Sift />);

      expect(screen.getByRole('button', { name: /Leave/i })).toBeInTheDocument();
    });

    it('disables send button when input is empty', () => {
      renderWithRouter(<Sift />);

      // Send button should be disabled (gray background)
      const buttons = document.querySelectorAll('button');
      const sendButton = Array.from(buttons).find(b => b.querySelector('svg'));
      expect(sendButton).toHaveClass('bg-gray-300');
    });

    it('enables send button when input has text', () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts about commuting' } });

      // Send button should be enabled (blue background)
      const buttons = document.querySelectorAll('button');
      const sendButton = Array.from(buttons).find(b => b.querySelector('svg'));
      expect(sendButton).toHaveClass('bg-blue-500');
    });

    it.skip('transitions to chat phase when message is sent', async () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts about commuting' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      // Should show user message in chat
      expect(screen.getByText('My thoughts about commuting')).toBeInTheDocument();
      // Should show "You" label for user message
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  describe.skip('Chat Phase', () => {
    const goToChat = async () => {
      renderWithRouter(<Sift />);
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts about commuting' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
    };

    it('shows typing indicator while AI is responding', async () => {
      await goToChat();

      // Typing indicator should be visible (animated dots)
      const typingDots = document.querySelectorAll('.animate-bounce');
      expect(typingDots.length).toBe(3);
    });

    it('shows AI interpretation after delay', async () => {
      await goToChat();

      // Advance past AI response delay (1000ms)
      await advanceTimersAndFlush(1500);

      // AI message should appear with interpretation
      expect(screen.getByText(/commute/i)).toBeInTheDocument();
    });

    it('shows 0-10 rating buttons after AI responds', async () => {
      await goToChat();
      await advanceTimersAndFlush(1500);

      // Should show rating question
      expect(screen.getByText(/How well does this capture/i)).toBeInTheDocument();

      // Should show all rating buttons 0-10
      for (let i = 0; i <= 10; i++) {
        expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
      }

      // Should show Submit button
      expect(screen.getByRole('button', { name: /Submit/i })).toBeInTheDocument();
    });

    it('selecting a rating enables submit button', async () => {
      await goToChat();
      await advanceTimersAndFlush(1500);

      // Submit should be disabled initially
      expect(screen.getByRole('button', { name: /Submit/i })).toBeDisabled();

      // Click rating 7
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '7' }));
        await Promise.resolve(); // Allow state to flush
      });

      // Re-query the button after state update - should be enabled now
      expect(screen.getByRole('button', { name: /Submit/i })).toBeEnabled();
    });

    it('rating < 8 prompts for clarification', async () => {
      await goToChat();
      await advanceTimersAndFlush(1500);

      // Select rating 5
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      // Wait for AI follow-up
      await advanceTimersAndFlush(1000);

      // Should ask for clarification with rating shown
      expect(screen.getByText(/You rated 5\/10/i)).toBeInTheDocument();
      expect(screen.getByText(/What did I miss/i)).toBeInTheDocument();
    });

    it('rating >= 8 transitions to done phase', async () => {
      await goToChat();
      await advanceTimersAndFlush(1500);

      // Select rating 9
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

      // Should show "Your Story is ready" text
      expect(screen.getByText(/Your Story is ready/i)).toBeInTheDocument();
    });
  });

  describe.skip('Done Phase', () => {
    const goToDone = async () => {
      renderWithRouter(<Sift />);
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts about commuting' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500);
      fireEvent.click(screen.getByRole('button', { name: '10' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
    };

    it('shows final story card with user info', async () => {
      await goToDone();

      // Should show the story card with mock user name
      expect(screen.getByText(/Sarah Chen/i)).toBeInTheDocument();
    });

    it('shows success checkmark', async () => {
      await goToDone();

      // Should show green checkmark
      expect(screen.getByText(/Your Story is ready/i)).toBeInTheDocument();
    });

    it('shows "Invite someone to verify" CTA', async () => {
      await goToDone();

      expect(screen.getByRole('button', { name: /Invite someone to verify/i })).toBeInTheDocument();
    });

    it('shows "Back to profile" secondary button', async () => {
      await goToDone();

      expect(screen.getByRole('button', { name: /Back to profile/i })).toBeInTheDocument();
    });
  });

  describe.skip('Refinement Flow', () => {
    it('shows clarification prompt when rating is below threshold', async () => {
      renderWithRouter(<Sift />);

      // Initial entry
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });

      // First AI response
      await advanceTimersAndFlush(1500);

      // Rate 5 (below threshold)
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
      await advanceTimersAndFlush(1000);

      // AI asks for clarification
      expect(screen.getByText(/You rated 5\/10/i)).toBeInTheDocument();

      // Input should be visible for user to provide clarification
      const inputField = screen.getByPlaceholderText(/Share what's on your mind/i);
      expect(inputField).toBeInTheDocument();
    });

    it('allows user to send clarification after low rating', async () => {
      renderWithRouter(<Sift />);

      // Initial entry
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500);

      // Rate 5 (below threshold)
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
      await advanceTimersAndFlush(1000);

      // Provide clarification
      const inputField = screen.getByPlaceholderText(/Share what's on your mind/i);
      fireEvent.change(inputField, { target: { value: 'The guilt about missing my kids' } });
      fireEvent.keyDown(inputField, { key: 'Enter' });

      // Clarification should appear in chat
      expect(screen.getByText('The guilt about missing my kids')).toBeInTheDocument();
    });

    it('shows "Use this anyway" escape after 3 low ratings', async () => {
      renderWithRouter(<Sift />);

      // Helper for one refinement cycle: rate low → clarify → wait for AI response
      const doRefinementCycle = async (clarificationText: string) => {
        // Rate low (5)
        fireEvent.click(screen.getByRole('button', { name: '5' }));
        fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
        await advanceTimersAndFlush(1000); // AI asks for clarification

        // Provide clarification - use button click instead of Enter key for reliability
        const inputField = screen.getByPlaceholderText(/Share what's on your mind/i);
        await act(async () => {
          fireEvent.change(inputField, { target: { value: clarificationText } });
        });
        // Click the send button
        const sendButton = screen.getByRole('button', { name: /Send message/i });
        await act(async () => {
          fireEvent.click(sendButton);
        });
        await advanceTimersAndFlush(1500); // Wait for AI to respond with new interpretation
      };

      // Initial entry
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500); // Wait for initial AI response

      // Do 3 refinement cycles
      await doRefinementCycle('More context 1');
      await doRefinementCycle('More context 2');
      await doRefinementCycle('More context 3');

      // After 3 refinements, "Use this anyway" should appear with the rating UI
      expect(screen.getByRole('button', { name: /Use this anyway/i })).toBeInTheDocument();
    });
  });

  describe('Exit Confirmation', () => {
    it('shows confirmation dialog when leaving mid-chat', async () => {
      renderWithRouter(<Sift />);

      // Start a chat session
      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500);

      // Click Leave
      fireEvent.click(screen.getByRole('button', { name: /Leave/i }));

      // Should show confirmation dialog
      expect(screen.getByText(/Leave session/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Keep going/i })).toBeInTheDocument();
    });

    it('does not show confirmation when leaving from entry phase', () => {
      renderWithRouter(<Sift />);

      // Click Leave from entry (no session started)
      fireEvent.click(screen.getByRole('button', { name: /Leave/i }));

      // Should NOT show confirmation dialog (navigates directly)
      expect(screen.queryByText(/Leave session/i)).not.toBeInTheDocument();
    });
  });

  describe.skip('ChatGPT-style Layout', () => {
    it('shows AI messages with action icons (copy, thumbs)', async () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500);

      // Rate to dismiss rating UI and see action icons
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
      await advanceTimersAndFlush(1000);

      // AI follow-up message should have action icons (no rating on this message)
      // The icons are visible as SVGs
      const actionButtons = document.querySelectorAll('.text-gray-400');
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('alternates message backgrounds (white/gray)', async () => {
      renderWithRouter(<Sift />);

      const textarea = screen.getByPlaceholderText(/e\.g\./i);
      fireEvent.change(textarea, { target: { value: 'My thoughts' } });
      fireEvent.keyDown(textarea, { key: 'Enter' });
      await advanceTimersAndFlush(1500);

      // User message should have white background
      const userMessage = screen.getByText('My thoughts').closest('.py-6');
      expect(userMessage).toHaveClass('bg-white');

      // AI message should have gray background
      const aiMessage = screen.getByText(/commute/i).closest('.py-6');
      expect(aiMessage).toHaveClass('bg-gray-50');
    });
  });
});
