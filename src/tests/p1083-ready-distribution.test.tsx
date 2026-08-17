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

// The marks render ON the slider track (not as a standalone chart above it) — a
// separate row was reviewed as unreadable, see the ready-page file header. At N=0
// nothing renders at all: no marks, no axis of its own, no sr-only label. Silence
// reads as quiet; an empty axis would be a placeholder announcing a shortfall.
const marksLayer = () => document.querySelector('[data-testid="others-marks"]');
const marks = () => marksLayer()?.querySelectorAll('span') ?? [];
const othersLabel = () =>
  screen.queryByRole('img', { name: /how up for thinking others are/i });

beforeEach(() => {
  mockNavigate.mockClear();
  mockGetReadyDistribution.mockReset();
  mockSubmitReadyValue.mockReset();
});

describe('P1083 — /ready distribution', () => {
  it('renders one mark per other respondent, fetched on load before any answer is submitted', async () => {
    mockGetReadyDistribution.mockResolvedValue([2, 5, 9]);
    await renderPage();
    expect(mockGetReadyDistribution).toHaveBeenCalledTimes(1);
    expect(mockSubmitReadyValue).not.toHaveBeenCalled();
    expect(marks()).toHaveLength(3);
    expect(othersLabel()).toBeInTheDocument();
  });

  it('one mark per respondent even when several share a value — never collapsed into one', async () => {
    // Count-preserving is the whole reason this is marks and not a curve or a bar:
    // 6 people on one value must render as 6 things, not as a single darker dot.
    mockGetReadyDistribution.mockResolvedValue([7, 7, 7, 7, 7, 7]);
    await renderPage();
    expect(marks()).toHaveLength(6);
  });

  it('a crowd grows wider, never taller — the pile can never reach the question above', async () => {
    // 40 people on one value. Height is capped by construction (see ghostPositions);
    // an uncapped pile would climb into the question text.
    mockGetReadyDistribution.mockResolvedValue(Array.from({ length: 40 }, () => 7));
    await renderPage();
    const tops = Array.from(marks()).map((el) =>
      parseFloat(((el as HTMLElement).style.top.match(/-\s*([\d.]+)px/) ?? ['', '0'])[1])
    );
    expect(marks()).toHaveLength(40);
    // Clearance budget above the track: 40px flex gap + 16px of added padding, minus
    // the mark's own half-height and ring. Anything under 45 cannot reach the question.
    expect(Math.max(...tops)).toBeLessThanOrEqual(45);
  });

  it('marks never overlap — a fused blob is not a count-preserving encoding', async () => {
    // Two review rounds died here: marks packed tighter than their own 14px footprint
    // (10px circle + 2px ring each side) merge into one silhouette, and independent
    // QA read the result as "a bunch of grapes" / "a pinecone" / "a typing indicator"
    // rather than as people. Showing one mark per person is worthless if the marks
    // visually fuse, so minimum separation IS the encoding, not a styling preference.
    mockGetReadyDistribution.mockResolvedValue(Array.from({ length: 12 }, () => 7));
    await renderPage();
    const pts = Array.from(marks()).map((el) => {
      const style = (el as HTMLElement).style;
      const dx = parseFloat((style.left.match(/([+-]?\s*[\d.]+)px/) ?? ['', '0'])[1].replace(/\s/g, ''));
      const dy = parseFloat((style.top.match(/-\s*([\d.]+)px/) ?? ['', '0'])[1]);
      return { dx, dy };
    });
    expect(pts).toHaveLength(12);
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        closest = Math.min(closest, Math.hypot(pts[i].dx - pts[j].dx, pts[i].dy - pts[j].dy));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(14);
  });

  it('marks on the visitor\'s own value clear the thumb instead of hiding under it', async () => {
    // The thumb spans ±18px around the track centre; anything below that is invisible.
    mockGetReadyDistribution.mockResolvedValue([5, 5, 5]); // 5 = the untouched thumb
    await renderPage();
    const tops = Array.from(marks()).map((el) =>
      parseFloat(((el as HTMLElement).style.top.match(/-\s*([\d.]+)px/) ?? ['', '0'])[1])
    );
    expect(tops).toHaveLength(3);
    tops.forEach((t) => expect(t).toBeGreaterThanOrEqual(19));
    // …and are heaped, never laid out as one even row. Three evenly-spaced dots in
    // a line above a circle is the chat "typing…" glyph; QA rated that the single
    // most likely misread of the feature, and it gets MORE convincing the cleaner
    // the spacing is. A heap carries no competing convention.
    expect(new Set(tops).size).toBeGreaterThan(1);
  });

  it('a lifted crowd stays under the question too — the taller start does not buy it more height', async () => {
    mockGetReadyDistribution.mockResolvedValue(Array.from({ length: 40 }, () => 5));
    await renderPage();
    const tops = Array.from(marks()).map((el) =>
      parseFloat(((el as HTMLElement).style.top.match(/-\s*([\d.]+)px/) ?? ['', '0'])[1])
    );
    expect(tops).toHaveLength(40);
    expect(Math.max(...tops)).toBeLessThanOrEqual(45);
  });

  it('the caption appears only when there is someone to caption', async () => {
    mockGetReadyDistribution.mockResolvedValue([3]);
    const { container } = await renderPage();
    expect(container.textContent).toContain('Others, right now');
    // …and still carries no count, percentage, or anonymity claim (spec Non-Goals).
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/anonymized|aggregate|nobody|no one/i);
  });

  it('empty state (N=0): nothing renders at all — no marks, no caption, not an error', async () => {
    mockGetReadyDistribution.mockResolvedValue([]);
    const { container } = await renderPage();
    expect(marksLayer()).toBeNull();
    expect(othersLabel()).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Others, right now');
    // The slider's own axis still renders — the page is unchanged, not emptied.
    expect(screen.getByText('Keep it light')).toBeInTheDocument();
    expect(screen.queryByText(/error|failed|unavailable/i)).not.toBeInTheDocument();
  });

  it('a distribution-fetch failure fails silently to the empty state, never surfaces an error', async () => {
    mockGetReadyDistribution.mockRejectedValue(new Error('network down'));
    await renderPage();
    expect(marksLayer()).toBeNull();
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
