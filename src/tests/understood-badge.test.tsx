/**
 * P584: UnderstoodBadge component tests
 *
 * Tests the shared UnderstoodBadge component that replaces
 * 4 duplicate pill implementations across story cards.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnderstoodBadge } from '@/components/ui/understood-badge';

describe('UnderstoodBadge', () => {
  it('renders with count=0 and shows "0 verified"', () => {
    render(<UnderstoodBadge count={0} />);
    expect(screen.getByText('0 verified')).toBeTruthy();
  });

  it('renders with positive count', () => {
    render(<UnderstoodBadge count={3} />);
    expect(screen.getByText('3 verified')).toBeTruthy();
  });

  it('renders ear icon on all counts', () => {
    const { container } = render(<UnderstoodBadge count={0} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies size="xs" variant', () => {
    render(<UnderstoodBadge count={1} size="xs" />);
    const badge = screen.getByText('1 verified');
    expect(badge.className).toContain('text-xs');
  });

  it('applies default size="sm" variant', () => {
    render(<UnderstoodBadge count={1} />);
    const badge = screen.getByText('1 verified');
    expect(badge.className).toContain('text-sm');
  });

  it('applies custom className', () => {
    render(<UnderstoodBadge count={0} className="mt-4" />);
    const badge = screen.getByText('0 verified');
    expect(badge.className).toContain('mt-4');
  });

  it('handles large counts', () => {
    render(<UnderstoodBadge count={999} />);
    expect(screen.getByText('999 verified')).toBeTruthy();
  });
});
