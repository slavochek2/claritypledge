/**
 * @file p727-letters-polling-loading-interrupts-ui.test.tsx
 * @description P727 canary: background poll must NOT replace the inbox list with a full
 * loading screen. Items must remain visible while a refresh is in flight.
 *
 * Bug: setFetchState('loading') is called on EVERY poll cycle — initial load and
 * background refreshes alike. When the 15-second interval fires, the ClarityLoader
 * replaces the list entirely, destroying any open expanded card, modal, or
 * partially-typed email input.
 *
 * Canary gate:
 *   Before fix: items disappear (replaced by spinner) when background poll fires.
 *   After fix:  items stay visible; refresh happens silently in background.
 *
 * Test strategy: trigger a background fetch via the visibilitychange pathway
 * (which calls fetchItems() directly), make that fetch stay pending, then assert
 * the list is still visible while the in-flight fetch has not yet resolved.
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import type { InboxItem } from '@/app/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'user-p727', email: 'user@example.com' },
  }),
}));

vi.mock('@/app/data/letters-service', () => ({
  getInboxItems: vi.fn(),
  markDeliveryRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ITEMS: InboxItem[] = [
  {
    delivery_id: 'delivery-p727',
    letter_id: 'letter-p727',
    type: 'received',
    title: 'P727 Test Letter',
    actor_name: 'Alice',
    timestamp: new Date().toISOString(),
    read_at: null,
    completed_at: null,
    steps_completed: undefined,
    total_steps: undefined,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P727: InboxTab background poll must not replace list with loading screen', () => {
  afterEach(() => {
    vi.clearAllMocks();
    // Restore visibilityState to default
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
  });

  // it.fails() marks this as an expected failure: passes in suite before fix (bug confirmed),
  // breaks suite after fix (signaling the it.fails wrapper must be removed by /fix).
  it.fails('keeps items visible while background poll is in flight', async () => {
    const { getInboxItems } = await import('@/app/data/letters-service');
    const mockFetch = vi.mocked(getInboxItems);

    // First call resolves immediately (initial load)
    mockFetch.mockResolvedValueOnce(ITEMS);

    // Second call (background refresh triggered by visibilitychange) stays pending —
    // simulates in-flight refresh. This is the window where the bug fires:
    // setFetchState('loading') replaces the list before the fetch completes.
    mockFetch.mockImplementationOnce(
      () => new Promise<InboxItem[]>(() => {
        // intentionally never resolves
      })
    );

    render(
      <MemoryRouter>
        <InboxTab userId="user-p727" />
      </MemoryRouter>
    );

    // Wait for initial load — list must appear
    await waitFor(() => {
      expect(screen.getByText('P727 Test Letter')).toBeInTheDocument();
    });

    // Confirm initial fetch ran
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Trigger a background refresh via visibilitychange (directly calls fetchItems)
    await act(async () => {
      // Simulate tab switching hidden → visible
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Confirm background fetch was triggered
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // CANARY ASSERTION: items must stay visible while background refresh is in flight.
    // Before fix: setFetchState('loading') fires → ClarityLoader replaces list →
    //   getByText throws AND role="img" loading spinner appears.
    // After fix:  loading state only set on first fetch → items remain visible.
    expect(screen.getByText('P727 Test Letter')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Loading' })).not.toBeInTheDocument();
  });
});
