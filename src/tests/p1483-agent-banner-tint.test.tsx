/**
 * P1483: agent profile banners get a strong navy treatment; people's banners stay in color.
 * The treatment is a display-time layer over the banner image only — never the gradient
 * fallback, never the "after <artist>" signature.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BannerDisplay } from '@/app/components/shared/banner/BannerDisplay';
import type { BannerCredit } from '@/lib/banner-credit';

const URL_A = 'https://x.supabase.co/storage/v1/object/public/banners/profile/u1/a.png';
const CREDIT: BannerCredit = { url: URL_A, artist: 'Leonardo da Vinci', sig: 'Leonardo', movement: 'Renaissance', ink: 'cream' };

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

describe('P1483 agent banner treatment', () => {
  beforeEach(() => setDesktop(true));

  it('lays strong navy over an agent banner image', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} agentTint />);
    const tint = screen.getByTestId('banner-agent-tint');
    expect(tint.style.backgroundColor).toBe('rgb(30, 58, 138)'); // #1e3a8a
    expect(tint.style.mixBlendMode).toBe('color');
    expect(tint.style.opacity).toBe('0.75');
    expect(tint).toHaveAttribute('aria-hidden', 'true');
    expect(tint.className).toContain('pointer-events-none');
  });

  it('keeps the signature above the tint (rendered after it, so it is not tinted)', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} agentTint />);
    const tint = screen.getByTestId('banner-agent-tint');
    const credit = screen.getByTestId('banner-credit');
    expect(tint.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never tints a banner without the prop (people, events, stories unchanged)', () => {
    renderLoaded(<BannerDisplay bannerUrl={URL_A} altText="alt" credit={CREDIT} />);
    expect(screen.queryByTestId('banner-agent-tint')).toBeNull();
  });

  it('never tints the gradient fallback (agent without a banner)', () => {
    renderLoaded(<BannerDisplay bannerUrl={null} altText="alt" agentTint />);
    expect(screen.queryByTestId('banner-agent-tint')).toBeNull();
  });

  it('never tints a banner whose image failed to load (fallback shown instead)', () => {
    render(<BannerDisplay bannerUrl={URL_A} altText="alt" agentTint />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByTestId('banner-agent-tint')).toBeNull();
  });

  it('tints the phone variant too when an agent has one', () => {
    setDesktop(false);
    renderLoaded(<BannerDisplay bannerUrl={URL_A} mobileBannerUrl={URL_A + '?m'} altText="alt" agentTint />);
    expect(screen.getByTestId('banner-agent-tint')).toBeInTheDocument();
  });
});

describe('P1483 profile page wiring', () => {
  const src = readFileSync(resolve(__dirname, '../app/pages/profile-page-v2.tsx'), 'utf8');

  it('passes the treatment from isAgent, which is false until the agent registry resolves', () => {
    expect(src).toMatch(/<BannerDisplay[\s\S]*?agentTint=\{isAgent\}[\s\S]*?>/);
    // isAgent must come from the registry lookup — never from a field a page could guess at.
    expect(src).toMatch(/const isAgent = isAgentAccountId\(profile\?\.id\);/);
  });
});
