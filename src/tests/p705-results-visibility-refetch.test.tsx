/**
 * @file p705-results-visibility-refetch.test.tsx
 * @description Canary regression test for P705: results page must refetch viewer
 * positions when the tab regains focus (visibilitychange → visible).
 *
 * Canary gate:
 *   Before fix: visibilitychange fires but fetchData is never re-invoked →
 *               getMyPositionsForPoints called only ONCE (on mount) → test fails.
 *   After fix:  the visibilitychange listener calls fetchData() again →
 *               getMyPositionsForPoints called TWICE → test passes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LetterResultsPage } from '@/app/pages/letter-results-page';

// ── Router mocks ──────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'letter-1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useNavigate: () => vi.fn(),
  };
});

// ── Auth mock ─────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1', email: 'test@example.com' };
vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    sessionChecked: true,
    isLoading: false,
  }),
}));

// ── Analytics mock ────────────────────────────────────────────────────────────

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockGetLetterResults = vi.fn();
vi.mock('@/app/data/letters-service', () => ({
  getLetterResults: (...args: unknown[]) => mockGetLetterResults(...args),
}));

const mockGetMyPositions = vi.fn();
vi.mock('@/app/data/points-service', () => ({
  pointsService: {
    getMyPositionsForPoints: (...args: unknown[]) => mockGetMyPositions(...args),
    setPosition: vi.fn(),
    removePosition: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function stubVisibilityState(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value,
    writable: true,
    configurable: true,
  });
}

const minimalLetterResults = {
  perspective: 'sender' as const,
  snapshots: [],
  pointResponses: [],
  predictions: [],
  ratings: [],
  senderProfile: null,
  receiverProfile: null,
  senderName: 'Alice',
  receiverName: 'Bob',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P705: results page visibility-refetch canary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLetterResults.mockResolvedValue(minimalLetterResults);
    mockGetMyPositions.mockResolvedValue(new Map());
    stubVisibilityState('hidden');
  });

  afterEach(() => {
    stubVisibilityState('visible');
  });

  it('refetches getMyPositionsForPoints when tab regains focus', async () => {
    render(
      <MemoryRouter>
        <LetterResultsPage />
      </MemoryRouter>
    );

    // Wait for initial mount fetch to complete
    await waitFor(() => {
      expect(mockGetMyPositions).toHaveBeenCalledTimes(1);
    });

    // Simulate tab becoming visible
    stubVisibilityState('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // visibilitychange listener must trigger a second fetch
    expect(mockGetMyPositions).toHaveBeenCalledTimes(2);
  });
});
