/**
 * @file p716-results-navigation.test.tsx
 * @description Regression tests for P716: Sender's results view missing recipient data.
 *
 * Root cause: sender navigation to /results omitted the `?delivery=` URL param,
 * so get_letter_results RPC received p_delivery_id=NULL and returned empty
 * ratings and point_responses. Sender saw "Not yet rated" and no positions.
 *
 * These tests render the actual production InboxTab component and assert that
 * clicking the "Results" button navigates to a URL that includes `?delivery=`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import type { InboxItem } from '@/app/types';

// ---------------------------------------------------------------------------
// Mock useNavigate
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ---------------------------------------------------------------------------
// Mock letters-service
// ---------------------------------------------------------------------------

const mockGetInboxItems = vi.fn();
const mockMarkDeliveryRead = vi.fn();

vi.mock('@/app/data/letters-service', async () => {
  const actual = await vi.importActual('@/app/data/letters-service');
  return {
    ...actual,
    getInboxItems: (...args: unknown[]) => mockGetInboxItems(...args),
    markDeliveryRead: (...args: unknown[]) => mockMarkDeliveryRead(...args),
  };
});

// ---------------------------------------------------------------------------
// Mock analytics
// ---------------------------------------------------------------------------

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSenderItem(type: InboxItem['type'], overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    type,
    delivery_id: 'del-test-123',
    letter_id: 'letter-test-456',
    title: 'Test Letter',
    actor_name: 'Test Recipient',
    timestamp: new Date().toISOString(),
    read_at: new Date().toISOString(), // already read — skip markDeliveryRead
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

async function renderAndClickResults(item: InboxItem) {
  mockGetInboxItems.mockResolvedValue([item]);
  mockMarkDeliveryRead.mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <InboxTab userId="user-1" />
    </MemoryRouter>
  );
  // The action button renders as "Results" for all non-received items,
  // and "Open" for received items that haven't been completed yet.
  const button = await screen.findByRole('button', { name: /results/i });
  await userEvent.click(button);
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('P716 regression: sender Results button includes ?delivery= param', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetInboxItems.mockReset();
    mockMarkDeliveryRead.mockReset();
  });

  it('recipient_responded: Results button navigates with ?delivery= param', async () => {
    const item = makeSenderItem('recipient_responded');
    await renderAndClickResults(item);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
    );
  });

  it('link_respondent: Results button navigates with ?delivery= param', async () => {
    const item = makeSenderItem('link_respondent');
    await renderAndClickResults(item);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
    );
  });

  it('recipient_in_progress: Results button navigates with ?delivery= param (regression baseline)', async () => {
    const item = makeSenderItem('recipient_in_progress', { completed_at: null });
    await renderAndClickResults(item);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
    );
  });

  it('received + completed: Results button navigates receiver to their results', async () => {
    const item = makeSenderItem('received');
    await renderAndClickResults(item);

    // Receiver path: completed_at is set → goes to results with delivery param
    // Uses letter_id (not delivery_id) for the route, per inbox-tab.tsx receiver branch
    expect(mockNavigate).toHaveBeenCalledWith(
      `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
    );
  });

  it('received + not completed: Open button navigates to reading flow (not results)', async () => {
    const item = makeSenderItem('received', { completed_at: null, read_at: null });
    mockGetInboxItems.mockResolvedValue([item]);
    mockMarkDeliveryRead.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <InboxTab userId="user-1" />
      </MemoryRouter>
    );
    const button = await screen.findByRole('button', { name: /open/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/letter/${item.delivery_id}`);
    });
  });
});
