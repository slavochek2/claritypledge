/**
 * P1558 — /change-managers use-case page, built on the shared /hospitals sections. Copy, section order,
 * the one-CTA rule, citations, analytics, and the noindex/route/redirect contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const track = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
// jsdom has no layout, so in-view is driven by hand where a test needs scroll-in (as in the hospitals test).
const inViewMock = { value: false };
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useInView: () => inViewMock.value,
}));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label, targetId }: { label: string; targetId: string }) => <button type="button" data-target={targetId}>{label}</button>,
}));
vi.mock('@/app/components/landing/founder-credibility', () => ({ FounderCredibility: () => <section data-testid="founder"><h2>Paid for the lesson</h2></section> }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { ChangeManagersPage } from '@/app/pages/change-managers-page';
import { CHANGE_MANAGERS_OG } from '@/app/content/change-managers-og';
import { LANDING_REDIRECTS } from '@/app/routes/landing-redirects';

function renderPage() {
  return render(<MemoryRouter><ChangeManagersPage /></MemoryRouter>);
}
const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

beforeEach(() => track.mockClear());

describe('P1558 /change-managers - content', () => {
  it('renders hero, chat and the shared sections in order', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Everyone agreed. Then nothing changed.');
    expect(screen.getByText('For change managers')).toBeInTheDocument();
    expect(screen.getByText('AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things.')).toBeInTheDocument();
    expect(screen.getByText('Sounds good 👍')).toBeInTheDocument();
    // the hero scroll cue targets the chat story section
    // the hero scroll cue's real target holds the chat story
    const cue = screen.getByRole('button', { name: 'What nobody said' });
    expect(document.getElementById(cue.dataset.target!)).toContainElement(screen.getByText('Sounds good 👍'));
    const order = [
      'Why almost nobody verifies understanding',
      'Reveal a gap, then close it',
      'Make it normal to ask how well we understand each other',
      'How revealing gaps becomes a team norm',
      'Paid for the lesson',
      'Reveal gaps in understanding before your rollout stalls',
    ];
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2.filter((t) => order.includes(t!))).toEqual(order);
    for (const r of ['Hierarchy', 'Illusion of transparency', 'Curse of knowledge'])
      expect(screen.getByRole('heading', { level: 3, name: r })).toBeInTheDocument();
    expect(screen.getByLabelText('Clarity Group Terms')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /one-off workshop.*team norm/i })).toBeInTheDocument();
  });

  it('removed the venn, the gets-cards and the Being built line', () => {
    renderPage();
    expect(screen.queryByTestId('venn')).toBeNull();
    expect(screen.queryByText('How it works for your team')).toBeNull();
    expect(screen.queryByTestId('status-badge')).toBeNull();
    expect(screen.queryByText(/Being built/)).toBeNull();
  });

  it('shows the sourced IBM 59% stat and has no hospital wording', () => {
    const { container } = renderPage();
    const stat = screen.getByTestId('stat-card');
    expect(stat).toHaveTextContent('59%');
    expect(stat).toHaveTextContent('of change projects missed at least one objective or failed entirely. The top obstacle was changing mindsets and attitudes, not technology.');
    expect(within(stat).getByRole('link', { name: /Reference 1: IBM Global Business Services \(2008\), Making Change Work/ })).toHaveAttribute('href', '#references');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/patient|hospital|nurse|\bward\b|clinical|\bstaff\b|Dr\. /i);
    expect(text).not.toContain('70%');
    expect(text).not.toMatch(/who didn.t/i);
    expect(text).not.toMatch(/who didn.t follow/i);
  });

  it('numbers its citations in reading order against its own References list', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Reference 2: Newton \(1990\)/ })).toHaveAttribute('href', '#references');
    expect(screen.getByRole('link', { name: /Reference 3: Camerer/ })).toHaveAttribute('href', '#references');
    expect(screen.queryByRole('link', { name: /HA Thailand/ })).toBeNull();
    const items = within(document.getElementById('references')!).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('link').getAttribute('href')).toBe('https://www.ibm.com/downloads/cas/ZGOKYPNL');
    expect(within(items[1]).getByRole('link').getAttribute('href')).toMatch(/1990-newton\.pdf$/);
    expect(within(items[2]).getByRole('link').getAttribute('href')).toBe('https://doi.org/10.1086/261651');
  });

  it('has one primary action, Book a 15-min discovery call to /intro, in the hero and the closing section only', () => {
    renderPage();
    const cta = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    expect(cta).toHaveLength(2);
    for (const c of cta) expect(c).toHaveAttribute('href', '/intro');
    expect(document.querySelectorAll('a.bg-blue-500, button.bg-blue-500')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Take the Pledge' })).toHaveAttribute('href', '/sign-pledge');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['What nobody said']);
  });
});

describe('P1558 /change-managers - analytics', () => {
  it('tracks page view, the CTA by location and the pledge link', () => {
    renderPage();
    expect(track).toHaveBeenCalledWith('landing_page_viewed', { variant: 'change-managers' });
    const [hero, closing] = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    fireEvent.click(hero);
    expect(track).toHaveBeenCalledWith('change_managers_cta_clicked', { location: 'hero' });
    fireEvent.click(closing);
    expect(track).toHaveBeenCalledWith('change_managers_cta_clicked', { location: 'closing' });
    fireEvent.click(screen.getByRole('link', { name: 'Take the Pledge' }));
    expect(track).toHaveBeenCalledWith('change_managers_pledge_clicked');
  });
});

describe('P1558 /change-managers - route, nav, preview', () => {
  it('sets noindex and the OG card on the client', () => {
    renderPage();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain(CHANGE_MANAGERS_OG.title);
  });

  it('is routed at /change-managers, redirects /change-leads, and leads the Use cases menu', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('path="/change-managers"');
    expect(app).toContain('LANDING_REDIRECTS.map(');
    expect(read('src/app/routes/landing-redirects.ts')).toContain('["/change-leads", "/change-managers"]');
    expect(read('src/app/components/layout/nav-links.ts')).toContain('{ to: "/change-managers", label: "For change managers"');
  });

  it('every landing redirect in the real list lands on its canonical route', () => {
    expect(LANDING_REDIRECTS).toEqual([
      ['/hospital', '/hospitals'],
      ['/change-leads', '/change-managers'],
      ['/program', '/pricing'],
      ['/offers', '/pricing'],
    ]);
    for (const [from, to] of LANDING_REDIRECTS) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[from]}>
          <Routes>
            <Route path={to} element={<div>landed {to}</div>} />
            {LANDING_REDIRECTS.map(([f, t]) => <Route key={f} path={f} element={<Navigate to={t} replace />} />)}
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText(`landed ${to}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('vercel.json redirects /change-leads server-side, so crawlers on old links reach the OG rewrite', () => {
    const v = JSON.parse(read('vercel.json'));
    expect(v.redirects).toContainEqual({ source: '/change-leads', destination: '/change-managers', permanent: false });
    const r = v.rewrites.find((x: { source: string }) => x.source === '/change-managers');
    const ua = new RegExp(r.has.find((h: { key: string }) => h.key === 'user-agent').value);
    for (const bot of ['WhatsApp/2.23.20.0 A', 'LinkedInBot/1.0 (compatible; Mozilla/5.0)', 'facebookexternalhit/1.1', 'TelegramBot (like TwitterBot)']) expect(ua.test(bot)).toBe(true);
    expect(ua.test('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe(false);
  });

  it('the exchange shows office teammates, never the hospital doctor and nurse', () => {
    const { container } = renderPage();
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    expect(srcs).toContain('/change-managers/teammate-a.jpg');
    expect(srcs).toContain('/change-managers/teammate-b.jpg');
    expect(srcs.filter((x) => x.startsWith('/hospitals/'))).toEqual([]);
  });

  it('the shared exchange reports its own analytics event on this page, never the hospitals one', () => {
    inViewMock.value = true;
    try {
      renderPage();
      const events = track.mock.calls.map((c) => c[0]);
      expect(events).toContain('change_managers_exchange_viewed');
      expect(events).not.toContain('hospitals_exchange_viewed');
    } finally {
      inViewMock.value = false;
    }
  });

  it('vercel.json sends noindex header and bot OG rewrite for /change-managers', () => {
    const v = JSON.parse(read('vercel.json'));
    const h = v.headers.find((x: { source: string }) => x.source === '/change-managers');
    expect(h.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
    const r = v.rewrites.find((x: { source: string }) => x.source === '/change-managers');
    expect(r.destination).toBe('/api/og?path=/change-managers');
    expect(v.rewrites.indexOf(r)).toBeLessThan(v.rewrites.findIndex((x: { destination: string }) => x.destination === '/index.html'));
  });

  it('api/og serves the card for /change-managers and the old /change-leads', async () => {
    const { default: handler } = await import('../../api/og');
    for (const path of ['/change-managers', '/change-leads']) {
      let body = '';
      const res = { setHeader: () => {}, status: () => ({ send: (h: string) => { body = h; } }) } as unknown as VercelResponse;
      await handler({ query: { path } } as unknown as VercelRequest, res);
      expect(body).toContain(`<meta property="og:title" content="${CHANGE_MANAGERS_OG.title}" />`);
      expect(body).toContain('noindex, nofollow');
    }
  });
});
