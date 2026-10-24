import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getLetterOverview: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(),
  markDeliveryRead: vi.fn(),
  getExplainBacksForDelivery: vi.fn(),
  markExplainBackRead: vi.fn(),
}));

vi.mock('@/auth', () => {
  const auth = { user: { id: 'me' }, isLoading: false, sessionChecked: true }; // stable ref: a new user object per render would refetch forever
  return { useAuth: () => auth };
});
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
  LetterReceiverModal: ({ letterId, onRecipientAdded }: { letterId: string; onRecipientAdded?: () => void }) => (
    <div data-testid="receiver-modal">{letterId}<button onClick={onRecipientAdded}>mock-added</button></div>
  ),
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
    expect(within(section).getByText('Done')).toBeInTheDocument();
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

  it('shows the new mark; clicking Results marks nothing read (the results page does, once rendered)', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ d1: 1 });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByText('1 new')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('link', { name: 'Results' }));
    expect(mocks.markDeliveryRead).not.toHaveBeenCalled();
    expect(mocks.markExplainBackRead).not.toHaveBeenCalled();
  });

  it('an unread finished delivery is new even with no explain-backs', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv({ read_at: null })] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByText('1 new')).toBeInTheDocument();
  });

  it('a read finished delivery is not new', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv({ read_at: '2026-10-06T10:00:00Z' })] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).queryByText(/new/)).toBeNull();
  });

  it('a failed overview read shows Retry, not "Not authorized"; an empty answer is "Not authorized"', async () => {
    mocks.getLetterOverview.mockRejectedValue(new Error('rpc down'));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    const first = renderPage();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('Not authorized.')).toBeNull();
    first.unmount();
    mocks.getLetterOverview.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText('Not authorized.')).toBeInTheDocument();
  });

  it('an older request never overwrites a newer letter', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mocks.getLetterOverview.mockImplementation((id: string) =>
      id === 'l1' ? new Promise(r => { resolveOld = r; }) : Promise.resolve(payload({ id: 'l2', title: 'Second letter' })));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [], l2: [] });
    render(
      <MemoryRouter initialEntries={['/letter/l1/overview']}>
        <Link to="/letter/l2/overview">go-l2</Link>
        <Routes><Route path="/letter/:id/overview" element={<LetterOverviewPage />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.getLetterOverview).toHaveBeenCalledWith('l1'));
    fireEvent.click(screen.getByText('go-l2'));
    expect(await screen.findByText('Second letter')).toBeInTheDocument();
    resolveOld(payload({ id: 'l1', title: 'First letter' }));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText('Second letter')).toBeInTheDocument();
    expect(screen.queryByText('First letter')).toBeNull();
  });

  it('after Add recipients succeeds the page refreshes in place, without the full-page skeleton', async () => {
    mocks.getLetterOverview.mockResolvedValueOnce(payload());
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add recipients' }));
    let resolveSecond: (v: unknown) => void = () => {};
    mocks.getLetterOverview.mockImplementationOnce(() => new Promise(r => { resolveSecond = r; }));
    fireEvent.click(await screen.findByText('mock-added'));
    await waitFor(() => expect(mocks.getLetterOverview).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('letter-recipients')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeNull();
    resolveSecond(payload());
  });

  it('Preview is hidden when the letter has no source doc', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({ source_doc_id: null }));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    renderPage();
    await screen.findByTestId('letter-recipients');
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
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
