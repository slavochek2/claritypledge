/**
 * @file p1706-role-cards.test.tsx
 * @description P1706 — /game shows both sides of the printed role card, with the printed wording and the caption.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ListeningGamePage } from '@/app/pages/listening-game-page';
import { ROLE_CARDS } from '@/app/prototypes/events/prep/listening-game';

function renderPage() {
  return render(
    <HelmetProvider><MemoryRouter><ListeningGamePage /></MemoryRouter></HelmetProvider>,
  );
}

describe('P1706 role cards on /game', () => {
  it('renders the speaker side then the listener side with the printed jobs', () => {
    renderPage();
    const speaker = screen.getByTestId('role-card-speaker');
    const listener = screen.getByTestId('role-card-listener');
    expect(speaker.compareDocumentPosition(listener) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(speaker).getByText('Explain back what I mean.')).toBeTruthy();
    expect(within(speaker).getByText('Ask me open questions.')).toBeTruthy();
    expect(within(listener).getByText('Ask me, “How well do you think you understand me, from 0 to 10?”')).toBeTruthy();
  });

  it('names each side as the front and back of one card, and shows the caption', () => {
    renderPage();
    expect(screen.getByRole('group', { name: 'Front of the card' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Back of the same card' })).toBeTruthy();
    expect(screen.getByText(ROLE_CARDS.caption)).toBeTruthy();
  });
});
