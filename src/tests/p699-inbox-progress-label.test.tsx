/**
 * @file p699-inbox-progress-label.test.tsx
 * @description Canary tests for P699 UI string changes.
 *
 * Bug 2: Receiver inbox progress label says "N of M stories complete" (wrong unit).
 *        Should say "N of M steps".
 * Bug 3: Sent tab collapsed-card summary says "0 of 1 completed" (no unit).
 *        Should say "0 of 1 recipients completed".
 *
 * CANARY: Both tests FAIL before the frontend fix and PASS after.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/app/utils/format-time', () => ({
  formatTimeAgo: () => '5 minutes',
}));

vi.mock('@/app/data/letters-service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/data/letters-service')>();
  return {
    ...original,
    getInboxItems: vi.fn().mockResolvedValue([]),
    markDeliveryRead: vi.fn().mockResolvedValue(undefined),
    getAllSentLetters: vi.fn().mockResolvedValue([]),
    getDeliveriesForLetters: vi.fn().mockResolvedValue({}),
  };
});

// Mock auth context so components that use useAuth don't throw
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, isLoading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock LetterReceiverModal (uses useAuth internally) to avoid deep dependency chain
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({
  LetterReceiverModal: () => null,
}));

// Mock DropdownMenu to avoid Radix portal issues in jsdom
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
}));

// ─── Bug 2: InboxTab progress label ───────────────────────────────────────────

describe('P699 Bug 2: InboxTab progress label uses "steps" not "stories complete"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CANARY: received item with steps_completed shows "N of M steps" — fails before fix', async () => {
    const { getInboxItems } = await import('@/app/data/letters-service');
    vi.mocked(getInboxItems).mockResolvedValueOnce([
      {
        type: 'received',
        delivery_id: 'delivery-1',
        letter_id: 'letter-1',
        title: 'Test Letter',
        actor_name: 'Alice',
        timestamp: new Date().toISOString(),
        read_at: null,
        completed_at: null,
        stories_rated: 1,
        total_stories: 3,
        steps_completed: 3,
        total_steps: 9,
      },
    ]);

    const { InboxTab } = await import('@/app/components/letters/inbox-tab');
    render(<InboxTab userId="user-1" />);

    // Wait for the async load to complete
    await screen.findByRole('button');

    // CANARY: Before fix, text is "1 of 3 stories complete" — this assertion fails.
    // After fix, text is "3 of 9 steps" — assertion passes.
    expect(screen.getByText('3 of 9 steps')).toBeInTheDocument();
  });

  it('old "stories complete" text is absent after fix', async () => {
    const { getInboxItems } = await import('@/app/data/letters-service');
    vi.mocked(getInboxItems).mockResolvedValueOnce([
      {
        type: 'received',
        delivery_id: 'delivery-1',
        letter_id: 'letter-1',
        title: 'Test Letter',
        actor_name: 'Alice',
        timestamp: new Date().toISOString(),
        read_at: null,
        completed_at: null,
        stories_rated: 1,
        total_stories: 3,
        steps_completed: 3,
        total_steps: 9,
      },
    ]);

    const { InboxTab } = await import('@/app/components/letters/inbox-tab');
    render(<InboxTab userId="user-1" />);

    await screen.findByRole('button');

    // After fix "stories complete" should no longer appear.
    expect(screen.queryByText(/stories complete/i)).toBeNull();
  });
});

// ─── Bug 3: Sent tab summary copy ─────────────────────────────────────────────

describe('P699 Bug 3: Sent tab summary uses "recipients completed"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CANARY: summary contains "0 of 1 recipients completed" — fails before fix', async () => {
    const { getAllSentLetters, getDeliveriesForLetters } =
      await import('@/app/data/letters-service');

    const mockLetter = {
      id: 'letter-1',
      source_doc_id: 'doc-1',
      sender_id: 'user-1',
      mode: 'one-to-one' as const,
      status: 'sealed' as const,
      created_at: new Date().toISOString(),
      sealed_at: new Date().toISOString(),
      expired_at: null,
      doc_title: 'Test Letter',
    };

    const mockDelivery = {
      id: 'delivery-1',
      letter_id: 'letter-1',
      receiver_email: 'bob@example.com',
      receiver_profile_id: null,
      receiver_name: null,
      invitation_token: 'token-abc',
      invitation_expires_at: null,
      access_token_expires_at: null,
      status: 'sent' as const,
      stories_rated: 0,
      opened_at: null,
      completed_at: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    vi.mocked(getAllSentLetters).mockResolvedValueOnce([mockLetter as never]);
    // getDeliveriesForLetters returns Record<letterId, LetterDelivery[]>
    vi.mocked(getDeliveriesForLetters).mockResolvedValueOnce({ 'letter-1': [mockDelivery as never] } as never);

    const { SentTab } = await import('@/app/components/letters/sent-tab');
    render(<SentTab userId="user-1" />);

    // Wait for data load
    await vi.waitFor(
      () => { expect(screen.queryByText(/sealed/i)).toBeTruthy(); },
      { timeout: 3000 }
    );

    // CANARY: Before fix — text is "0 of 1 completed" (no "recipients").
    // After fix — text contains "0 of 1 recipients completed".
    expect(screen.getByText(/0 of 1 recipients completed/i)).toBeInTheDocument();
  });
});
