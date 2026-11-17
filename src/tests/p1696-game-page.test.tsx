/**
 * @file p1696-game-page.test.tsx
 * @description P1696 — public /game page: copy and video from the P1685 constant, two destinations,
 * no YouTube, and the Tools menu entry.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ListeningGamePage } from '@/app/pages/listening-game-page';
import { LISTENING_GAME_COPY } from '@/app/prototypes/events/prep/listening-game';
import { buildLinksMenu } from '@/app/data/event-links';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <ListeningGamePage />
    </MemoryRouter>,
  );
}

describe('P1696 /game page', () => {
  it('renders heading, subtitle, video and roles while logged out', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: LISTENING_GAME_COPY.heading })).toBeTruthy();
    expect(screen.getByText(LISTENING_GAME_COPY.subtitle)).toBeTruthy();
    expect(screen.getByTestId('clip-listening-game')).toBeTruthy();
    expect(screen.getByText(LISTENING_GAME_COPY.rolesHeading)).toBeTruthy();
    for (const role of LISTENING_GAME_COPY.roles) expect(screen.getByText(role.name)).toBeTruthy();
    expect(container.querySelector('video, button')).toBeTruthy();
  });

  it('"Learn the Clarity practice" goes to /prepare and is a tall primary action', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Learn the Clarity practice' });
    expect(link.getAttribute('href')).toBe('/prepare');
    expect(link.className).toContain('min-h-11');
  });

  it('"Read the manifesto" goes to /manifesto and is at least 44px tall', () => {
    renderPage();
    const link = screen.getByRole('link', { name: 'Read the manifesto' });
    expect(link.getAttribute('href')).toBe('/manifesto');
    expect(link.className).toContain('min-h-11');
  });

  it('has no YouTube player or link', () => {
    const { container } = renderPage();
    // SEO injects site-wide Organization JSON-LD (sameAs lists the channel); that is metadata, not a link or player on the page.
    container.querySelectorAll('script').forEach((s) => s.remove());
    expect(container.querySelector('iframe, a[href*="youtube"], a[href*="youtu.be"]')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/youtube|youtu\.be/);
  });
});

describe('P1696 Tools menu entry', () => {
  it('lists "Listening Game" under the tools group, linking to /game', () => {
    const entry = buildLinksMenu().find((e) => e.label === 'Listening Game');
    expect(entry).toBeTruthy();
    expect(entry?.group).toBe('tools');
    expect(entry?.to).toBe('/game');
  });
});
