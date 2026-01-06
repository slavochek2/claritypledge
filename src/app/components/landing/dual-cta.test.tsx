import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DualCTA } from './dual-cta';

// Wrapper to provide router context
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('DualCTA', () => {
  describe('Default mode (reversed=false)', () => {
    it('renders "Try a Clarity Meeting" as primary button', () => {
      renderWithRouter(<DualCTA />);

      const primaryButton = screen.getByRole('link', { name: /try a clarity meeting/i });
      expect(primaryButton).toBeInTheDocument();
      expect(primaryButton).toHaveAttribute('href', '/live');
      // Primary button has bg-blue-500 class
      expect(primaryButton.className).toContain('bg-blue-500');
    });

    it('renders "Take the Pledge" as secondary link', () => {
      renderWithRouter(<DualCTA />);

      const links = screen.getAllByRole('link', { name: /take the pledge/i });
      const secondaryLink = links[0];
      expect(secondaryLink).toBeInTheDocument();
      expect(secondaryLink).toHaveAttribute('href', '/sign-pledge');
      // Secondary link does NOT have bg-blue-500 (it's a text link)
      expect(secondaryLink.className).not.toContain('bg-blue-500');
    });
  });

  describe('Reversed mode (reversed=true)', () => {
    it('renders "Take the Pledge" as primary button', () => {
      renderWithRouter(<DualCTA reversed={true} />);

      const primaryButton = screen.getByRole('link', { name: /take the pledge/i });
      expect(primaryButton).toBeInTheDocument();
      expect(primaryButton).toHaveAttribute('href', '/sign-pledge');
      // Primary button has bg-blue-500 class
      expect(primaryButton.className).toContain('bg-blue-500');
    });

    it('renders "Try a Clarity Meeting" as secondary link', () => {
      renderWithRouter(<DualCTA reversed={true} />);

      const links = screen.getAllByRole('link', { name: /try a clarity meeting/i });
      const secondaryLink = links[0];
      expect(secondaryLink).toBeInTheDocument();
      expect(secondaryLink).toHaveAttribute('href', '/live');
      // Secondary link does NOT have bg-blue-500 (it's a text link)
      expect(secondaryLink.className).not.toContain('bg-blue-500');
    });
  });

  describe('Size variants', () => {
    it('size="hero" applies larger button classes', () => {
      renderWithRouter(<DualCTA size="hero" />);

      const primaryButton = screen.getByRole('link', { name: /try a clarity meeting/i });
      expect(primaryButton.className).toContain('text-xl');
      expect(primaryButton.className).toContain('px-12');
      expect(primaryButton.className).toContain('py-8');
    });

    it('size="section" applies smaller button classes', () => {
      renderWithRouter(<DualCTA size="section" />);

      const primaryButton = screen.getByRole('link', { name: /try a clarity meeting/i });
      expect(primaryButton.className).toContain('text-base');
      expect(primaryButton.className).toContain('px-8');
      expect(primaryButton.className).toContain('py-4');
    });

    it('defaults to size="section" when not specified', () => {
      renderWithRouter(<DualCTA />);

      const primaryButton = screen.getByRole('link', { name: /try a clarity meeting/i });
      expect(primaryButton.className).toContain('text-base');
      expect(primaryButton.className).toContain('px-8');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to container', () => {
      const { container } = renderWithRouter(<DualCTA className="my-custom-class" />);

      const ctaContainer = container.querySelector('.my-custom-class');
      expect(ctaContainer).toBeInTheDocument();
    });
  });

  describe('Both CTAs are present', () => {
    it('renders both CTAs in default mode', () => {
      renderWithRouter(<DualCTA />);

      expect(screen.getByRole('link', { name: /try a clarity meeting/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /take the pledge/i })).toBeInTheDocument();
      expect(screen.getByText(/or/i)).toBeInTheDocument();
    });

    it('renders both CTAs in reversed mode', () => {
      renderWithRouter(<DualCTA reversed={true} />);

      expect(screen.getByRole('link', { name: /take the pledge/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /try a clarity meeting/i })).toBeInTheDocument();
      expect(screen.getByText(/or/i)).toBeInTheDocument();
    });
  });
});
