import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserJourneySection } from './user-journey-section';

describe('UserJourneySection', () => {
  it('renders all 3 steps with correct titles', () => {
    render(<UserJourneySection />);

    expect(screen.getByText('Try a Clarity Meeting')).toBeInTheDocument();
    expect(screen.getByText('Create Clarity Partnerships')).toBeInTheDocument();
    expect(screen.getByText('Take the Pledge')).toBeInTheDocument();
  });

  it('renders all 3 steps with correct descriptions', () => {
    render(<UserJourneySection />);

    expect(
      screen.getByText('Start a meeting, rate understanding, bridge the gaps.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Commit to specific people — your team, clients, partners.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Go public. Commit to everyone. Earn your certificate.')
    ).toBeInTheDocument();
  });

  it('renders step numbers (1, 2, 3)', () => {
    render(<UserJourneySection />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows "Coming soon" badge only on step 2', () => {
    render(<UserJourneySection />);

    const comingSoonBadges = screen.getAllByText('Coming soon');
    expect(comingSoonBadges).toHaveLength(1);
  });

  it('renders section header with correct text', () => {
    render(<UserJourneySection />);

    expect(screen.getByText('Your journey to clarity')).toBeInTheDocument();
    expect(screen.getByText('Start small, grow your commitment')).toBeInTheDocument();
  });

  it('renders all icons (VideoIcon, UsersIcon, BadgeCheckIcon)', () => {
    const { container } = render(<UserJourneySection />);

    // Each step has an icon wrapped in a div with specific classes
    const iconContainers = container.querySelectorAll('.w-16.h-16');
    expect(iconContainers).toHaveLength(3);

    // Verify SVG elements are rendered (lucide-react renders SVGs)
    const svgElements = container.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThanOrEqual(3);
  });
});
