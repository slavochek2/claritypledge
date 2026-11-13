/**
 * P1671 — live /builders and /change-managers render the fable layout. Covered: the invite
 * redirects and their precedence, every analytics event of the spec's Invariants table fired from
 * its action, the /tree prototypes firing none of them, the SEO props, five figures on both
 * pictures, and the builders closing line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const track = vi.fn();
const seoProps = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock('@/app/components/landing/founder-credibility', () => ({ FounderCredibility: () => <section><h2>Paid for the lesson</h2></section> }));
vi.mock('@/app/components/seo', () => ({ SEO: (p: Record<string, unknown>) => { seoProps(p); return null; } }));

import { BuildRightThingLanding } from '@/app/pages/build-right-thing-landing';
import { ChangeManagersPage } from '@/app/pages/change-managers-page';
import { LandingFable } from '@/app/tree/landing-lab/fable/LandingFable';
import { LandingFableChange } from '@/app/tree/landing-lab/fable/LandingFableChange';
import { CHANGE_MANAGERS_OG } from '@/app/content/change-managers-og';

/** Every event name in the spec's Invariants table. */
const TABLE_EVENTS = ['landing_page_viewed', 'alignment_audit_cta_clicked', 'change_managers_cta_clicked', 'change_managers_pledge_clicked'];
const CTA = 'Book a 15-min discovery call';

function renderAt(url: string, page: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/builders" element={page} />
        <Route path="/change-managers" element={page} />
        <Route path="/tree/*" element={page} />
        <Route path="/sign-pledge" element={<div>landed sign-pledge</div>} />
        <Route path="/login" element={<div>landed login</div>} />
        <Route path="/intro" element={<div>landed intro</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const calls = () => track.mock.calls.map((c) => [c[0], c[1]]);
/** Renders the page, clears the load-time events, clicks one element and returns what that click tracked. */
function clickOn(url: string, page: React.ReactNode, target: () => HTMLElement) {
  const { unmount } = renderAt(url, page);
  track.mockClear();
  fireEvent.click(target());
  const tracked = calls();
  unmount();
  return tracked;
}

beforeEach(() => {
  track.mockClear();
  seoProps.mockClear();
});

describe('P1671 /builders: invite redirects', () => {
  it.each([
    ['/builders?referrer=x', 'landed sign-pledge'],
    ['/builders?login=1', 'landed login'],
    // Precedence: the referrer wins over login.
    ['/builders?referrer=x&login=1', 'landed sign-pledge'],
  ])('%s lands on the right page', (url, landed) => {
    renderAt(url, <BuildRightThingLanding />);
    expect(screen.getByText(landed)).toBeInTheDocument();
  });

  it('with neither, the page stays', () => {
    renderAt('/builders', <BuildRightThingLanding />);
    expect(screen.queryByText(/landed/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('P1671 analytics: each event from its action', () => {
  it('/builders: page view once, and the CTA event from both CTAs', () => {
    const { unmount } = renderAt('/builders', <BuildRightThingLanding />);
    expect(calls()).toEqual([['landing_page_viewed', { referrer: undefined, variant: 'build-right-thing' }]]);
    expect(screen.getAllByRole('link', { name: CTA })).toHaveLength(2);
    unmount();
    // The old layout sent location "hero" (the CTA size) from both CTAs; the values carry over.
    expect(clickOn('/builders', <BuildRightThingLanding />, () => screen.getAllByRole('link', { name: CTA })[0]!)).toEqual([['alignment_audit_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/builders', <BuildRightThingLanding />, () => screen.getAllByRole('link', { name: CTA })[1]!)).toEqual([['alignment_audit_cta_clicked', { location: 'hero' }]]);
  });

  it('/builders: the page view carries the referrer from the query', () => {
    // The referrer redirect fires too; the view is tracked before it, once.
    renderAt('/builders?referrer=abc', <BuildRightThingLanding />);
    expect(track.mock.calls.filter((c) => c[0] === 'landing_page_viewed')).toEqual([['landing_page_viewed', { referrer: 'abc', variant: 'build-right-thing' }]]);
  });

  it('/change-managers: page view, the CTA by location, the pledge link', () => {
    const { unmount } = renderAt('/change-managers', <ChangeManagersPage />);
    expect(calls()).toEqual([['landing_page_viewed', { variant: 'change-managers' }]]);
    unmount();
    const page = <ChangeManagersPage />;
    expect(clickOn('/change-managers', page, () => screen.getAllByRole('link', { name: CTA })[0]!)).toEqual([['change_managers_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/change-managers', page, () => screen.getAllByRole('link', { name: CTA })[1]!)).toEqual([['change_managers_cta_clicked', { location: 'closing' }]]);
    expect(clickOn('/change-managers', page, () => screen.getByRole('link', { name: 'Take the Pledge' }))).toEqual([['change_managers_pledge_clicked', undefined]]);
  });

  it.each([
    ['/tree/landing-fable', LandingFable],
    ['/tree/landing-fable-change', LandingFableChange],
  ] as const)('%s fires none of them, and never redirects', (path, Page) => {
    for (const action of ['hero', 'closing', 'pledge'] as const) {
      const { unmount } = renderAt(`${path}?referrer=x&login=1`, <Page />);
      expect(screen.queryByText(/landed/)).toBeNull();
      const target = action === 'pledge' ? screen.getByRole('link', { name: 'Take the Pledge' }) : screen.getAllByRole('link', { name: CTA })[action === 'hero' ? 0 : 1]!;
      fireEvent.click(target);
      unmount();
    }
    expect(track.mock.calls.map((c) => c[0]).filter((e) => TABLE_EVENTS.includes(e))).toEqual([]);
  });
});

describe('P1671 SEO', () => {
  it('/builders: "Build the Right Thing", url "/", indexed', () => {
    renderAt('/builders', <BuildRightThingLanding />);
    const p = seoProps.mock.calls.at(-1)![0];
    expect(p).toMatchObject({ title: 'Build the Right Thing', url: '/' });
    expect(p.noIndex).toBeFalsy();
  });

  it('/change-managers: its url, its OG card, noindex', () => {
    renderAt('/change-managers', <ChangeManagersPage />);
    expect(seoProps.mock.calls.at(-1)![0]).toEqual({
      title: CHANGE_MANAGERS_OG.title, description: CHANGE_MANAGERS_OG.description, url: '/change-managers', image: CHANGE_MANAGERS_OG.image, noIndex: true,
    });
  });
});

describe('P1671 the picture: five people on both pages', () => {
  it.each([
    ['/builders', BuildRightThingLanding],
    ['/change-managers', ChangeManagersPage],
  ] as const)('%s draws five figures, each a different shape', (path, Page) => {
    renderAt(path, <Page />);
    const figures = [...screen.getByTestId('agreed-graphic').querySelectorAll<SVGGElement>('[data-figure]')];
    expect(figures).toHaveLength(5);
    expect(new Set(figures.map((f) => f.dataset.shape)).size).toBe(5);
  });

  it('/builders closes on the five-meanings line, and says no "four" anywhere in the example', () => {
    renderAt('/builders', <BuildRightThingLanding />);
    const card = screen.getByTestId('agreed-graphic');
    expect(card.querySelector('figcaption')?.textContent).toBe('One sentence. Five meanings. All five shipped.');
    expect(card.textContent).toContain('5 of 5 agreed');
    expect(card.textContent).not.toMatch(/\bfour\b|4 of 4/i);
  });
});
