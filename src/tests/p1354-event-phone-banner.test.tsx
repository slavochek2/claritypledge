import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';

describe('P1354: event phone banner', () => {
  it('renders the same single-<img> markup as before when no phone banner is given', () => {
    const { container } = render(
      <BannerDisplay bannerUrl="https://example.com/desktop.jpg" altText="Event" />
    );

    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/desktop.jpg');
    expect(imgs[0].className).not.toContain('hidden');
    expect(imgs[0].className).not.toContain('md:hidden');
  });

  it('renders a phone source only when mobileBannerUrl is given', () => {
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
      />
    );

    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs).toHaveLength(2);
    const mobileImg = imgs.find(img => img.src === 'https://example.com/mobile.jpg');
    const desktopImg = imgs.find(img => img.src === 'https://example.com/desktop.jpg');
    expect(mobileImg).toBeDefined();
    expect(desktopImg).toBeDefined();
  });

  it('ties the phone/desktop switch to the same md token driving the height class', () => {
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile.jpg"
        altText="Event"
        heightClassName="h-48 md:h-64"
      />
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('md:h-64');

    const imgs = Array.from(container.querySelectorAll('img'));
    const mobileImg = imgs.find(img => img.src === 'https://example.com/mobile.jpg')!;
    const desktopImg = imgs.find(img => img.src === 'https://example.com/desktop.jpg')!;
    // Same "md" breakpoint token used by the wrapper's height class governs image selection.
    expect(mobileImg.className).toContain('md:hidden');
    expect(desktopImg.className).toContain('hidden');
    expect(desktopImg.className).toContain('md:block');
  });

  it('does not show the phone variant when there is no desktop banner (host removed it)', () => {
    const { container } = render(
      <BannerDisplay bannerUrl={null} mobileBannerUrl="https://example.com/mobile.jpg" altText="Event" />
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Decorative banner"]')).not.toBeNull();
  });

  it('falls back to the gradient (not a broken-image icon) when the phone image 404s, without touching the desktop image', () => {
    const { container } = render(
      <BannerDisplay
        bannerUrl="https://example.com/desktop.jpg"
        mobileBannerUrl="https://example.com/mobile-broken.jpg"
        altText="Event"
      />
    );

    const mobileImg = Array.from(container.querySelectorAll('img')).find(
      img => img.src === 'https://example.com/mobile-broken.jpg'
    )!;
    fireEvent.error(mobileImg);

    const imgs = Array.from(container.querySelectorAll('img'));
    // Mobile slot now shows the fallback gradient, not a broken <img>.
    expect(imgs.find(img => img.src === 'https://example.com/mobile-broken.jpg')).toBeUndefined();
    // Desktop slot is untouched — its own error state was never set.
    const desktopImg = imgs.find(img => img.src === 'https://example.com/desktop.jpg');
    expect(desktopImg).toBeDefined();
    const mobileSlotFallback = container.querySelector('.md\\:hidden [aria-label="Decorative banner"]');
    expect(mobileSlotFallback).not.toBeNull();
  });
});
