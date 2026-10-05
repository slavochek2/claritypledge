/**
 * @file p1417-event-banner-small-copy.test.tsx
 * @description P1417 — event banners on phones request a small (800px WebP) copy stored next to
 * the original at a DERIVED path; wider screens get srcset; a failed load falls back to the
 * original and then to a neutral placeholder, never a broken-image icon. One <img> per viewport,
 * never <picture> (decisions.md 2026-09-22 [technical], P1354).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { bannerSmallUrl } from '@/lib/banner-small';
import { EventCard } from '@/app/prototypes/events/components/EventCard';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';
import type { EventWithHost } from '@/app/types';

const PROD = 'https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public';
const ORIGINAL = `${PROD}/event-banners/clarity-night-2-2026-10-06-ijjx-v5.png`;
const SMALL = `${ORIGINAL}.w800.webp`;
const AI_ORIGINAL = `${PROD}/banners/event/26462c57/772f76c2.jpg`;
const GCS = 'https://storage.googleapis.com/claritypledge-story-images/hikes/social-hike/banner-cac446-std.jpg';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeEvent(overrides: Partial<EventWithHost> = {}): EventWithHost {
  return {
    id: 'ev-1',
    slug: 'ev-1',
    title: 'Clarity Night 2',
    description: '',
    datetime: '2999-01-01T18:00:00Z',
    durationMinutes: 90,
    timezone: 'UTC',
    location: 'Somewhere',
    hostId: 'host-1',
    createdAt: '2026-09-01T00:00:00Z',
    status: 'upcoming',
    hostName: 'Host Person',
    hostSlug: 'host-person',
    bannerUrl: ORIGINAL,
    ...overrides,
  } as EventWithHost;
}

const renderCard = (event: EventWithHost, props: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <EventCard event={event} {...props} />
    </MemoryRouter>,
  );

afterEach(() => mockMatchMedia(false)); // the global default from src/tests/setup.tsx

describe('P1417: bannerSmallUrl — the small copy is derived, never stored', () => {
  it('event-banners objects get <path>.w800.webp in the same bucket', () => {
    expect(bannerSmallUrl(ORIGINAL)).toBe(SMALL);
  });

  it('AI banners under banners/event/ get one too', () => {
    expect(bannerSmallUrl(AI_ORIGINAL)).toBe(`${AI_ORIGINAL}.w800.webp`);
  });

  it('works for any Supabase host (test project, local)', () => {
    const test = 'https://gfjctyxqlwexxwsmkakq.supabase.co/storage/v1/object/public/event-banners/x.jpg';
    expect(bannerSmallUrl(test)).toBe(`${test}.w800.webp`);
    const local = 'http://127.0.0.1:54321/storage/v1/object/public/event-banners/a/b.jpeg';
    expect(bannerSmallUrl(local)).toBe(`${local}.w800.webp`);
  });

  it('keeps a query string after the derived path', () => {
    expect(bannerSmallUrl(`${ORIGINAL}?v=2`)).toBe(`${SMALL}?v=2`);
  });

  it('returns null where no small copy is ever made', () => {
    expect(bannerSmallUrl(GCS)).toBeNull(); // not our Supabase storage
    expect(bannerSmallUrl(`${PROD}/banners/story/abc/def.png`)).toBeNull(); // story/profile banners
    expect(bannerSmallUrl(`${PROD}/banners/profile/abc/def.png`)).toBeNull();
    expect(bannerSmallUrl(`${PROD}/event-banners/descriptions/x.png`)).toBeNull(); // description images
    expect(bannerSmallUrl(SMALL)).toBeNull(); // never a copy of a copy
    expect(bannerSmallUrl(`${PROD}/event-banners/x.gif`)).toBeNull();
    expect(bannerSmallUrl('https://example.com/desktop.jpg')).toBeNull();
    expect(bannerSmallUrl(null)).toBeNull();
    expect(bannerSmallUrl(undefined)).toBeNull();
    expect(bannerSmallUrl('')).toBeNull();
  });

  it('never derives a path that could step outside the original folder', () => {
    expect(bannerSmallUrl(`${PROD}/event-banners/../banners/story/x.png`)).toBeNull();
    expect(bannerSmallUrl(`${PROD}/event-banners/a/%2e%2e/x.png`)).toBeNull();
    expect(bannerSmallUrl(`${PROD}/event-banners/a//x.png`)).toBeNull();
    expect(bannerSmallUrl(`${PROD}/event-banners/a%2f..%2fx.png`)).toBeNull(); // encoded slash
    expect(bannerSmallUrl(`${PROD}/event-banners/a%2Fx.png`)).toBeNull();
    expect(bannerSmallUrl(`${PROD}/event-banners/a..b.png`)).toBe(`${PROD}/event-banners/a..b.png.w800.webp`);
  });
});

describe('P1417: EventCard banner', () => {
  it('phone: exactly one <img>, the small copy, with no srcset (a 3x phone would pick the original)', () => {
    mockMatchMedia(false);
    const { container } = renderCard(makeEvent());
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(SMALL);
    expect(imgs[0]!.hasAttribute('srcset')).toBe(false);
    expect(container.querySelector('picture')).toBeNull();
  });

  it('wide screen: small copy as src plus a srcset offering the original', () => {
    mockMatchMedia(true);
    const { container } = renderCard(makeEvent());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(SMALL);
    const srcset = img.getAttribute('srcset') ?? '';
    expect(srcset).toContain(`${SMALL} 800w`);
    expect(srcset).toContain(ORIGINAL);
    expect(img.getAttribute('sizes')).toBeTruthy();
  });

  it('a missing small copy falls back to the original, then to the grey placeholder — never a broken image', () => {
    mockMatchMedia(false);
    const { container } = renderCard(makeEvent());
    fireEvent.error(container.querySelector('img')!);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(ORIGINAL);
    expect(imgs[0]!.hasAttribute('srcset')).toBe(false);

    fireEvent.error(imgs[0]!);
    expect(container.querySelector('img')).toBeNull();
    const slot = container.querySelector('[data-testid="event-card-banner"]');
    expect(slot).not.toBeNull();
    expect(slot!.className).toContain('bg-muted');
  });

  it('wide screen: when srcset chose the ORIGINAL and it failed, it is not retried — placeholder', () => {
    mockMatchMedia(true);
    const { container } = renderCard(makeEvent());
    const img = container.querySelector('img')!;
    Object.defineProperty(img, 'currentSrc', { value: ORIGINAL }); // jsdom has no srcset selection
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-testid="event-card-banner"]')!.className).toContain('bg-muted');
  });

  it('wide screen: when srcset chose the small copy and it failed, the original is tried', () => {
    mockMatchMedia(true);
    const { container } = renderCard(makeEvent());
    const img = container.querySelector('img')!;
    Object.defineProperty(img, 'currentSrc', { value: SMALL });
    fireEvent.error(img);
    expect(container.querySelector('img')!.getAttribute('src')).toBe(ORIGINAL);
  });

  it('a banner with no derivable copy loads the original directly; failure keeps the placeholder', () => {
    mockMatchMedia(false);
    const { container } = renderCard(makeEvent({ bannerUrl: GCS }));
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(GCS);
    expect(img.hasAttribute('srcset')).toBe(false);
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-testid="event-card-banner"]')!.className).toContain('bg-muted');
  });

  it('the placeholder is there while loading too', () => {
    const { container } = renderCard(makeEvent());
    expect(container.querySelector('[data-testid="event-card-banner"]')!.className).toContain('bg-muted');
  });

  it('lazy + async decode by default; the caller can make it eager (above the fold)', () => {
    const { container, unmount } = renderCard(makeEvent());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    unmount();
    const eager = renderCard(makeEvent(), { bannerLoading: 'eager' });
    expect(eager.container.querySelector('img')!.getAttribute('loading')).toBe('eager');
  });
});

/** matchMedia that evaluates min-width / min-height clauses against a fake viewport. */
function mockViewport(width: number, height: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const clauses = [...query.matchAll(/\((min-width|min-height):\s*(\d+)px\)/g)];
    const matches = clauses.length > 0 && clauses.every(([, k, v]) => (k === 'min-width' ? width : height) >= Number(v));
    return {
      matches, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    };
  });
}

describe('P1417: which screens count as a phone', () => {
  it('a phone turned sideways (844x390) still gets only the small copy', () => {
    mockViewport(844, 390);
    const { container } = renderCard(makeEvent());
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(SMALL);
    expect(img.hasAttribute('srcset')).toBe(false);
  });

  it('a tablet (1024x768) and a laptop (1440x900) get the srcset', () => {
    for (const [w, h] of [[1024, 768], [1440, 900]] as const) {
      mockViewport(w, h);
      const { container, unmount } = renderCard(makeEvent());
      expect(container.querySelector('img')!.getAttribute('srcset') ?? '').toContain(ORIGINAL);
      unmount();
    }
  });
});

describe('P1417: BannerDisplay and BannerImage agree on what a phone is', () => {
  it('a phone turned sideways gets the PHONE banner, and its small copy (one rule, both components)', () => {
    mockViewport(844, 390);
    const mobile = `${PROD}/event-banners/x-mobile.jpg`;
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} mobileBannerUrl={mobile} altText="Event" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(`${mobile}.w800.webp`);
    expect(imgs[0]!.hasAttribute('srcset')).toBe(false);
  });

  it('a tablet (1024x768) gets the desktop banner with srcset', () => {
    mockViewport(1024, 768);
    const mobile = `${PROD}/event-banners/x-mobile.jpg`;
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} mobileBannerUrl={mobile} altText="Event" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(SMALL);
    expect(img.getAttribute('srcset') ?? '').toContain(ORIGINAL);
  });
});

describe('P1417: BannerDisplay (event detail)', () => {
  it('phone: requests the small copy of the banner', () => {
    mockMatchMedia(false);
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} altText="Event" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(SMALL);
    expect(imgs[0]!.hasAttribute('srcset')).toBe(false);
  });

  it('phone with a phone banner: requests the small copy of the PHONE banner', () => {
    mockMatchMedia(false);
    const mobile = `${PROD}/event-banners/x-mobile.jpg`;
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} mobileBannerUrl={mobile} altText="Event" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.getAttribute('src')).toBe(`${mobile}.w800.webp`);
  });

  it('desktop: srcset offers the sharp original; above the fold so eager + high priority', () => {
    mockMatchMedia(true);
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} altText="Event" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('srcset') ?? '').toContain(ORIGINAL);
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
  });

  it('small copy fails → original; original fails → the existing gradient fallback, no <img>', () => {
    mockMatchMedia(false);
    const { container } = render(<BannerDisplay bannerUrl={ORIGINAL} altText="Event" />);
    fireEvent.error(container.querySelector('img')!);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(ORIGINAL);
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[aria-label="Decorative banner"]')).not.toBeNull();
  });
});
