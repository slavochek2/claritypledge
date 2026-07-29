import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InboxTab } from './inbox-tab';
import type { ReactNode } from 'react';
import type { InboxItem } from '@/app/types';

// Mock letters-service before imports
vi.mock('@/app/data/letters-service', () => ({
  getInboxItems: vi.fn(),
  markDeliveryRead: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn().mockResolvedValue({}),
}));

// Mock sonner toast to avoid side effects
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { getInboxItems } from '@/app/data/letters-service';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const unreadItem: InboxItem = {
  type: 'received',
  delivery_id: 'delivery-1',
  letter_id: 'letter-1',
  title: 'Test Letter',
  actor_name: 'Alice',
  timestamp: '2026-04-10T10:00:00Z',
  read_at: null,
  completed_at: null,
};

const readItem: InboxItem = {
  type: 'received',
  delivery_id: 'delivery-2',
  letter_id: 'letter-2',
  title: 'Another Letter',
  actor_name: 'Bob',
  timestamp: '2026-04-09T10:00:00Z',
  read_at: '2026-04-10T12:00:00Z',
  completed_at: null,
};

const completedReceivedItem: InboxItem = {
  type: 'received',
  delivery_id: 'delivery-3',
  letter_id: 'letter-3',
  title: 'Completed Letter',
  actor_name: 'Carol',
  timestamp: '2026-04-08T10:00:00Z',
  read_at: '2026-04-08T11:00:00Z',
  completed_at: '2026-04-08T12:00:00Z',
};

describe('InboxTab — P689 read/unread indicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInboxItems).mockResolvedValue([unreadItem, readItem]);
  });

  it('renders dot element on BOTH unread and read rows (layout-preserving invariant)', async () => {
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });

    // Wait for items to load
    await screen.findByText(/Alice/);

    // Query per-row so we're asserting each row has a dot, not a global count
    const rows = container.querySelectorAll('.rounded-lg.border');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      const dot = row.querySelector('span[aria-hidden="true"].rounded-full');
      expect(dot).not.toBeNull();
    });
  });

  it('unread row dot has opacity-100, read row dot has opacity-0', async () => {
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });

    await screen.findByText(/Alice/);

    const unreadRow = container.querySelector('[data-unread="true"]') as HTMLElement;
    const unreadDot = unreadRow.querySelector('span[aria-hidden="true"].rounded-full') as HTMLElement;
    expect(unreadDot.className).toContain('opacity-100');

    // Read row: no data-unread attribute
    const allRows = container.querySelectorAll('.rounded-lg.border');
    const readRow = Array.from(allRows).find(
      (el) => !el.hasAttribute('data-unread')
    ) as HTMLElement;
    const readDot = readRow.querySelector('span[aria-hidden="true"].rounded-full') as HTMLElement;
    expect(readDot.className).toContain('opacity-0');
  });

  it('unread row has sr-only "Unread" label; read row does not', async () => {
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });

    await screen.findByText(/Alice/);

    const unreadRow = container.querySelector('[data-unread="true"]') as HTMLElement;
    const srLabel = unreadRow.querySelector('.sr-only');
    expect(srLabel).not.toBeNull();
    expect(srLabel!.textContent).toContain('Unread');

    const allRows = container.querySelectorAll('.rounded-lg.border');
    const readRow = Array.from(allRows).find(
      (el) => !el.hasAttribute('data-unread')
    ) as HTMLElement;
    const readSrLabel = readRow.querySelector('.sr-only');
    expect(readSrLabel).toBeNull();
  });

  it('unread row has data-unread="true"; read row does not have the attribute', async () => {
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });

    await screen.findByText(/Alice/);

    const unreadRow = container.querySelector('[data-unread="true"]');
    expect(unreadRow).not.toBeNull();
    expect(unreadRow).toHaveAttribute('data-unread', 'true');

    const allRows = container.querySelectorAll('.rounded-lg.border');
    const readRow = Array.from(allRows).find(
      (el) => !el.hasAttribute('data-unread')
    ) as HTMLElement;
    expect(readRow).not.toHaveAttribute('data-unread');
  });

  it('unread row has bg-blue-500/5 class; read row has bg-card class', async () => {
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });

    await screen.findByText(/Alice/);

    const unreadRow = container.querySelector('[data-unread="true"]') as HTMLElement;
    expect(unreadRow.className).toContain('bg-blue-500/5');

    const allRows = container.querySelectorAll('.rounded-lg.border');
    const readRow = Array.from(allRows).find(
      (el) => !el.hasAttribute('data-unread')
    ) as HTMLElement;
    expect(readRow.className).toContain('bg-card');
  });
});

describe('InboxTab — canary: recipient_responded renders "completed" message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Bob completed My Letter" for a recipient_responded item', async () => {
    const respondedItem: InboxItem = {
      type: 'recipient_responded',
      delivery_id: 'delivery-responded',
      letter_id: 'letter-responded',
      title: 'My Letter',
      actor_name: 'Bob',
      timestamp: '2026-04-10T10:00:00Z',
      read_at: null,
      completed_at: null,
    };
    vi.mocked(getInboxItems).mockResolvedValue([respondedItem]);
    render(<InboxTab userId="test-user" />, { wrapper });

    // Canary: must render "Bob completed My Letter"
    await screen.findByText(/Bob/);
    const messageEl = screen.getByText(/completed/i);
    expect(messageEl).toBeTruthy();
  });

  it('renders "Someone responded to My Letter" for a link_respondent item', async () => {
    const linkItem: InboxItem = {
      type: 'link_respondent',
      delivery_id: 'delivery-link',
      letter_id: 'letter-link',
      title: 'My Letter',
      actor_name: 'Someone',
      timestamp: '2026-04-10T10:00:00Z',
      read_at: null,
      completed_at: null,
    };
    vi.mocked(getInboxItems).mockResolvedValue([linkItem]);
    render(<InboxTab userId="test-user" />, { wrapper });

    await screen.findByText(/responded/i);
    const messageEl = screen.getByText(/responded to/i);
    expect(messageEl).toBeTruthy();
  });
});

describe('InboxTab — P695 completed letter button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pending received item shows "Open" button with blue fill', async () => {
    vi.mocked(getInboxItems).mockResolvedValue([unreadItem]);
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });
    await screen.findByText(/Alice/);

    const button = container.querySelector('button');
    expect(button?.textContent).toContain('Open');
    expect(button?.className).toContain('bg-blue-500');
  });

  it('completed received item shows "Results" button with blue fill (matches sent-tab)', async () => {
    vi.mocked(getInboxItems).mockResolvedValue([completedReceivedItem]);
    const { container } = render(<InboxTab userId="test-user" />, { wrapper });
    await screen.findByText(/Carol/);

    const button = container.querySelector('button');
    expect(button?.textContent).toContain('Results');
    expect(button?.className).toContain('bg-blue-500');
  });
});

// P1011 / JAVASCRIPT-REACT-2F. A poll failure used to blank the list and, once
// getInboxItems swallowed the error into [], render "No letters or responses
// yet" to a user who had letters. It also toasted on every tick — this view
// polls on an interval AND on every visibilitychange.
describe('InboxTab — transient poll failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the loaded list on screen and marks it stale when a later poll fails', async () => {
    vi.mocked(getInboxItems)
      .mockResolvedValueOnce([unreadItem])
      .mockRejectedValue(new Error('Failed to load inbox: JWT expired'));

    render(<InboxTab userId="user-id-1234" />, { wrapper });

    // First poll succeeded — the letter renders.
    expect(await screen.findByText('Test Letter')).toBeInTheDocument();

    vi.mocked(getInboxItems).mock.results.length = 0;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Second poll failed: the letter is STILL there, plus a stale notice.
    expect(screen.getByText('Test Letter')).toBeInTheDocument();
    expect(await screen.findByTestId('inbox-stale-notice')).toBeInTheDocument();
    expect(screen.queryByText('No letters or responses yet.')).not.toBeInTheDocument();
  });

  it('shows the error state (not the empty state) when the FIRST load fails', async () => {
    vi.mocked(getInboxItems).mockRejectedValue(new Error('Failed to load inbox'));

    render(<InboxTab userId="user-id-1234" />, { wrapper });

    expect(
      await screen.findByText('Something went wrong loading your inbox.')
    ).toBeInTheDocument();
    // The bug this fixes: a failure must never read as "you have no letters".
    expect(screen.queryByText('No letters or responses yet.')).not.toBeInTheDocument();
  });

  it('still shows the empty state for a genuinely empty inbox', async () => {
    vi.mocked(getInboxItems).mockResolvedValue([]);

    render(<InboxTab userId="user-id-1234" />, { wrapper });

    expect(await screen.findByText('No letters or responses yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-stale-notice')).not.toBeInTheDocument();
  });

  it('toasts once per failure streak, not once per poll', async () => {
    const { toast } = await import('sonner');
    vi.mocked(getInboxItems).mockRejectedValue(new Error('Failed to load inbox'));

    render(<InboxTab userId="user-id-1234" />, { wrapper });
    await screen.findByText('Something went wrong loading your inbox.');

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }

    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
  });
});
