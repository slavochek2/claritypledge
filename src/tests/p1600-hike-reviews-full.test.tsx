/** P1600: a review reads to its last word, whatever the number of reviews. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeriesReviews } from '@/app/prototypes/events/hike/HikeSections';

const review = (id: string) => ({ id, quote: `Quote ${id}`, authorName: `Author ${id}` });

describe('P1600 hike reviews show in full', () => {
  it('never clamps a quote when there are several reviews', () => {
    render(<MemoryRouter><SeriesReviews reviews={[review('a'), review('b')] as never} /></MemoryRouter>);
    expect(screen.getByText('Quote a').className).not.toContain('line-clamp');
    expect(screen.getByText('Quote b').className).not.toContain('line-clamp');
  });

  describe('arrows', () => {
    afterEach(() => vi.restoreAllMocks());
    const overflowing = (scrollLeft: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
      vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockReturnValue(scrollLeft);
    };
    const show = () => render(<MemoryRouter><SeriesReviews reviews={[review('a'), review('b')] as never} /></MemoryRouter>);

    it('at the start, only forward is available and it scrolls the row', () => {
      overflowing(0);
      show();
      const scrollBy = vi.fn();
      screen.getByTestId('hike-reviews').querySelector('ul')!.scrollBy = scrollBy;
      expect(screen.getByRole('button', { name: 'Previous reviews' }).getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: 'More reviews' }));
      expect(scrollBy).toHaveBeenCalledTimes(1);
    });

    it('shows no arrows when everything fits', () => {
      show();
      expect(screen.queryByRole('button', { name: 'More reviews' })).toBeNull();
    });

    it('at the end, forward stays focusable but is marked unavailable', () => {
      overflowing(700);
      show();
      expect(screen.getByRole('button', { name: 'More reviews' }).getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByRole('button', { name: 'Previous reviews' }).getAttribute('aria-disabled')).toBe('false');
    });
  });
});
