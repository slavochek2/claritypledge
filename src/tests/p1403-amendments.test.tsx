/**
 * P1403 founder amendments (2026-10-04):
 * 1. description links — only a link alone on its line is a chip (.link-chip);
 * 2. reviewer identity — avatar (pledge ring) + plain name link, never a button;
 * 3. hike banner — taller desktop banner for hike-layout events only.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderEventDescription } from '@/lib/markdown';
import { SeriesReviews } from '@/app/prototypes/events/hike/HikeSections';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('P1403 amendment 1: description link chips', () => {
  it('a link inside a sentence is a plain link — no chip class', () => {
    const html = renderEventDescription('Meet at the gate, a [24 minute walk](https://maps.example/x) from town.');
    expect(html).toContain('<a href="https://maps.example/x"');
    expect(html).not.toContain('link-chip');
  });

  it('a paragraph that is only a link gets the chip class', () => {
    const html = renderEventDescription('Some text.\n\n[View hike on AllTrails](https://alltrails.example/t)');
    expect(html).toContain('<a class="link-chip" href="https://alltrails.example/t"');
  });

  it('several links one per line in one paragraph are all chips', () => {
    const html = renderEventDescription('[Directions](https://a.example)\n[Route](https://b.example)');
    expect(html.match(/class="link-chip"/g)).toHaveLength(2);
  });

  it('a link inside italics is not a chip', () => {
    expect(renderEventDescription('*PS: see [my blog](https://c.example)*')).not.toContain('link-chip');
  });

  it('chip CSS is scoped to a.link-chip; the bare anchor rule is a plain underlined link', () => {
    const css = R('src/index.css');
    expect(css).toMatch(/\.event-description a\.link-chip \{\s*display: inline-flex/);
    expect(css).not.toMatch(/\.event-description a \{\s*display: inline-flex/);
    expect(css).toMatch(/\.event-description a \{\s*color: hsl\(var\(--foreground\)\);[^}]*text-decoration: underline/);
  });
});

describe('P1403 amendment 2: reviewer identity', () => {
  const renderReviews = (r: Parameters<typeof SeriesReviews>[0]['reviews']) =>
    render(<MemoryRouter><SeriesReviews reviews={r} /></MemoryRouter>);

  it('renders the linked profile as a 40px avatar with pledge ring and a plain name link', () => {
    renderReviews([{
      id: 'a', quote: 'Great hike', authorName: 'Mariana (text)',
      author: { name: 'Mariana', slug: 'mariana', hasPledged: true, avatarUrl: null },
    }]);
    const avatar = screen.getByTestId('person-avatar');
    expect(avatar.innerHTML).toMatch(/w-10 h-10/);
    const link = screen.getByRole('link', { name: 'Mariana' });
    expect(link.getAttribute('href')).toBe('/p/mariana');
    expect(screen.queryByRole('button')).toBeNull();
    expect(link.className).not.toMatch(/rounded-full|bg-foreground|bg-black/);
  });

  it('falls back to the author_name text with no avatar when no profile is linked', () => {
    renderReviews([{ id: 'b', quote: 'Nice', authorName: 'Guest Walker' }]);
    expect(screen.queryByTestId('person-avatar')).toBeNull();
    expect(screen.getByTestId('hike-review-author').textContent).toContain('Guest Walker');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('service joins only already-public profile columns via the new FK', () => {
    const svc = R('src/app/data/events-service-real.ts');
    expect(svc).toContain('author:profiles!series_reviews_author_profile_id_fkey (name, slug, avatar_color, avatar_url, has_pledged, ears_count)');
    const mig = R('supabase/migrations/20261004140000_p1403_review_author_profile.sql');
    expect(mig).toMatch(/author_profile_id uuid\s+REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
    const sql = mig.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/GRANT|POLICY/);
  });
});

describe('P1403 amendment 3: hike banner height', () => {
  const heightOf = (el: HTMLElement) => el.firstElementChild as HTMLElement;

  it('a non-hike event keeps the default banner height', () => {
    const { container } = render(<BannerDisplay altText="x" heightClassName={undefined} />);
    expect(heightOf(container).className).toContain('h-48 md:h-64');
  });

  it('a hike uses the standard banner height too (founder 2026-10-04: retain the standard)', () => {
    expect(R('src/app/prototypes/events/components/EventDetail.tsx')).not.toMatch(/heightClassName=/);
  });
});

describe('P1403: map + reviews sit inside the description route section (founder 2026-10-04)', () => {
  it('splits after the first h2 section whose heading mentions route', async () => {
    const { splitAfterRouteSection } = await import('@/app/prototypes/events/hike/hike-utils');
    const html = '<p>Intro</p><h2>The route</h2><p>Loop</p><h2>Where we meet</h2><p>Cafe</p>';
    expect(splitAfterRouteSection(html)).toEqual({ before: '<p>Intro</p><h2>The route</h2><p>Loop</p>', after: '<h2>Where we meet</h2><p>Cafe</p>', matched: true });
  });
  it('keeps the whole description first when there is no route heading', async () => {
    const { splitAfterRouteSection } = await import('@/app/prototypes/events/hike/hike-utils');
    expect(splitAfterRouteSection('<h2>Plan</h2><p>x</p>')).toEqual({ before: '<h2>Plan</h2><p>x</p>', after: '', matched: false });
    expect(splitAfterRouteSection('<h2>The route</h2><p>x</p>').matched).toBe(true);
  });
});
