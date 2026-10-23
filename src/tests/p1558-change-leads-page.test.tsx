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
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));

import { ChangeLeadsPage } from '@/app/pages/change-leads-page';

function renderPage() {
  return render(<MemoryRouter><ChangeLeadsPage /></MemoryRouter>);
}

beforeEach(() => track.mockClear());

describe('P1558 /change-leads - content', () => {
  it('renders hero, then the sections in order', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Everyone agreed. Then nothing changed.');
    expect(screen.getByText('For change, transformation and AI rollout leads')).toBeInTheDocument();
    expect(screen.getByText(/whether .yes. in the meeting meant the same thing to everyone/)).toBeInTheDocument();
    const order = [
      'Yes is not the same as understood',
      'How a yes becomes a follow-through',
      'Follow-through you can praise',
      'Where a stalled yes costs the most',
      'Find out what your team’s yes meant',
    ];
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual(order);
    for (const t of ['Different yeses', 'Nobody checks', 'Silence looks like agreement', 'AI rollouts', 'Digital transformation', 'Reorganisations'])
      expect(screen.getByRole('heading', { level: 3, name: t })).toBeInTheDocument();
    expect(screen.getByText('Fifteen minutes on the change you’re leading and where it’s stuck.')).toBeInTheDocument();
  });

  it('has Built today / Being built badges on the right steps and the section', () => {
    renderPage();
    const badges = screen.getAllByTestId('status-badge').map((b) => b.textContent);
    // Four steps (built, being built, built, built) plus the "praise" section badge.
    expect(badges).toEqual(['Built today', 'Being built', 'Built today', 'Built today', 'Being built']);
    const step2 = screen.getByRole('heading', { level: 3, name: 'Turn the meeting into points.' }).parentElement!;
    expect(within(step2).getByText('Being built')).toBeInTheDocument();
    expect(screen.getByText(/Steps marked .Being built. are not available yet/)).toBeInTheDocument();
  });

  it('has no statistics, no References, and no shaming phrasing', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('70%');
    expect(text).not.toMatch(/\d+\s?%/);
    expect(document.getElementById('references')).toBeNull();
    expect(text).not.toMatch(/who didn.t follow/i);
    expect(text).not.toMatch(/[–—]/);
  });

  it('has one primary action, Book a 15-min discovery call to /intro, in the hero and the closing section only', () => {
    renderPage();
    const cta = screen.getAllByRole('link', { name: /Book a 15-min discovery call/ });
    expect(cta).toHaveLength(2);
    for (const c of cta) expect(c).toHaveAttribute('href', '/intro');
    expect(document.querySelectorAll('a.bg-blue-500, button.bg-blue-500')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Take the Pledge' })).toHaveAttribute('href', '/sign-pledge');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Why it stalls']);
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
