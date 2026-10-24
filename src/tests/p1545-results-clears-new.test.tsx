/**
 * @file p1545-results-clears-new.test.tsx
 * @description P1545: a person's "new" mark (unread inbox item + unread explain-backs) is cleared when the
 * sender's results page for that delivery has actually rendered, not when a link to it is clicked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const nav = vi.hoisted(() => ({ search: 'delivery=d1&story=s1' }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'letter-1' }),
    useSearchParams: () => [new URLSearchParams(nav.search), vi.fn()],
    useNavigate: () => vi.fn(),
  };
});
vi.mock('@/auth', () => {
  const auth = { user: { id: 'user-1' }, sessionChecked: true, isLoading: false };
  return { useAuth: () => auth };
});
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/letters/story-walk', () => ({ StoryWalk: () => <div /> }));
vi.mock('@/app/components/letters/letter-participant-row', () => ({ LetterParticipantRow: () => <div /> }));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => <div /> }));
vi.mock('@/app/components/layout/bottom-back-button', () => ({ BottomBackButton: () => <div /> }));

const svc = vi.hoisted(() => ({
  getLetterResults: vi.fn(),
  getExplainBacksForDelivery: vi.fn(),
  getDeliveriesForLetter: vi.fn(),
  uploadExplainBack: vi.fn(),
  getProfileNames: vi.fn(),
  getLetterPositionStories: vi.fn(),
  markDeliveryRead: vi.fn(),
  markExplainBackRead: vi.fn(),
}));
vi.mock('@/app/data/letters-service', () => svc);
vi.mock('@/app/data/points-service', () => ({
  pointsService: { getMyPositionsForPoints: vi.fn().mockResolvedValue(new Map()), setPosition: vi.fn(), removePosition: vi.fn() },
}));

import { LetterResultsPage } from '@/app/pages/letter-results-page';

const results = (perspective: 'sender' | 'receiver') => ({
  perspective, snapshots: [], pointResponses: [], predictions: [], ratings: [],
  senderProfile: { id: 'snd', name: 'Alice' }, receiverProfile: { id: 'rcv', name: 'Bob' },
  senderName: 'Alice', receiverName: 'Bob',
});

const renderPage = () => render(<MemoryRouter><LetterResultsPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = 'delivery=d1&story=s1';
  svc.getLetterResults.mockImplementation(async () => results('sender')); // a fresh object per load, as the service returns
  svc.getExplainBacksForDelivery.mockResolvedValue([{ id: 'eb1', recorder_id: 'rcv', story_id: 's1', author_read_at: null }, { id: 'eb2', recorder_id: 'rcv', story_id: 's2', author_read_at: 'x' }]);
  svc.getProfileNames.mockResolvedValue({});
  svc.getLetterPositionStories.mockResolvedValue(new Map());
  svc.markDeliveryRead.mockResolvedValue(undefined);
  svc.markExplainBackRead.mockResolvedValue(undefined);
});

describe('results page clears the sender\'s "new" for that delivery', () => {
  it('once rendered: marks the delivery and only its unread explain-backs read', async () => {
    renderPage();
    await waitFor(() => expect(svc.markDeliveryRead).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(svc.markExplainBackRead).toHaveBeenCalledTimes(1));
    expect(svc.markExplainBackRead).toHaveBeenCalledWith('eb1');
  });

  it('not before the page has rendered (results still loading)', async () => {
    svc.getLetterResults.mockReturnValue(new Promise(() => {}));
    renderPage();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(svc.markDeliveryRead).not.toHaveBeenCalled();
  });

  it('not when the results are not found', async () => {
    svc.getLetterResults.mockResolvedValue(null);
    renderPage();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(svc.markDeliveryRead).not.toHaveBeenCalled();
  });

  it('never for the receiver\'s own results', async () => {
    svc.getLetterResults.mockResolvedValue(results('receiver'));
    renderPage();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(svc.markDeliveryRead).not.toHaveBeenCalled();
    expect(svc.markExplainBackRead).not.toHaveBeenCalled();
  });

  it('never on the sender\'s all-deliveries view (no ?delivery=)', async () => {
    nav.search = '';
    svc.getDeliveriesForLetter.mockResolvedValue([]);
    renderPage();
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(svc.markDeliveryRead).not.toHaveBeenCalled();
  });

  it('a failed mark is retried on the next render of the page (refetch), not lost', async () => {
    svc.markDeliveryRead.mockRejectedValueOnce(new Error('x'));
    renderPage();
    await waitFor(() => expect(svc.markDeliveryRead).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(svc.markDeliveryRead).toHaveBeenCalledTimes(2));
  });
});
