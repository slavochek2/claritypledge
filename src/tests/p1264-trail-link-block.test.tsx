/**
 * @file p1264-trail-link-block.test.tsx
 * @description P1264 — the hike's route link is a button below the description,
 * public (unlike the group chat), and absent (not hidden) when unset.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrailLinkBlock } from '@/app/prototypes/events/components/TrailLinkBlock';

describe('TrailLinkBlock', () => {
  it('renders a link with the given href for an https url', () => {
    render(<TrailLinkBlock url="https://www.alltrails.com/trail/example" />);
    const link = screen.getByTestId('trail-link');
    expect(link).toHaveAttribute('href', 'https://www.alltrails.com/trail/example');
  });

  it('drops a non-http scheme rather than rendering it as an href', () => {
    const { container } = render(<TrailLinkBlock url="javascript:alert(1)" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no url', () => {
    const { container } = render(<TrailLinkBlock url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sizes to its own label, not the full width of the page', () => {
    render(<TrailLinkBlock url="https://www.alltrails.com/trail/example" />);
    const link = screen.getByTestId('trail-link');
    expect(link.className).not.toMatch(/w-full/);
  });
});
