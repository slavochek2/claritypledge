/**
 * @file p1077-ready-page.test.tsx
 * @description Done-When coverage for /ready that doesn't need a real browser:
 * no numeral/percentage anywhere, midpoint tick visible, keyboard-operable slider,
 * Continue always enabled and navigating to /meet regardless of interaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { ReadyPage } from '@/app/pages/ready-page';

function renderPage() {
  return render(
    <MemoryRouter>
      <ReadyPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe('P1077 — /ready', () => {
  it('renders the question and a slider starting at the midpoint with a visible "Neutral" tick', () => {
    renderPage();
    expect(screen.getByText('Right now, how much are you up for thinking?')).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByText('Neutral')).toBeInTheDocument();
  });

  it('renders no numeral, percentage, or dynamic value label anywhere on the page', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/\d+\/10/);
    expect(container.textContent).not.toMatch(/\d+%/);
  });

  it('Continue is enabled from the first frame, before any interaction', () => {
    renderPage();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeEnabled();
  });

  it('Continue navigates to /meet without touching the slider (the skipped path)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockNavigate).toHaveBeenCalledWith('/meet');
  });

  it('Continue navigates to /meet after the slider has been moved', () => {
    renderPage();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockNavigate).toHaveBeenCalledWith('/meet');
  });

  it('slider is keyboard-operable: arrows, Home, and End all move the value', () => {
    renderPage();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '10');
  });
});
