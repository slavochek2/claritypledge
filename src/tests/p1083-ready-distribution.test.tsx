/**
 * @file p1083-ready-distribution.test.tsx
 * @description Done-When coverage for P1083's always-visible /ready distribution:
 * renders before any answer, no numeral/percentage/identity, empty state reads as
 * quiet rather than an error, a fetch failure fails silently, and Continue writes
 * the ephemeral submission without ever blocking navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetReadyDistribution = vi.fn();
const mockSubmitReadyValue = vi.fn();
vi.mock('@/app/data/ready-service', () => ({
  getReadyDistribution: (...args: unknown[]) => mockGetReadyDistribution(...args),
  submitReadyValue: (...args: unknown[]) => mockSubmitReadyValue(...args),
}));

import { ReadyPage } from '@/app/pages/ready-page';

async function renderPage() {
  const result = render(
    <MemoryRouter>
      <ReadyPage />
    </MemoryRouter>
  );
  await act(async () => {});
  return result;
}

const distribution = () => screen.getByRole('img', { name: /how up for thinking others are/i });
const dots = () => distribution().querySelectorAll('[aria-hidden="true"].rounded-full');

beforeEach(() => {
  mockNavigate.mockClear();
  mockGetReadyDistribution.mockReset();
  mockSubmitReadyValue.mockReset();
});

describe('P1083 — /ready distribution', () => {
  it('renders one dot per other respondent, fetched on load before any answer is submitted', async () => {
    mockGetReadyDistribution.mockResolvedValue([2, 5, 9]);
    await renderPage();
    expect(mockGetReadyDistribution).toHaveBeenCalledTimes(1);
    expect(mockSubmitReadyValue).not.toHaveBeenCalled();
    expect(dots()).toHaveLength(3);
  });

  it('empty state (N=0): bare axis, zero dots, no copy — not an error', async () => {
    mockGetReadyDistribution.mockResolvedValue([]);
    await renderPage();
    expect(dots()).toHaveLength(0);
    // The axis (pole labels) still renders — only the dots and any extra copy are absent.
    expect(screen.getAllByText('Keep it light').length).toBeGreaterThan(0);
    expect(screen.queryByText(/error|failed|unavailable/i)).not.toBeInTheDocument();
  });

  it('a distribution-fetch failure fails silently to the empty state, never surfaces an error', async () => {
    mockGetReadyDistribution.mockRejectedValue(new Error('network down'));
    await renderPage();
    expect(dots()).toHaveLength(0);
    expect(screen.queryByText(/error|failed|unavailable/i)).not.toBeInTheDocument();
    // Slider and Continue must still work — the fetch failure never blocks them.
    expect(screen.getByRole('slider')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('renders no numeral, percentage, or identity anywhere in the distribution', async () => {
    mockGetReadyDistribution.mockResolvedValue([0, 4, 10]);
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/\d+\/10/);
    expect(container.textContent).not.toMatch(/\d+%/);
    expect(container.textContent).not.toMatch(/anonymized|aggregate/i);
  });

  it('Continue writes the current slider value as a side effect, without blocking navigation', async () => {
    mockGetReadyDistribution.mockResolvedValue([]);
    await renderPage();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockSubmitReadyValue).toHaveBeenCalledWith(7);
    expect(mockNavigate).toHaveBeenCalledWith('/meet', { state: { fromReady: true } });
  });
});
