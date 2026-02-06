/**
 * @file person-avatar.test.tsx
 * @description Unit tests for PersonAvatar component (P118).
 * Tests that pledge badge (blue ring) displays consistently.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonAvatar } from '@/components/ui/person-avatar';
import type { PersonRef } from '@/app/types';

const mockPerson: PersonRef = {
  name: 'Jane Doe',
  slug: 'jane-doe',
  avatarColor: '#FF5733',
  avatarUrl: null,
  hasPledged: false,
};

describe('PersonAvatar', () => {
  describe('pledge badge (blue ring)', () => {
    it('shows blue ring when person has pledge', () => {
      const { container } = render(
        <PersonAvatar person={{ ...mockPerson, hasPledged: true }} />
      );

      // The ring class is applied by GravatarAvatar
      expect(container.querySelector('.ring-blue-500')).toBeInTheDocument();
    });

    it('shows no ring when person has no pledge', () => {
      const { container } = render(
        <PersonAvatar person={{ ...mockPerson, hasPledged: false }} />
      );

      expect(container.querySelector('.ring-blue-500')).not.toBeInTheDocument();
    });
  });

  describe('avatar color fallback', () => {
    it('uses default color when avatarColor not provided', () => {
      // Should render without error, using #3B82F6 default
      render(
        <PersonAvatar person={{ name: 'Test', hasPledged: false }} />
      );

      // Component renders with fallback color - verify it doesn't crash
      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
    });

    it('uses provided avatarColor when specified', () => {
      render(
        <PersonAvatar person={{ ...mockPerson, avatarColor: '#123456' }} />
      );

      // Component renders - specific color is applied as inline style
      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('renders small size', () => {
      render(<PersonAvatar person={mockPerson} size="sm" />);
      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
    });

    it('renders medium size (default)', () => {
      render(<PersonAvatar person={mockPerson} />);
      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
    });

    it('renders large size', () => {
      render(<PersonAvatar person={mockPerson} size="lg" />);
      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
    });
  });

  describe('avatar image', () => {
    it('renders with photo URL when provided', () => {
      render(
        <PersonAvatar
          person={{
            ...mockPerson,
            avatarUrl: 'https://example.com/avatar.jpg',
          }}
        />
      );

      const img = screen.getByRole('img', { name: "Jane Doe's avatar" });
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('renders initials when no photo URL', () => {
      render(<PersonAvatar person={{ ...mockPerson, avatarUrl: null }} />);

      // GravatarAvatar shows initials when no photo
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('className prop', () => {
    it('passes custom className to GravatarAvatar', () => {
      const { container } = render(
        <PersonAvatar person={mockPerson} className="custom-class" />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });
});
