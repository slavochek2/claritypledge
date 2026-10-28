/**
 * P1586: the story page's loading placeholder is drawn from the shared Skeleton primitive and
 * announces itself once (the blocks are aria-hidden; the card carries the status).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoryDetailSkeleton } from '@/app/pages/story-detail-skeleton';

describe('StoryDetailSkeleton', () => {
  it('announces one loading status for screen readers', () => {
    render(<StoryDetailSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading story' })).toBeInTheDocument();
  });

  it('draws every block from the shared primitive and hides the blocks from assistive tech', () => {
    const { container } = render(<StoryDetailSkeleton />);
    const blocks = container.querySelectorAll('.animate-pulse');
    expect(blocks.length).toBe(7);
    blocks.forEach((b) => {
      expect(b).toHaveAttribute('aria-hidden', 'true');
      expect(b.className).toContain('bg-muted');
    });
  });

  it('never shows loading text or a large mark', () => {
    const { container } = render(<StoryDetailSkeleton />);
    expect(container.textContent).not.toMatch(/Loading/);
    expect(container.querySelector('svg[aria-label="Loading"]')).toBeNull();
  });
});
