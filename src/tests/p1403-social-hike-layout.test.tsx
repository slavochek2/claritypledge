/**
 * @file p1403-social-hike-layout.test.tsx
 * @description P1403 — Social Hike event layout. Sections render from structured data,
 * each hides on its own when its data is absent, reviews stay compact, and the layout is
 * selected by the stored series key, never the title. Non-hike events render no hike section
 * and make no series request (asserted at component level plus EventDetail source shape,
 * following the p1194 convention).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIKE_LABELS,
  SOCIAL_HIKE_SERIES,
  isHikeLayout,
  parseHikeDetails,
  extractRouteGeometry,
  projectRoute,
  safeInternalPath,
} from '@/app/prototypes/events/hike/hike-utils';
import { HikeStatsStrip, PastHikePhotos, SeriesReviews, HikeRouteMap } from '@/app/prototypes/events/hike/HikeSections';
import { publicMediaUrl } from '@/lib/public-media';
import type { SeriesReview, SeriesPhoto } from '@/app/types';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const DETAIL = R('src/app/prototypes/events/components/EventDetail.tsx');
const MIGRATION = R('supabase/migrations/20261004093000_p1403_social_hike_series.sql');

const FULL_DETAILS = {
  distance_km: 11.7,
  elevation_gain_m: 539,
  route_type: 'Loop',
  walk_time_text: '4–4.5 h',
  difficulty: 'Moderate',
  meet_walk_minutes: 12,
  meet_walk_url: 'https://www.openstreetmap.org/directions?route=1',
};

const ROUTE = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[13.10, 52.40], [13.12, 52.41], [13.15, 52.40], [13.10, 52.40]] } },
    { type: 'Feature', properties: { kind: 'meet' }, geometry: { type: 'Point', coordinates: [13.09, 52.395] } },
  ],
};

const reviews = (n: number): SeriesReview[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, quote: `Review number ${i}`, authorName: `Person ${i}` }));

const photo = (id: string, path = `hikes/${id}.jpg`): SeriesPhoto => ({ id, storageUrl: publicMediaUrl(path), alt: `Photo ${id}` });

describe('P1403: layout selection by series key', () => {
  it('selects the hike layout only for series_slug = social-hike', () => {
    expect(isHikeLayout({ seriesSlug: SOCIAL_HIKE_SERIES })).toBe(true);
    expect(isHikeLayout({ seriesSlug: undefined })).toBe(false);
    expect(isHikeLayout({ seriesSlug: 'clarity-night' })).toBe(false);
    expect(isHikeLayout(null)).toBe(false);
  });

  it('a title alone never selects the layout — the predicate takes no title', () => {
    const titled = { title: 'Social Hike: Grunewald', seriesSlug: undefined } as unknown as { seriesSlug?: string };
    expect(isHikeLayout(titled)).toBe(false);
    // EventDetail gates every hike section on the series key, never on the title.
    expect(DETAIL).toMatch(/const hikeSeriesSlug = isHikeLayout\(event\)/);
    expect(DETAIL).not.toMatch(/title[^\n]*(Social Hike|startsWith)/);
  });

  it('every hike section in EventDetail is gated on hikeSeriesSlug, and the series fetch is too', () => {
    for (const comp of ['<HikeStatsStrip', '<PastHikePhotos', '<HikeRouteMap', '<SeriesReviews']) {
      const line = DETAIL.split('\n').find(l => l.includes(comp));
      expect(line, comp).toBeDefined();
      expect(line, comp).toMatch(/hikeSeriesSlug &&/);
    }
    const effect = DETAIL.slice(DETAIL.indexOf('const hikeSeriesSlug'), DETAIL.indexOf('// Local action states'));
    expect(effect).toMatch(/if \(!hikeSeriesSlug\)[\s\S]*return;[\s\S]*getSeriesContent\(hikeSeriesSlug\)/);
  });

  it('does not change how the group chat link is fetched (P1194 invariant)', () => {
    expect(DETAIL.match(/eventsService\.getEventGroupChatUrl\(/g)?.length).toBe(1);
    const effect = DETAIL.slice(DETAIL.indexOf('const hikeSeriesSlug'), DETAIL.indexOf('// Local action states'));
    expect(effect).not.toMatch(/group_?chat|event_private_info/i);
  });

  it('migration backfills by title once and keys reviews/photos by series_slug with read-only RLS', () => {
    expect(MIGRATION).toMatch(/SET series_slug = 'social-hike'[\s\S]*ILIKE 'Social Hike%'[\s\S]*ILIKE 'Clarity Hike%'/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.series_reviews FROM PUBLIC, anon, authenticated;\s*GRANT SELECT ON public\.series_reviews TO anon, authenticated;/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.series_photos FROM PUBLIC, anon, authenticated;\s*GRANT SELECT ON public\.series_photos TO anon, authenticated;/);
    expect(MIGRATION).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
  });
});

describe('P1403: stats strip', () => {
  it('renders every stat from structured fields', () => {
    render(<HikeStatsStrip details={FULL_DETAILS} />);
    const strip = screen.getByTestId('hike-stats');
    expect(strip.textContent).toContain('11.7 km');
    expect(strip.textContent).toContain('539 m');
    expect(strip.textContent).toContain('Loop');
    expect(strip.textContent).toContain('4–4.5 h');
    expect(strip.textContent).toContain('Moderate');
    const walk = screen.getByRole('link', { name: '12 min walk' });
    expect(walk.getAttribute('href')).toBe(FULL_DETAILS.meet_walk_url);
  });

  it('hides with no details, an empty object, or malformed values', () => {
    for (const d of [undefined, null, {}, [], 'x', { distance_km: 'eleven', route_type: '' }]) {
      const { container, unmount } = render(<HikeStatsStrip details={d} />);
      expect(container.innerHTML, JSON.stringify(d)).toBe('');
      unmount();
    }
  });

  it('renders only the stats present, and never a javascript: walk link', () => {
    render(<HikeStatsStrip details={{ distance_km: 8, meet_walk_minutes: 5, meet_walk_url: 'javascript:alert(1)' }} />);
    const strip = screen.getByTestId('hike-stats');
    expect(strip.querySelectorAll('[data-stat]')).toHaveLength(2);
    expect(strip.textContent).toContain('8 km');
    expect(strip.querySelector('a')).toBeNull();
  });

  it('parseHikeDetails rejects negative / non-finite numbers', () => {
    expect(parseHikeDetails({ distance_km: -1, elevation_gain_m: Infinity })).toBeNull();
  });
});

describe('P1403: past-hike photos', () => {
  it('renders a scroll-snap strip with the section label', () => {
    render(<PastHikePhotos photos={['a', 'b', 'c', 'd'].map(id => photo(id))} />);
    const section = screen.getByTestId('hike-photos');
    expect(section.textContent).toContain(HIKE_LABELS.photos);
    expect(section.querySelectorAll('img')).toHaveLength(4);
    const ul = section.querySelector('ul')!;
    expect(ul.className).toMatch(/overflow-x-auto/);
    expect(ul.className).toMatch(/snap-x/);
    // contributes no min-content to the column: the strip cannot widen the page
    expect(section.className).toMatch(/\bw-0\b/);
    expect(section.className).toMatch(/\bmin-w-full\b/);
  });

  it('hides with no photos', () => {
    const { container } = render(<PastHikePhotos photos={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('drops photos not on the public media host (prod CSP), hiding when none remain', () => {
    const { container } = render(
      <PastHikePhotos photos={[{ id: 'x', storageUrl: 'https://evil.example/a.jpg', alt: 'x' }]} />
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('P1403: reviews', () => {
  const renderReviews = (r: SeriesReview[]) => render(<MemoryRouter><SeriesReviews reviews={r} /></MemoryRouter>);

  it('hides with no reviews', () => {
    const { container } = renderReviews([]);
    expect(container.innerHTML).toBe('');
  });

  it('shows the first 2 of 6, then expands and collapses', () => {
    renderReviews(reviews(6));
    expect(screen.getAllByTestId('hike-review')).toHaveLength(2);
    const btn = screen.getByRole('button', { name: 'Show 4 more' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    // collapsed quotes are clamped — keeps 6 reviews compact at 375px
    expect(screen.getAllByTestId('hike-review')[0].querySelector('blockquote')!.className).toMatch(/line-clamp-4/);
    fireEvent.click(btn);
    expect(screen.getAllByTestId('hike-review')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: HIKE_LABELS.showFewerReviews }));
    expect(screen.getAllByTestId('hike-review')).toHaveLength(2);
  });

  it('shows no "more" button when everything fits', () => {
    renderReviews(reviews(2));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('links the author only to a safe in-app profile path', () => {
    renderReviews([
      { id: 'a', quote: 'Lovely', authorName: 'Linked', authorProfilePath: '/p/linked-person' },
      { id: 'b', quote: 'Nice', authorName: 'Unsafe', authorProfilePath: '//evil.example/p' },
    ]);
    expect(screen.getByRole('link', { name: 'Linked' }).getAttribute('href')).toBe('/p/linked-person');
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
    expect(safeInternalPath('https://x.example')).toBeUndefined();
  });
});

describe('P1403: route map', () => {
  it('draws the route as SVG with OSM attribution and markers, no external image', () => {
    const { container } = render(<HikeRouteMap geojson={ROUTE} />);
    const section = screen.getByTestId('hike-route');
    expect(section.querySelectorAll('svg path')).toHaveLength(1);
    expect(section.querySelector('[data-marker="start"]')).not.toBeNull();
    expect(section.querySelector('[data-marker="meet"]')).not.toBeNull();
    expect(section.textContent).toContain('© OpenStreetMap contributors');
    expect(container.querySelector('img')).toBeNull();
  });

  it('hides with no geometry, an empty collection, or a degenerate line', () => {
    for (const g of [undefined, null, {}, { type: 'FeatureCollection', features: [] }, { type: 'LineString', coordinates: [[13, 52]] }]) {
      const { container, unmount } = render(<HikeRouteMap geojson={g} />);
      expect(container.innerHTML, JSON.stringify(g)).toBe('');
      unmount();
    }
  });

  it('projects inside the viewBox', () => {
    const geo = extractRouteGeometry(ROUTE)!;
    const p = projectRoute(geo, 320, 200);
    const nums = p.paths[0].match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(0);
      expect(nums[i]).toBeLessThanOrEqual(320);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
      expect(nums[i + 1]).toBeLessThanOrEqual(200);
    }
  });
});
