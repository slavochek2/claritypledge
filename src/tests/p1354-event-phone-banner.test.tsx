import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';

// Same convention as p909-cm-fullscreen-layout.test.tsx.
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

describe('P1354: event phone banner', () => {
  afterEach(() => {
    mockMatchMedia(false); // restore the global default from src/tests/setup.tsx
  });

  it('renders the same single-<img> markup as before when no phone banner is given', () => {
    const { container } = render(
      <BannerDisplay bannerUrl="https://example.com/desktop.jpg" altText="Event" />
    );

    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/desktop.jpg');
  });

  it('mounts only the mobile <img> at mobile viewport when a phone banner is given', () => {
    mockMatchMedia(false); // below md
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );

    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/mobile.jpg');
  });

  it('mounts only the desktop <img> at desktop viewport when a phone banner is given', () => {
    mockMatchMedia(true); // at/above md
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );

    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/desktop.jpg');
  });

  it('never has both banners in the DOM at once — only the matching viewport image is fetched', () => {
    mockMatchMedia(false);
    const { container: mobileContainer } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );
    expect(mobileContainer.querySelector('img[src="https://example.com/desktop.jpg"]')).toBeNull();

    mockMatchMedia(true);
    const { container: desktopContainer } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );
    expect(desktopContainer.querySelector('img[src="https://example.com/mobile.jpg"]')).toBeNull();
  });

  it('does not show the phone variant when there is no desktop banner (host removed it)', () => {
    mockMatchMedia(false);
    const { container } = render(
      <BannerDisplay bannerUrl={null} mobileBannerUrl="https://example.com/mobile.jpg" altText="Event" />
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Decorative banner"]')).not.toBeNull();
  });

  it('falls back to the gradient (not a broken-image icon) when the phone image 404s', () => {
    mockMatchMedia(false);
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile-broken.jpg"
        altText="Event"
      />
    );

    const mobileImg = container.querySelector('img')!;
    fireEvent.error(mobileImg);

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Decorative banner"]')).not.toBeNull();
  });

  it('a broken desktop image cannot affect the mobile viewport — the desktop <img> is not even mounted there (P1354 finding #1)', () => {
    mockMatchMedia(false); // mobile viewport — the desktop <img> is structurally absent
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop-broken.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );

    // Only the mobile image exists to fail — there is nothing to fire an error on for desktop.
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/mobile.jpg');
  });
});
