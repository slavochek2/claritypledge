/**
 * P1453: the "after <artist>" signature on profile banners — when it shows, how it discloses,
 * and that stored credit data is validated before it reaches the DOM.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';
import { parseBannerCredit, creditForBanner, type BannerCredit } from '@/lib/banner-credit';
import { mapProfileFromDb } from '@/app/data/api';

const URL_A = 'https://x.supabase.co/storage/v1/object/public/banners/profile/u1/a.png';
const URL_B = 'https://x.supabase.co/storage/v1/object/public/banners/profile/u1/b.png';
const CREDIT: BannerCredit = { url: URL_A, artist: 'Katsushika Hokusai', sig: 'Hokusai', movement: 'Ukiyo-e', ink: 'cream' };

/** Render, then let every banner <img> finish loading (the signature waits for the art). */
function renderLoaded(ui: React.ReactElement) {
  const r = render(ui);
  for (const img of document.querySelectorAll('img')) fireEvent.load(img);
  return r;
}

function setDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

describe('P1453 banner signature: when it shows', () => {
  beforeEach(() => setDesktop(true));

  it('shows "after <sig>" over a credited banner', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    expect(screen.getByTestId('banner-credit')).toHaveTextContent('after Hokusai');
  });

  it('shows nothing until the banner image has loaded (never over the placeholder)', () => {
    render(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
    fireEvent.load(screen.getByRole('img'));
    expect(screen.getByTestId('banner-credit')).toBeInTheDocument();
  });

  it('shows nothing for a credit that belongs to a different banner (removed or replaced)', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_B} altText="alt" credit={CREDIT} />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
  });

  it('shows nothing on the gradient fallback (no banner)', () => {
    renderLoaded(<BannerDisplay bannerUrl={null} altText="alt" credit={CREDIT} />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
  });

  it('shows nothing while a banner is generating', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} aria-busy />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
  });

  it('shows nothing without a credit (events, stories) — the component is unchanged for them', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
  });

  it('shows nothing over the hand-set phone banner, which is a different picture', () => {
    setDesktop(false);
    renderLoaded(<BannerDisplay bannerUrl={URL_A} mobileBannerUrl={URL_B} altText="alt" credit={CREDIT} />);
    expect(screen.queryByTestId('banner-credit')).toBeNull();
  });

  it('keeps showing on desktop when a phone banner also exists', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} mobileBannerUrl={URL_B} altText="alt" credit={CREDIT} />);
    expect(screen.getByTestId('banner-credit')).toBeInTheDocument();
  });
});

describe('P1453 banner signature: ink and disclosure', () => {
  beforeEach(() => setDesktop(true));

  it('uses the stored ink, mapped to a static class', () => {
    const { rerender } = renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    expect(screen.getByTestId('banner-credit')).toHaveAttribute('data-ink', 'cream');
    expect(screen.getByTestId('banner-credit').className).toContain('text-[#fff8e7]');
    rerender(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={{ ...CREDIT, ink: 'sepia' }} />);
    expect(screen.getByTestId('banner-credit').className).toContain('text-[#2a1e14]');
  });

  it('carries the AI disclosure in its accessible name, without hovering', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    expect(screen.getByRole('button', { name: /after Hokusai — AI-generated image after Katsushika Hokusai/ })).toBeInTheDocument();
  });

  it('opens the disclosure on tap (touch has no hover) and closes on a second tap', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    const btn = screen.getByTestId('banner-credit');
    expect(screen.queryByText('AI-generated image after Katsushika Hokusai')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText('AI-generated image after Katsushika Hokusai')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('AI-generated image after Katsushika Hokusai')).toBeNull();
  });

  it('opens the disclosure on keyboard focus', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    fireEvent.focus(screen.getByTestId('banner-credit'));
    expect(screen.getByText('AI-generated image after Katsushika Hokusai')).toBeInTheDocument();
  });
});

describe('P1453 credit validation', () => {
  const raw = { url: URL_A, artist: 'Katsushika Hokusai', sig: 'Hokusai', movement: 'Ukiyo-e', ink: 'cream', fidelity: 'pass' };

  it('accepts a well-formed credit', () => {
    expect(parseBannerCredit(raw)).toEqual(CREDIT);
  });

  it('rejects a bad ink, a long string, control or bidi characters, and non-objects', () => {
    expect(parseBannerCredit({ ...raw, ink: 'red' })).toBeUndefined();
    expect(parseBannerCredit({ ...raw, sig: 'x'.repeat(81) })).toBeUndefined();
    expect(parseBannerCredit({ ...raw, sig: 'Hoku‮sai' })).toBeUndefined();
    expect(parseBannerCredit({ ...raw, artist: 'a\u0000b' })).toBeUndefined();
    expect(parseBannerCredit({ ...raw, url: '' })).toBeUndefined();
    expect(parseBannerCredit('{"ink":"cream"}')).toBeUndefined();
    expect(parseBannerCredit([raw])).toBeUndefined();
    expect(parseBannerCredit(null)).toBeUndefined();
  });

  it('creditForBanner returns only a credit bound to the exact banner URL', () => {
    expect(creditForBanner(URL_A, null, CREDIT)).toBe(CREDIT);
    expect(creditForBanner(URL_B, null, CREDIT)).toBeUndefined();
    expect(creditForBanner(null, CREDIT)).toBeUndefined();
    const fresh = { ...CREDIT, url: URL_B, sig: 'Klimt' };
    expect(creditForBanner(URL_B, fresh, CREDIT)).toBe(fresh);
  });

  it('mapProfileFromDb validates banner_credit', () => {
    const base = { id: 'u1', slug: 'x', name: 'X', created_at: '2026-01-01', is_verified: true, banner_url: URL_A };
    expect(mapProfileFromDb({ ...base, banner_credit: raw } as never).bannerCredit).toEqual(CREDIT);
    expect(mapProfileFromDb({ ...base, banner_credit: { ...raw, ink: 'x' } } as never).bannerCredit).toBeUndefined();
    expect(mapProfileFromDb({ ...base } as never).bannerCredit).toBeUndefined();
  });
});
