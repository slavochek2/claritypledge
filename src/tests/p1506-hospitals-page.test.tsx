/**
 * P1506 — /hospitals use-case page. Copy, section order, the auto-playing exchange, analytics, the one-CTA
 * rule, citations, and the unlisted/link-preview contract (api/og.ts + vercel.json).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const track = vi.fn();
const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
// Reduced motion: the chat lands on its final state, which is what these tests read.
const reducedMotion = { value: true };
// jsdom has no layout, so in-view is driven by hand where a test needs scroll-in.
const inViewMock = { value: false };
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => reducedMotion.value,
  useInView: () => inViewMock.value,
}));
// The pledger strip reads the DB; the page only needs it present.
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
// The shared founder section is its own tested component; a stub keeps its video button out of the count.
vi.mock('@/app/components/landing/founder-credibility', () => ({
  FounderCredibility: () => <section><h2>Paid for the lesson</h2></section>,
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { HospitalsPage } from '@/app/pages/hospitals-page';
import { GapExchangeStatic, ExchangeBoundary, DOCTOR } from '@/app/components/hospitals/gap-exchange';
import { EXCHANGE_COPY } from '@/app/content/hospitals-exchange';
import { HOSPITALS_OG } from '@/app/content/hospitals-og';

function renderPage() {
  return render(<MemoryRouter><HospitalsPage /></MemoryRouter>);
}

beforeEach(() => track.mockClear());

describe('P1506 /hospitals — content', () => {
  it('renders the sections in landing order: hero, stat, why nobody verifies, chat, value, terms, path, close', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Reveal gaps in understanding between hospital staff before they become mistakes',
    );
    // Redesign round 2: the "Clarity Pledge helps hospital teams…" lead-in is gone; the norm stands alone.
    expect(screen.queryByText(/Clarity Pledge helps hospital teams/)).toBeNull();
    // Final round: hero is pill + H1 + CTA; the norm line became the Group Terms heading.
    expect(screen.getByText('Patient safety starts with understanding')).toBeInTheDocument();
    const order = [
      'Why almost nobody verifies understanding',
      'Reveal a gap, then close it',
      'The value for the hospital',
      'Make it normal to ask how well we understand each other',
      'How revealing gaps becomes a team norm',
      'Paid for the lesson', // the shared founder section, before the close
      'Reveal gaps in understanding between hospital staff before they become mistakes', // close, as the H1
    ];
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2.filter((t) => order.includes(t!))).toEqual(order);
    // The stat sits between the hero and the first section heading.
    const stat = screen.getByTestId('stat-card');
    const why = screen.getByRole('heading', { name: order[0] });
    expect(stat.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // "How it's different" is merged into the path section.
    expect(screen.queryByRole('heading', { name: 'How Clarity Pledge is different' })).toBeNull();
    // Latest round: the chart tells the workshop-fades story alone, no subtitle.
    expect(screen.queryByText(/one-off communication workshop fades/)).toBeNull();
    expect(screen.queryByText('Better patient experience')).toBeNull();
    for (const v of ['Fewer mistakes and rework', 'Better decisions', 'Lower staff turnover'])
      expect(screen.getByText(v)).toBeInTheDocument();
    for (const r of ['Hierarchy', 'Illusion of transparency', 'Curse of knowledge'])
      expect(screen.getByRole('heading', { level: 3, name: r })).toBeInTheDocument();
    // "Where gaps cost most" is cut entirely.
    expect(screen.queryByText('Where gaps cost most')).toBeNull();
    expect(screen.queryByText('Between departments')).toBeNull();
    for (const s of ['See the cost', 'Find champions', 'Spread', 'Norm', 'Maintain']) expect(screen.getByText(s)).toBeInTheDocument();
    expect(screen.queryByAltText(/founder of Clarity Pledge/)).toBeNull();
    expect(screen.queryByText('slava@claritypledge.com')).toBeNull();
  });

  it('shows the Clarity Group Terms specimen, with no live accept control', () => {
    renderPage();
    const cert = screen.getByLabelText('Clarity Group Terms');
    expect(cert.textContent).toContain('Clarity Group Terms');
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('the 30% stat renders the real number before any animation (count-up itself not exercised in jsdom)', () => {
    renderPage();
    expect(screen.getByTestId('stat-card').textContent).toContain('30%');
  });

  it('has no first-person service offer', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/\bI (deliver|coach|help|run|offer)\b/);
  });

  it('cites each statistic inline and lists the standard References section', () => {
    renderPage();
    const stat = screen.getByTestId('stat-card');
    expect(stat.textContent).toContain('of 23,658 US malpractice cases studied involved a communication failure.');
    const sup = within(stat).getByRole('link', { name: /Reference 1: CRICO Strategies \(2015\), Malpractice Risks in Communication Failures/ });
    expect(sup).toHaveAttribute('href', '#references');
    expect(screen.getByRole('link', { name: /Reference 2: HA Thailand/ })).toHaveAttribute('href', '#references');
    expect(screen.getByRole('link', { name: /Reference 3: Newton \(1990\)/ })).toHaveAttribute('href', '#references');
    expect(screen.getByRole('link', { name: /Reference 4: Camerer/ })).toHaveAttribute('href', '#references');
    const refs = document.getElementById('references')!;
    expect(refs.textContent).toContain('References');
    const items = within(refs).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    // Numbered in reading order: stat (CRICO), then the reasons (HA Thailand, Newton, Camerer).
    expect(within(items[0]).getByRole('link').getAttribute('href')).toMatch(/^https:\/\/www\.rmf\.harvard\.edu\//);
    expect(within(items[1]).getByRole('link').getAttribute('href')).toMatch(/^https:\/\/backend\.ha\.or\.th\//);
    expect(within(items[2]).getByRole('link').getAttribute('href')).toMatch(/1990-newton\.pdf$/);
    expect(within(items[3]).getByRole('link').getAttribute('href')).toBe('https://doi.org/10.1086/261651');
  });

  it('has one primary action, Book a 15-min discovery call → /intro, in the hero and the closing section only', () => {
    renderPage();
    const cta = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    expect(cta).toHaveLength(2);
    for (const c of cta) expect(c).toHaveAttribute('href', '/intro');
    expect(document.querySelectorAll('a.bg-blue-500, button.bg-blue-500')).toHaveLength(2);
    // One primary; the founder asked for the pledge back as the /builders quiet text link.
    // The only button is the scroll cue: the chat plays by itself.
    // The /builders hero: the pledge as a quiet secondary link, pledgers, and the scroll cue.
    expect(screen.getByRole('link', { name: 'Take the Pledge' })).toHaveAttribute('href', '/sign-pledge');
    expect(screen.getByTestId('pledgers')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Why it matters']);
  });

  it('gives the chart a text alternative', () => {
    renderPage();
    expect(screen.getByRole('img', { name: /one-off workshop.*team norm/i })).toBeInTheDocument();
  });
});

describe('P1506 /hospitals — the exchange', () => {
  it('with reduced motion, the chat shows its final state: every message, the verified result and the choice', () => {
    renderPage();
    const visual = screen.getByTestId('exchange-visual');
    expect(visual).toHaveAttribute('data-phase', '7');
    for (const t of [EXCHANGE_COPY.m1, EXCHANGE_COPY.m3, EXCHANGE_COPY.verified, EXCHANGE_COPY.revealed, EXCHANGE_COPY.close])
      expect(visual.textContent).toContain(t);
  });

  it('without reduced motion, nothing has played before the chat scrolls into view', () => {
    reducedMotion.value = false;
    try {
      renderPage();
      expect(screen.getByTestId('exchange-visual')).toHaveAttribute('data-phase', '0');
    } finally {
      reducedMotion.value = true;
    }
  });

  it('on scroll-in it plays forward once to the final state, and tracks the view once', () => {
    reducedMotion.value = false;
    vi.useFakeTimers();
    try {
      const { rerender } = renderPage();
      const visual = () => screen.getByTestId('exchange-visual');
      expect(visual()).toHaveAttribute('data-phase', '0');
      inViewMock.value = true;
      rerender(<MemoryRouter><HospitalsPage /></MemoryRouter>);
      const seen: string[] = [];
      // Steps land at 150, 500, 1500, 2200, 3100, 3800, 4500 ms (SCHEDULE).
      for (const ms of [200, 350, 1000, 700, 900, 700, 700]) {
        act(() => { vi.advanceTimersByTime(ms); });
        seen.push(visual().getAttribute('data-phase')!);
      }
      expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      // A motion-preference flip after playing never replays or regresses it.
      reducedMotion.value = true;
      rerender(<MemoryRouter><HospitalsPage /></MemoryRouter>);
      reducedMotion.value = false;
      rerender(<MemoryRouter><HospitalsPage /></MemoryRouter>);
      act(() => { vi.advanceTimersByTime(7000); });
      expect(visual()).toHaveAttribute('data-phase', '7');
      expect(track.mock.calls.filter((c) => c[0] === 'hospitals_exchange_viewed')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      inViewMock.value = false;
      reducedMotion.value = true;
    }
  });

  it('switching to reduced motion mid-play jumps to the final state', () => {
    reducedMotion.value = false;
    inViewMock.value = true;
    vi.useFakeTimers();
    try {
      const { rerender } = renderPage();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(screen.getByTestId('exchange-visual')).toHaveAttribute('data-phase', '2');
      reducedMotion.value = true;
      rerender(<MemoryRouter><HospitalsPage /></MemoryRouter>);
      expect(screen.getByTestId('exchange-visual')).toHaveAttribute('data-phase', '7');
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByTestId('exchange-visual')).toHaveAttribute('data-phase', '7');
    } finally {
      vi.useRealTimers();
      inViewMock.value = false;
      reducedMotion.value = true;
    }
  });

  it('reduced-motion visitors still register the exchange view', () => {
    inViewMock.value = true;
    try {
      renderPage();
      expect(track).toHaveBeenCalledWith('hospitals_exchange_viewed');
    } finally {
      inViewMock.value = false;
    }
  });

  it('the animated chat is hidden from screen readers; a transcript carries the sequence in order', () => {
    renderPage();
    expect(screen.getByTestId('exchange-visual')).toHaveAttribute('aria-hidden', 'true');
    const transcript = within(screen.getByTestId('gap-exchange')).getAllByRole('listitem').map((li) => li.textContent);
    expect(transcript).toEqual([
      `The nurse sends ${DOCTOR} a voice message explaining something.`,
      `Nurse: ${EXCHANGE_COPY.m1}`,
      `${DOCTOR}: ${EXCHANGE_COPY.m2}`,
      `Nurse: ${EXCHANGE_COPY.m3}`,
      EXCHANGE_COPY.verified,
      EXCHANGE_COPY.revealed,
      EXCHANGE_COPY.close,
    ]);
  });

  it('if the exchange throws, the boundary renders the transcript visibly and reports it', () => {
    const Boom = () => { throw new Error('boom'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ExchangeBoundary><Boom /></ExchangeBoundary>);
    spy.mockRestore();
    expect(screen.getByTestId('gap-exchange-static')).toBeInTheDocument();
    expect(captureException).toHaveBeenCalled();
  });

  it('static fallback renders the full sequence as a list', () => {
    render(<GapExchangeStatic />);
    const items = within(screen.getByTestId('gap-exchange-static')).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[6].textContent).toContain(EXCHANGE_COPY.close);
  });
});

describe('P1506 /hospitals — analytics', () => {
  it('tracks page view and the CTA by location', () => {
    renderPage();
    expect(track).toHaveBeenCalledWith('landing_page_viewed', { variant: 'hospitals' });
    const [hero, closing] = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    fireEvent.click(hero);
    expect(track).toHaveBeenCalledWith('hospitals_cta_clicked', { location: 'hero' });
    fireEvent.click(closing);
    expect(track).toHaveBeenCalledWith('hospitals_cta_clicked', { location: 'closing' });
  });
});

describe('P1506 /hospitals — unlisted + link preview', () => {
  const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

  it('sets noindex and the hospital OG card on the client', () => {
    renderPage();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain(HOSPITALS_OG.title);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(HOSPITALS_OG.image);
  });

  it('is not in the sitemap or any nav component', () => {
    expect(read('public/sitemap.xml')).not.toContain('hospital');
    for (const f of ['src/app/components/layout/navigation-menu-items.tsx', 'src/app/components/layout/simple-navigation.tsx'])
      expect(read(f)).not.toContain('/hospitals');
  });

  it('vercel.json redirects /hospital and sends link-preview bots to the OG card', () => {
    const v = JSON.parse(read('vercel.json'));
    expect(v.redirects).toContainEqual({ source: '/hospital', destination: '/hospitals', permanent: false });
    const r = v.rewrites.find((x: { source: string }) => x.source === '/hospitals');
    expect(r.destination).toBe('/api/og?path=/hospitals');
    expect(r.has[0].value).toContain('WhatsApp');
    // LINE's crawler UA contains facebookexternalhit.
    expect(r.has[0].value).toContain('facebookexternalhit');
    const i = v.rewrites.indexOf(r);
    const spa = v.rewrites.findIndex((x: { destination: string }) => x.destination === '/index.html');
    expect(i).toBeLessThan(spa);
  });

  it('vercel.json sends X-Robots-Tag noindex for /hospitals (crawlers that skip JS)', () => {
    const v = JSON.parse(read('vercel.json'));
    const h = v.headers.find((x: { source: string }) => x.source === '/hospitals');
    expect(h.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
  });

  it('api/og serves the hospital card even without database env vars', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    try {
      const { default: handler } = await import('../../api/og');
      let body = '';
      const res = { setHeader: () => {}, status: () => ({ send: (h: string) => { body = h; } }) } as unknown as VercelResponse;
      await handler({ query: { path: '/hospital' } } as unknown as VercelRequest, res);
      expect(body).toContain(HOSPITALS_OG.title);
      expect(body).toContain('noindex, nofollow');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('api/og serves the hospital card with noindex', async () => {
    const { default: handler } = await import('../../api/og');
    let body = '';
    const res = {
      setHeader: () => {},
      status: () => ({ send: (h: string) => { body = h; } }),
    } as unknown as VercelResponse;
    await handler({ query: { path: '/hospitals' } } as unknown as VercelRequest, res);
    expect(body).toContain(`<meta property="og:title" content="${HOSPITALS_OG.title}" />`);
    expect(body).toContain('https://claritypledge.com/banners/hospitals-og.png');
    expect(body).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
