import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getPositionVerb } from '@/app/prototypes/linkedin-like/components/shared/PositionBadge';
import { PointCard } from '@/app/prototypes/linkedin-like/components/PointCard';
import type { Point, PositionType } from '@/app/prototypes/shared/types';

// Mock react-router-dom navigate
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock the data module
vi.mock('@/app/prototypes/linkedin-like/data/mock-data', () => ({
  getStoriesForPoint: () => [],
  getPointPositionCounts: () => ({ agree: 2, disagree: 1, unsure: 0 }),
  getUserById: (id: string) => id === 'user-1' ? { id: 'user-1', name: 'Jordan Taylor', role: 'Engineer', hasPledged: true } : null,
  getUserCredibilityStats: () => ({ ear: 3, mic: 1 }),
  currentUser: { id: 'current', name: 'Current User' },
}));

describe('P103: Point Quote Pattern', () => {
  describe('T1: getPositionVerb helper', () => {
    it('returns lowercase verb for "agree"', () => {
      expect(getPositionVerb('agree')).toBe('agrees');
    });

    it('returns lowercase verb for "strongly_agree"', () => {
      expect(getPositionVerb('strongly_agree')).toBe('strongly agrees');
    });

    it('returns lowercase verb for "disagree"', () => {
      expect(getPositionVerb('disagree')).toBe('disagrees');
    });

    it('returns lowercase verb for "unsure"', () => {
      expect(getPositionVerb('unsure')).toBe('unsure');
    });

    it('returns lowercase verb for all 7 position types', () => {
      const positions: PositionType[] = [
        'strongly_agree',
        'agree',
        'somewhat_agree',
        'unsure',
        'somewhat_disagree',
        'disagree',
        'strongly_disagree',
      ];

      positions.forEach(position => {
        const verb = getPositionVerb(position);
        expect(typeof verb).toBe('string');
        expect(verb.length).toBeGreaterThan(0);
        // Should be lowercase
        expect(verb).toBe(verb.toLowerCase());
      });
    });
  });

  describe('T2: PointCard profile context - quote pattern', () => {
    const mockPoint: Point = {
      id: 'point-1',
      text: 'Remote work is more productive than office work',
      createdAt: new Date().toISOString(),
      positions: {
        'user-1': { position: 'agree', timestamp: new Date().toISOString() },
      },
    };

    it('shows position label OUTSIDE quoted box when profileOwnerId is set', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} profileOwnerId="user-1" />
        </MemoryRouter>
      );

      // Position label should be outside the quoted box
      // Format: "Jordan Taylor" name + "Agrees" badge (PositionBadge with capitalized label)
      expect(screen.getByText('Jordan Taylor')).toBeInTheDocument();
      expect(screen.getByText('Agrees')).toBeInTheDocument();
    });

    it('wraps Point content in a quoted box (bg-gray-50) when profileOwnerId is set', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} profileOwnerId="user-1" />
        </MemoryRouter>
      );

      // The Point text should be inside a quoted box container
      const pointText = screen.getByText('Remote work is more productive than office work');
      const quotedBox = pointText.closest('.bg-gray-50');
      expect(quotedBox).toBeInTheDocument();
    });

    it('does NOT show pin icon column when profileOwnerId is set (cleaner hierarchy)', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} profileOwnerId="user-1" />
        </MemoryRouter>
      );

      // Pin icon column (rounded circle) should not exist - the quote pattern replaces it
      // Note: .bg-blue-100 exists in position badge, so we check for the specific pin circle
      const pinIconCircle = document.querySelector('.w-10.h-10.rounded-full.bg-blue-100');
      expect(pinIconCircle).not.toBeInTheDocument();
    });

    it('shows ear count with position label', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} profileOwnerId="user-1" />
        </MemoryRouter>
      );

      // Ear count should appear near the position label
      expect(screen.getByText('3')).toBeInTheDocument(); // ear count from mock
    });

    it('keeps position buttons inside the quoted box', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} profileOwnerId="user-1" />
        </MemoryRouter>
      );

      // Position buttons (Agree, Disagree, Unsure) should be inside the quoted box
      const quotedBox = document.querySelector('.bg-gray-50.border.rounded-lg');
      expect(quotedBox).toBeInTheDocument();

      const agreeButton = screen.getByText('Agree');
      expect(quotedBox?.contains(agreeButton)).toBe(true);
    });

    it('does NOT show quote pattern when profileOwnerId is NOT set (feed view)', () => {
      render(
        <MemoryRouter>
          <PointCard point={mockPoint} />
        </MemoryRouter>
      );

      // Without profileOwnerId, should NOT show the position label outside
      // (No position badge with "agrees" text)
      const positionBadge = document.querySelector('.bg-blue-100.text-blue-700');
      expect(positionBadge).not.toBeInTheDocument();

      // Should still show the pin icon column (rounded circle) in feed view
      const pinIconCircle = document.querySelector('.w-10.h-10.rounded-full.bg-blue-100');
      expect(pinIconCircle).toBeInTheDocument();
    });
  });
});
