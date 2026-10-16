/**
 * P1506 — /hospitals use-case page. Copy, the interactive exchange, analytics, the one-CTA
 * rule, citations, and the unlisted/link-preview contract (api/og.ts + vercel.json).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const track = vi.fn();
const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { HospitalsPage } from '@/app/pages/hospitals-page';
import { GapExchangeStatic, ExchangeBoundary } from '@/app/components/hospitals/gap-exchange';
import { EXCHANGE_COPY } from '@/app/content/hospitals-exchange';
import { HOSPITALS_OG } from '@/app/content/hospitals-og';

function renderPage() {
  return render(<MemoryRouter><HospitalsPage /></MemoryRouter>);
}

beforeEach(() => track.mockClear());

describe('P1506 /hospitals — content', () => {
  it('renders all 8 sections with the brochure copy', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Reveal gaps in understanding between hospital staff before they become mistakes',
    );
    expect(screen.getByText('Clarity Pledge helps hospital teams establish and maintain one new team norm:')).toBeInTheDocument();
    expect(screen.getByText('Make it normal to ask how well we understand each other')).toBeInTheDocument();
    for (const h of [
      'What the hospital can expect',
      'Why gaps in mutual understanding stay invisible',
      EXCHANGE_COPY.heading,
      'Where gaps in understanding cost most',
      'How revealing gaps becomes a team norm',
      'How Clarity Pledge is different',
    ]) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    for (const v of ['Fewer mistakes and rework', 'Better patient experience', 'Better decisions', 'Lower staff turnover'])
      expect(screen.getByText(v)).toBeInTheDocument();
    for (const c of ['Between departments', 'Across seniority', 'Patients and families', 'International patients', 'Vendor and investment choices', 'Introducing change'])
      expect(screen.getByText(c)).toBeInTheDocument();
    for (const s of ['See the cost', 'Find champions', 'Spread', 'Norm', 'Maintain']) expect(screen.getByText(s)).toBeInTheDocument();
    expect(screen.getByText('Clarity Pledge helps teams establish and keep this norm.')).toBeInTheDocument();
    expect(screen.getByAltText('Vyacheslav Ladischenski (Slava), founder of Clarity Pledge')).toHaveAttribute('src', '/founder-photo.jpg');
  });

  it('has no first-person service offer', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/\bI (deliver|coach|help|run|offer)\b/);
  });

  it('cites each statistic inline (author, year, title → primary source) and lists Sources', () => {
    renderPage();
    const stat = screen.getByTestId('stat-card');
    expect(stat.textContent).toContain('30%');
    expect(stat.textContent).toContain('of 23,658 US malpractice cases studied involved a communication failure.');
    const inline = within(stat).getByRole('link', { name: /CRICO Strategies \(2015\), Malpractice Risks in Communication Failures/ });
    expect(inline.getAttribute('href')).toMatch(/^https:\/\/www\.rmf\.harvard\.edu\//);
    const sources = document.getElementById('sources')!;
    expect(within(sources).getAllByRole('listitem')).toHaveLength(2);
    expect(sources.textContent).toContain('HA Thailand');
    expect(sources.textContent).toContain('CRICO Strategies');
  });

  it('has exactly one primary CTA → /intro, and the email is a plain link', () => {
    renderPage();
    const cta = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    expect(cta).toHaveLength(1);
    expect(cta[0]).toHaveAttribute('href', '/intro');
    expect(document.querySelectorAll('a.bg-blue-500, button.bg-blue-500')).toHaveLength(1);
    const mail = screen.getByRole('link', { name: 'slava@claritypledge.com' });
    expect(mail).toHaveAttribute('href', 'mailto:slava@claritypledge.com');
    expect(mail.className).not.toMatch(/bg-/);
  });

  it('gives the chart a text alternative', () => {
    renderPage();
    expect(screen.getByRole('img', { name: /one-off workshop.*team norm/i })).toBeInTheDocument();
  });
});

describe('P1506 /hospitals — interactive exchange', () => {
  it('steps through, announces each step, both choices have outcomes, Replay resets', async () => {
    renderPage();
    const live = screen.getByTestId('exchange-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    // Nothing is announced on page load.
    expect(live.textContent).toBe('');
    // Step 1 visible before any tap.
    expect(screen.getByText(EXCHANGE_COPY.m1)).toBeInTheDocument();
    expect(screen.queryByText(EXCHANGE_COPY.m3)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(live.textContent).toBe('B answers: 8'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(EXCHANGE_COPY.m3)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByText(EXCHANGE_COPY.outcomeLine)).toBeInTheDocument();

    // Focus follows the controls: the Next button unmounted, the first choice took focus.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: EXCHANGE_COPY.moveOn }));

    fireEvent.click(screen.getByRole('button', { name: EXCHANGE_COPY.moveOn }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Try the other choice' }));
    expect(screen.getByTestId('exchange-outcome').textContent).toContain(EXCHANGE_COPY.moveOnCost);
    await waitFor(() => expect(live.textContent).toContain(EXCHANGE_COPY.moveOnCost));

    fireEvent.click(screen.getByRole('button', { name: 'Try the other choice' }));
    fireEvent.click(screen.getByRole('button', { name: EXCHANGE_COPY.close }));
    expect(screen.getByTestId('exchange-outcome').textContent).toContain(EXCHANGE_COPY.closeCost);

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.queryByText(EXCHANGE_COPY.m3)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('all controls are native buttons (Tab + Enter/Space work natively)', () => {
    renderPage();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.tagName).toBe('BUTTON');
    expect(next).toHaveAttribute('type', 'button');
  });

  it('animations are motion-safe only (reduced motion = no animation)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const animated = Array.from(document.querySelectorAll('[class*="animate-in"]'));
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) expect(el.className).not.toMatch(/(^|\s)animate-in/);
  });

  it('a repeated state is re-announced (cleared, then set again)', async () => {
    renderPage();
    const live = screen.getByTestId('exchange-live');
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(live.textContent).toContain(EXCHANGE_COPY.outcomeLine));
    const atStep3 = live.textContent;
    fireEvent.click(screen.getByRole('button', { name: EXCHANGE_COPY.moveOn }));
    await waitFor(() => expect(live.textContent).toContain(EXCHANGE_COPY.moveOnCost));
    fireEvent.click(screen.getByRole('button', { name: 'Try the other choice' }));
    expect(live.textContent).toBe('');
    await waitFor(() => expect(live.textContent).toBe(atStep3));
  });

  it('if the interactive exchange throws, the boundary renders the static list and reports it', () => {
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
    expect(items).toHaveLength(5);
    expect(items[4].textContent).toContain(EXCHANGE_COPY.closeCost);
  });
});

describe('P1506 /hospitals — analytics', () => {
  it('tracks page view, each exchange step, and the CTA', () => {
    renderPage();
    expect(track).toHaveBeenCalledWith('landing_page_viewed', { variant: 'hospitals' });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(track).toHaveBeenCalledWith('hospitals_exchange_step', { step: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: EXCHANGE_COPY.close }));
    expect(track).toHaveBeenCalledWith('hospitals_exchange_step', { step: 4, choice: 'close-gap' });
    fireEvent.click(screen.getByRole('link', { name: /Book a 15-min discovery call/ }));
    expect(track).toHaveBeenCalledWith('hospitals_cta_clicked', { location: 'hero' });
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
