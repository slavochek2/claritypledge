// @vitest-environment jsdom
/**
 * P1586 invariant: a wait that never ends becomes a readable state. The three letters tabs show a
 * readable line with a Retry after the section deadline, and Retry re-runs the tab's read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const DEADLINE_MS = 10_000;
const { never } = vi.hoisted(() => ({ never: () => new Promise<never>(() => {}) }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/data/letters-service', () => ({
  getInboxItems: vi.fn(never),
  markDeliveryRead: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn().mockResolvedValue({}),
  getAllSentLetters: vi.fn(never),
  getDeliveriesForLetters: vi.fn(),
  deleteLetter: vi.fn(),
}));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUser: vi.fn(never) } }));

import { getInboxItems, getAllSentLetters } from '@/app/data/letters-service';
import { docsService } from '@/app/data/docs-service';
import { InboxTab } from '@/app/components/letters/inbox-tab';
import { SentTab } from '@/app/components/letters/sent-tab';
import { DraftsTab } from '@/app/components/letters/drafts-tab';

const tabs = [
  ['inbox', () => <InboxTab userId="user-id-1" />, getInboxItems],
  ['sent', () => <SentTab userId="user-id-1" />, getAllSentLetters],
  ['drafts', () => <DraftsTab userId="user-id-1" />, docsService.getDocsByUser],
] as const;

describe('P1586 letters tabs: a stalled read reaches a readable line', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(tabs)('%s: skeleton, then a Retry line after the deadline, and Retry re-runs the read', async (_n, ui, read) => {
    render(<MemoryRouter>{ui()}</MemoryRouter>);
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1); });
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByTestId('letter-list-skeleton')).toBeNull();
    const retry = screen.getByRole('button', { name: 'Retry' });

    const callsBefore = vi.mocked(read as () => unknown).mock.calls.length;
    fireEvent.click(retry);
    expect(vi.mocked(read as () => unknown).mock.calls.length).toBe(callsBefore + 1);
    expect(screen.getByTestId('letter-list-skeleton')).toBeTruthy();
  });
});
