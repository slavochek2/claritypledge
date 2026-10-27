/**
 * P1558 — /change-leads use-case page. Copy, section order, the one-CTA rule, status badges,
 * analytics, and the noindex/route contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

const track = vi.fn();
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock('@/app/components/landing/misunderstanding-venn', () => ({ MisunderstandingVenn: () => <div data-testid="venn" /> }));
vi.mock('@/app/components/landing/how-platform-works', () => ({ HowPlatformWorks: () => <section data-testid="how"><h2>How it works</h2></section> }));
vi.mock('@/app/components/landing/founder-credibility', () => ({ FounderCredibility: () => <section data-testid="founder"><h2>Paid for the lesson</h2></section> }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { ChangeLeadsPage } from '@/app/pages/change-leads-page';

function renderPage() {
  return render(<MemoryRouter><ChangeLeadsPage /></MemoryRouter>);
}

beforeEach(() => track.mockClear());

describe('P1558 /change-leads - content', () => {
  it('renders hero, shared sections, gets-cards and closing in order', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Everyone agreed. Then nothing changed.');
    expect(screen.getByText('For change leads')).toBeInTheDocument();
    expect(screen.getByText('AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things.')).toBeInTheDocument();
    expect(screen.getByText(/What your team didn.t say in the rollout meeting/)).toBeInTheDocument();
    expect(screen.getByText('Sounds good 👍')).toBeInTheDocument();
    expect(screen.getByTestId('venn')).toBeInTheDocument();
    expect(screen.getByTestId('how')).toBeInTheDocument();
    expect(screen.getByTestId('founder')).toBeInTheDocument();
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const tail = ['The illusion of shared understanding', 'How it works', 'What your team gets', 'Paid for the lesson', 'Find out what your team’s yes meant'];
    expect(h2.slice(-5)).toEqual(tail);
    expect(screen.getByText('Fifteen minutes on the change you’re leading and where it’s stuck.')).toBeInTheDocument();
  });

  it('has three gets-cards with the right badges', () => {
    renderPage();
    const cards: [string, string][] = [
      ['Check back before you agree', 'Built today'],
      ['Every important meeting, written down', 'Being built'],
      ['Help when the team gets stuck', 'Built today'],
    ];
    for (const [title, badge] of cards) {
      const card = screen.getByRole('heading', { level: 3, name: title }).parentElement!;
      expect(within(card).getByTestId('status-badge').textContent).toBe(badge);
    }
    expect(screen.getAllByTestId('status-badge')).toHaveLength(3);
    expect(screen.getByText(/Steps marked .Being built. are not available yet/)).toBeInTheDocument();
  });

  it('has no statistics, no References, and no shaming phrasing', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('70%');
    expect(text).not.toMatch(/\d+\s?%/);
    expect(document.getElementById('references')).toBeNull();
    expect(text).not.toMatch(/who didn.t follow/i);
    expect(text).not.toMatch(/who didn.t/i);
    expect(text).not.toMatch(/[–—]/);
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

describe('P1558 /change-leads - analytics', () => {
  it('tracks page view and the CTA by location', () => {
    renderPage();
    expect(track).toHaveBeenCalledWith('landing_page_viewed', { variant: 'change-leads' });
    const [hero, closing] = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    fireEvent.click(hero);
    expect(track).toHaveBeenCalledWith('change_leads_cta_clicked', { location: 'hero' });
    fireEvent.click(closing);
    expect(track).toHaveBeenCalledWith('change_leads_cta_clicked', { location: 'closing' });
  });
});

describe('P1558 /change-leads - route + nav', () => {
  const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

  it('sets noindex on the client', () => {
    renderPage();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
  });

  it('is routed at /change-leads and listed in the Use cases menu as "Leading a change"', () => {
    expect(read('src/App.tsx')).toContain('path="/change-leads"');
    expect(read('src/app/components/layout/nav-links.ts')).toContain('{ to: "/change-leads", label: "Leading a change"');
  });
});
