/**
 * @file person-row.test.tsx
 * @description Unit tests for PersonRow component.
 * Tests avatar rendering, name display, pledger status, and action states.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PersonRow } from '@/app/components/shared/PersonRow';

// Wrap component with router for Link components
function renderPersonRow(props: Parameters<typeof PersonRow>[0]) {
  return render(
    <BrowserRouter>
      <PersonRow {...props} />
    </BrowserRouter>
  );
}

describe('PersonRow', () => {
  const defaultProps = {
    profileId: 'test-123',
    slug: 'john-doe',
    name: 'John Doe',
    avatarColor: '#0044CC',
  };

  describe('basic rendering', () => {
    it('renders name as clickable link to profile', () => {
      renderPersonRow(defaultProps);

      const nameLink = screen.getByRole('link', { name: 'John Doe' });
      expect(nameLink).toBeInTheDocument();
      expect(nameLink).toHaveAttribute('href', '/p/john-doe');
    });

    it('renders avatar with link to profile', () => {
      renderPersonRow(defaultProps);

      // Avatar is wrapped in a link
      const links = screen.getAllByRole('link');
      const avatarLink = links.find(link => link.getAttribute('href') === '/p/john-doe');
      expect(avatarLink).toBeInTheDocument();
    });

    it('renders with custom avatar URL when provided', () => {
      renderPersonRow({
        ...defaultProps,
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      // Component should render without error
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  describe('pledger status', () => {
    it('passes isPledger to GravatarAvatar when true', () => {
      const { container } = renderPersonRow({
        ...defaultProps,
        isPledger: true,
      });

      // The pledger ring is rendered by GravatarAvatar
      // We verify the component renders without error with isPledger=true
      expect(container.querySelector('.ring-blue-500')).toBeInTheDocument();
    });

    it('does not show pledger ring when isPledger is false', () => {
      const { container } = renderPersonRow({
        ...defaultProps,
        isPledger: false,
      });

      expect(container.querySelector('.ring-blue-500')).not.toBeInTheDocument();
    });

    it('does not show pledger ring when isPledger is not provided', () => {
      const { container } = renderPersonRow(defaultProps);

      expect(container.querySelector('.ring-blue-500')).not.toBeInTheDocument();
    });
  });

  describe('action states', () => {
    it('shows "Going" badge when action is "going"', () => {
      renderPersonRow({
        ...defaultProps,
        action: 'going',
      });

      expect(screen.getByText('Going')).toBeInTheDocument();
    });

    it('shows "Attended" badge when action is "attended"', () => {
      renderPersonRow({
        ...defaultProps,
        action: 'attended',
      });

      expect(screen.getByText('Attended')).toBeInTheDocument();
    });

    it('shows no badge when action is "none"', () => {
      renderPersonRow({
        ...defaultProps,
        action: 'none',
      });

      expect(screen.queryByText('Going')).not.toBeInTheDocument();
      expect(screen.queryByText('Attended')).not.toBeInTheDocument();
    });

    it('shows no badge when action is not provided (defaults to "none")', () => {
      renderPersonRow(defaultProps);

      expect(screen.queryByText('Going')).not.toBeInTheDocument();
      expect(screen.queryByText('Attended')).not.toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has hover state styling on the row', () => {
      const { container } = renderPersonRow(defaultProps);

      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain('hover:border-blue-200');
    });

    it('applies correct badge styling for Going status', () => {
      renderPersonRow({
        ...defaultProps,
        action: 'going',
      });

      // The badge is a span containing the text and icon
      const badgeText = screen.getByText('Going');
      const badge = badgeText.closest('span');
      expect(badge?.className).toContain('bg-green-50');
      expect(badge?.className).toContain('text-green-700');
    });

    it('applies correct badge styling for Attended status', () => {
      renderPersonRow({
        ...defaultProps,
        action: 'attended',
      });

      // The badge is a span containing the text and icon
      const badgeText = screen.getByText('Attended');
      const badge = badgeText.closest('span');
      expect(badge?.className).toContain('bg-green-50');
      expect(badge?.className).toContain('text-green-700');
    });
  });
});
