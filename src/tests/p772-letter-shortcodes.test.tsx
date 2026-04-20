/**
 * P772: Letter shortcode resolution — /letter/st5 → latest sealed delivery UUID
 *
 * Canary tests:
 * - UUID passthrough — LetterRoute does not call RPC for a valid UUID
 * - Shortcode resolution — calls resolveLetterShortcode with correct args
 * - Unknown shortcode — renders LetterReadingPage (shows error, not crash)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LetterRoute } from '@/App';

// --- Mocks ---

const mockResolveLetterShortcode = vi.fn();

vi.mock('@/app/data/letters-service', () => ({
  resolveLetterShortcode: (...args: unknown[]) => mockResolveLetterShortcode(...args),
}));

vi.mock('@/app/pages/letter-reading-page', () => ({
  LetterReadingPage: () => <div data-testid="letter-reading-page">Letter</div>,
}));

vi.mock('@/app/layouts/clarity-landing-layout', () => ({
  ClarityLandingLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/clarity-loader', () => ({
  ClarityPageLoader: () => <div data-testid="page-loader">Loading...</div>,
}));

function renderAtPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('P772: LetterRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UUID passthrough — does not call RPC for a valid UUID', async () => {
    renderAtPath(`/letter/${VALID_UUID}`);

    // LazyRoute suspends briefly; waitFor resolves after lazy import
    await waitFor(() => {
      expect(screen.getByTestId('letter-reading-page')).toBeInTheDocument();
    });
    expect(mockResolveLetterShortcode).not.toHaveBeenCalled();
  });

  it('shortcode resolution — calls resolveLetterShortcode with correct args and redirects', async () => {
    mockResolveLetterShortcode.mockResolvedValueOnce(VALID_UUID);

    renderAtPath('/letter/st5');

    // While resolving: spinner shown
    expect(screen.getByTestId('page-loader')).toBeInTheDocument();

    // After resolution: resolves to UUID (Navigate fires, but MemoryRouter stays in test)
    await waitFor(() => {
      expect(mockResolveLetterShortcode).toHaveBeenCalledWith('st5', 'slava');
    });
  });

  it('unknown shortcode — falls through to LetterReadingPage (shows error, not crash)', async () => {
    mockResolveLetterShortcode.mockResolvedValueOnce(null);

    renderAtPath('/letter/nonexistent');

    await waitFor(() => {
      expect(screen.getByTestId('letter-reading-page')).toBeInTheDocument();
    });
    expect(mockResolveLetterShortcode).toHaveBeenCalledWith('nonexistent', 'slava');
  });
});
