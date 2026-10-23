import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getLetterOverview: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(),
  markDeliveryRead: vi.fn(),
  getExplainBacksForDelivery: vi.fn(),
  markExplainBackRead: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'me' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/app/data/letters-service', () => ({
  getLetterOverview: mocks.getLetterOverview,
  getDeliveriesForLettersOrThrow: mocks.getDeliveriesForLettersOrThrow,
  getUnreadExplainBackCountsByDelivery: mocks.getUnreadExplainBackCountsByDelivery,
  markDeliveryRead: mocks.markDeliveryRead,
  getExplainBacksForDelivery: mocks.getExplainBacksForDelivery,
  markExplainBackRead: mocks.markExplainBackRead,
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => <div /> }));
vi.mock('@/app/components/layout/bottom-back-button', () => ({ BottomBackButton: () => <div /> }));
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({
  LetterReceiverModal: ({ letterId }: { letterId: string }) => <div data-testid="receiver-modal">{letterId}</div>,
}));

import { LetterOverviewPage } from './letter-overview-page';

const payload = (over: Record<string, unknown> = {}, deliveries: unknown[] = []) => ({
  letter: {
    id: 'l1', title: 'Hello Tom', status: 'sealed', sender_id: 'me', mode: 'one-to-one',
    source_doc_id: 'doc1', sealed_at: '2026-10-03T10:00:00Z',
    sender: { profile_id: 'me', name: 'Me', slug: 'me', avatar_url: null, has_pledged: false },
    ...over,
  },
  stories: [{ story_id: 's1', position: 0, title: 'S', content: 'A story', hashtags: [], points: [] }],
  deliveries,
  predictions: [], ratings: [], pointResponses: [],
});
const ovDelivery = (id: string, completed: string | null) => ({
  delivery_id: id, display_name: 'Di', full_display_name: 'Di', profile_slug: null, profile_id: null,
  avatar_url: null, has_pledged: false, has_responded: !!completed, completed_at: completed,
});
const dv = (over: Record<string, unknown> = {}) => ({
  id: 'd1', letter_id: 'l1', receiver_email: 'di@example.com', receiver_name: 'Di', receiver_slug: null,
  status: 'completed', created_at: '2026-10-04T10:00:00Z', steps_completed: 5, total_steps: 5, ...over,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/letter/l1/overview']}>
      <Routes><Route path="/letter/:id/overview" element={<LetterOverviewPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({});
  mocks.markDeliveryRead.mockResolvedValue(undefined);
  mocks.getExplainBacksForDelivery.mockResolvedValue([]);
  mocks.markExplainBackRead.mockResolvedValue(undefined);
});

describe('LetterOverviewPage Recipients section', () => {
  it('shows Recipients above the stories, with status, a Results link and a completed person keeping Results on a pointless story', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByText('Di')).toBeInTheDocument();
    expect(within(section).getByText('done')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Results' })).toHaveAttribute('href', '/letter/l1/results?delivery=d1');
    const storyHeading = screen.getByRole('link', { name: 'A story' });
    expect(section.compareDocumentPosition(storyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the cohort table row for the completed person on a story with no points
    expect(screen.getByRole('link', { name: /open results/ })).toBeInTheDocument();
  });

  it('with no recipients it still shows the section and its actions', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload());
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    renderPage();
    expect(await screen.findByText('No recipients yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    expect(await screen.findByTestId('receiver-modal')).toHaveTextContent('l1');
  });

  it('shows the new mark and clears it, marking the explain-backs read, when Results is opened', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ d1: 1 });
    mocks.getExplainBacksForDelivery.mockResolvedValue([{ id: 'eb1', author_read_at: null }, { id: 'eb2', author_read_at: 'x' }]);
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByText('1 new')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('link', { name: 'Results' }));
    expect(within(section).queryByText('1 new')).toBeNull();
    await waitFor(() => expect(mocks.markExplainBackRead).toHaveBeenCalledTimes(1));
    expect(mocks.markExplainBackRead).toHaveBeenCalledWith('eb1');
    expect(mocks.markDeliveryRead).toHaveBeenCalledWith('d1');
  });

  it('a public letter offers Copy public link; a failed recipients read says so with Retry', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({ mode: 'one-to-many' }));
    mocks.getDeliveriesForLettersOrThrow.mockRejectedValue(new Error('x'));
    renderPage();
    expect(await screen.findByText('Something went wrong loading the recipients.')).toBeInTheDocument();
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
  });
});
