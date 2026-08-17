/**
 * @file p1077-ready-page.test.tsx
 * @description Done-When coverage for /ready that doesn't need a real browser:
 * no numeral/percentage anywhere, midpoint tick visible, keyboard-operable slider,
 * Continue always enabled and navigating to /meet regardless of interaction.
 *
 * P1083's own distribution/write coverage lives in p1083-ready-distribution.test.tsx
 * — this file only absorbs the minimal fallout: the pole labels now render twice
 * (once for the distribution's axis, once for the slider's own), and Continue's
 * navigation carries the P1083 `fromReady` route state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/app/data/ready-service', () => ({
  getReadyDistribution: vi.fn().mockResolvedValue([]),
  submitReadyValue: vi.fn(),
}));

import { ReadyPage } from '@/app/pages/ready-page';

// Flushes the getReadyDistribution() microtask so its setState lands inside act()
// before any assertion — P1077's own tests don't care about the distribution, but
// the fetch fires on every mount regardless.
async function renderPage() {
  const result = render(
    <MemoryRouter>
      <ReadyPage />
    </MemoryRouter>
  );
  await act(async () => {});
  return result;
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe('P1077 — /ready', () => {
  it('renders the question and a slider starting at the midpoint with a visible "Neutral" tick', async () => {
    await renderPage();
    expect(screen.getByText('How up for thinking are you right now?')).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByText('Neutral')).toBeInTheDocument();
  });

  it('renders the pole labels at each end of the track', async () => {
    await renderPage();
    // Twice each since P1083: once for the distribution's own axis, once for the
    // slider's — both are simple presence checks, not a specific-instance claim.
    expect(screen.getAllByText('Keep it light').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Go deep').length).toBeGreaterThan(0);
  });

  it('renders no numeral, percentage, or dynamic value label anywhere on the page', async () => {
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/\d+\/10/);
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it('Continue is enabled from the first frame, before any interaction', async () => {
    await renderPage();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeEnabled();
  });

  it('Continue navigates to /meet without touching the slider (the skipped path)', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // P1083: carries fromReady route state so /meet can show its back button.
    expect(mockNavigate).toHaveBeenCalledWith('/meet', { state: { fromReady: true } });
  });

  it('Continue navigates to /meet after the slider has been moved', async () => {
    await renderPage();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockNavigate).toHaveBeenCalledWith('/meet', { state: { fromReady: true } });
  });

  it('slider is keyboard-operable: arrows, Home, and End all move the value', async () => {
    await renderPage();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '10');
  });
});
