/**
 * @file p1077-slider-track.test.tsx
 * @description P1077's SliderTrack changes are additive props only — free mode's
 * live consumer (free-mode-view.tsx) never passes them, so the defaults must
 * reproduce its exact prior output byte-for-byte: the "{value}/10" numeral and the
 * "Understanding rating" aria-label. This is the backward-compat proof the spec's
 * Risks section calls for ("`SliderTrack` has a live consumer").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SliderTrack } from '@/app/components/partners/slider-track';

describe('P1077 — SliderTrack backward compatibility (free mode defaults)', () => {
  it('renders the "{value}/10" numeral by default', () => {
    render(<SliderTrack value={7} onChange={vi.fn()} />);
    expect(screen.getByText('7/10')).toBeInTheDocument();
  });

  it('keeps the default aria-label "Understanding rating"', () => {
    render(<SliderTrack value={4} onChange={vi.fn()} />);
    expect(screen.getByRole('slider', { name: 'Understanding rating' })).toBeInTheDocument();
  });

  it('renders no midpoint tick when midpointLabel is not passed', () => {
    render(<SliderTrack value={5} onChange={vi.fn()} />);
    expect(screen.queryByText('Neutral')).not.toBeInTheDocument();
  });

  it('renders a solid (non-muted) thumb by default', () => {
    const { container } = render(<SliderTrack value={5} onChange={vi.fn()} />);
    const thumb = container.querySelector('.bg-blue-500.rounded-full.shadow-md');
    expect(thumb).not.toBeNull();
  });
});

describe('P1077 — SliderTrack new props (opt-in only)', () => {
  it('hides the numeral when showValue is false', () => {
    render(<SliderTrack value={7} onChange={vi.fn()} showValue={false} />);
    expect(screen.queryByText('7/10')).not.toBeInTheDocument();
  });

  it('overrides the aria-label when ariaLabel is passed', () => {
    render(
      <SliderTrack value={5} onChange={vi.fn()} ariaLabel="How much are you up for thinking?" />
    );
    expect(
      screen.getByRole('slider', { name: 'How much are you up for thinking?' })
    ).toBeInTheDocument();
  });

  it('renders the midpoint tick label when midpointLabel is passed', () => {
    render(<SliderTrack value={5} onChange={vi.fn()} midpointLabel="Neutral" />);
    expect(screen.getByText('Neutral')).toBeInTheDocument();
  });

  it('renders a hollow thumb and a grey fill when muted is true', () => {
    const { container } = render(
      <SliderTrack value={5} onChange={vi.fn()} muted />
    );
    const hollowThumb = container.querySelector('.bg-white.border-2.border-slate-300');
    expect(hollowThumb).not.toBeNull();
    expect(container.querySelector('.bg-blue-500.rounded-full.shadow-md')).toBeNull();
  });

  it('fills from the midpoint outward when bipolarFill is true', () => {
    const { container } = render(
      <SliderTrack value={8} onChange={vi.fn()} bipolarFill />
    );
    // 8/10 -> pct 80: fill starts at 50% and spans to 80% (width 30%), not
    // left-anchored at 0% (which would read as a unipolar progress bar).
    const fill = container.querySelector('[style*="left: 50%"]');
    expect(fill).not.toBeNull();
    expect(fill).toHaveStyle({ width: '30%' });
  });

  it('expands the vertical hit area without changing the visible track height when expandedHitArea is true', () => {
    const { container } = render(
      <SliderTrack value={5} onChange={vi.fn()} expandedHitArea />
    );
    const interactive = screen.getByRole('slider');
    expect(interactive.className).toContain('py-4');
    expect(interactive.className).toContain('-my-4');
    // The visible track (background box) keeps its original h-2.5 height —
    // only the invisible hit area around it grows.
    const visibleTrack = container.querySelector('.h-2\\.5');
    expect(visibleTrack).not.toBeNull();
  });
});
