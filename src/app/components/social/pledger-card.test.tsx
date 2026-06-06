import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PledgerCard } from './pledger-card';
import type { ReactNode } from 'react';

// Mock Mixpanel - must be defined before vi.mock to avoid hoisting issues
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
  },
}));

// Import the mocked analytics to get access to the mock function
import { analytics } from '@/lib/mixpanel';

// Wrapper to provide router and tooltip context
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);

describe('PledgerCard', () => {
  const mockPledger = {
    slug: 'john-doe',
    name: 'John Doe',
    role: 'Software Engineer',
    reason: 'I believe in clear communication',
    signedAt: '2024-01-15T10:30:00Z',
    avatarColor: '#0044CC',
    witnessCount: 5,
    reciprocations: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders pledger name, role, and reason correctly', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
      expect(screen.getByText('"I believe in clear communication"')).toBeInTheDocument();
    });

    it('does not render role when not provided', () => {
      const pledgerWithoutRole = { ...mockPledger, role: undefined };
      render(<PledgerCard {...pledgerWithoutRole} />, { wrapper });

      expect(screen.queryByText('Software Engineer')).not.toBeInTheDocument();
    });

    it('does not render reason when not provided', () => {
      const pledgerWithoutReason = { ...mockPledger, reason: undefined };
      render(<PledgerCard {...pledgerWithoutReason} />, { wrapper });

      expect(screen.queryByText(/"I believe in clear communication"/)).not.toBeInTheDocument();
    });
  });

  describe('Stats visibility (showStats prop)', () => {
    it('showStats=true renders witness count and reciprocations', () => {
      render(<PledgerCard {...mockPledger} showStats={true} />, { wrapper });

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Witnessed By')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Pledged After')).toBeInTheDocument();
    });

    it('showStats=false hides stats section', () => {
      render(<PledgerCard {...mockPledger} showStats={false} />, { wrapper });

      expect(screen.queryByText('5')).not.toBeInTheDocument();
      expect(screen.queryByText('Witnessed By')).not.toBeInTheDocument();
      expect(screen.queryByText('3')).not.toBeInTheDocument();
      expect(screen.queryByText('Pledged After')).not.toBeInTheDocument();
    });

    it('defaults to showStats=true when not specified', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      expect(screen.getByText('Witnessed By')).toBeInTheDocument();
      expect(screen.getByText('Pledged After')).toBeInTheDocument();
    });
  });

  describe('Date visibility (showDate prop)', () => {
    it('showDate=true renders formatted date', () => {
      render(<PledgerCard {...mockPledger} showDate={true} />, { wrapper });

      expect(screen.getByText(/Signed on/i)).toBeInTheDocument();
      expect(screen.getByText(/January 15, 2024/i)).toBeInTheDocument();
    });

    it('showDate=false hides date section', () => {
      render(<PledgerCard {...mockPledger} showDate={false} />, { wrapper });

      expect(screen.queryByText(/Signed on/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/January 15, 2024/i)).not.toBeInTheDocument();
    });

    it('defaults to showDate=true when not specified', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      expect(screen.getByText(/Signed on/i)).toBeInTheDocument();
    });
  });

  describe('Analytics tracking', () => {
    it('clicking card fires analytics.track with pledger_slug', async () => {
      const user = userEvent.setup();
      render(<PledgerCard {...mockPledger} />, { wrapper });

      const card = screen.getByRole('link');
      await user.click(card);

      expect(analytics.track).toHaveBeenCalledTimes(1);
      expect(analytics.track).toHaveBeenCalledWith('pledger_card_clicked', {
        pledger_slug: 'john-doe',
      });
    });
  });

  describe('Navigation', () => {
    it('card links to /p/{slug}/pledge', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      const card = screen.getByRole('link');
      expect(card).toHaveAttribute('href', '/p/john-doe/pledge');
    });
  });

  describe('Tooltip triggers', () => {
    it('tooltip triggers render for stats when showStats=true', () => {
      render(<PledgerCard {...mockPledger} showStats={true} />, { wrapper });

      // Tooltip triggers have cursor-help class
      const tooltipTriggers = document.querySelectorAll('.cursor-help');
      expect(tooltipTriggers.length).toBe(2); // One for "Witnessed By", one for "Pledged After"
    });

    it('no tooltip triggers when showStats=false', () => {
      render(<PledgerCard {...mockPledger} showStats={false} />, { wrapper });

      const tooltipTriggers = document.querySelectorAll('.cursor-help');
      expect(tooltipTriggers.length).toBe(0);
    });
  });

  describe('Custom styling', () => {
    it('applies custom className to card', () => {
      const { container } = render(
        <PledgerCard {...mockPledger} className="custom-class" />,
        { wrapper }
      );

      const card = container.querySelector('.custom-class');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Avatar', () => {
    it('renders GravatarAvatar component', () => {
      const { container } = render(<PledgerCard {...mockPledger} />, { wrapper });

      // GravatarAvatar renders initials in a div
      const avatar = container.querySelector('[class*="rounded-full"]');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('"Open Pledge" link indicator', () => {
    it('renders "Open Pledge" text', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      expect(screen.getByText('Open Pledge')).toBeInTheDocument();
    });
  });

  // P76: Pledger Avatar Distinction
  describe('P76: Pledger avatar distinction', () => {
    it('renders pledger ring around avatar', () => {
      render(<PledgerCard {...mockPledger} />, { wrapper });

      // PledgerCard always shows pledger distinction with blue ring (isPledger=true)
      const avatar = screen.getByTestId('gravatar-avatar');
      expect(avatar.className).toMatch(/ring-(blue-500|\[3px\]|3)/);
    });
  });
});
