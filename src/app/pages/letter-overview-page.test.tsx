import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => <div data-testid="focus-header" /> }));
vi.mock('@/app/components/layout/bottom-back-button', () => ({ BottomBackButton: () => <div data-testid="bottom-back" /> }));
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

describe('LetterOverviewPage hierarchy', () => {
  const opened: { open: MockInstance } = { open: vi.fn() as unknown as MockInstance };
  beforeEach(() => {
    opened.open = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('reads title and sealed date, then one primary Add recipients, then the people, then the stories', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    const title = screen.getByRole('heading', { level: 1, name: 'Hello Tom' });
    const date = screen.getByText(/Sealed Oct 3/);
    const add = screen.getByRole('button', { name: 'Add recipients' });
    const storyHeading = screen.getByRole('link', { name: 'A story' });
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(title, date)).toBe(true);
    expect(follows(date, add)).toBe(true);
    expect(follows(add, section)).toBe(true);
    expect(follows(section, storyHeading)).toBe(true);
    expect(section).not.toHaveTextContent(/Sealed/); // the date lives in the header now
  });

  it('Add recipients is the one blue primary (as "+ New" on Artifacts); Preview and Copy public link are visible outline buttons next to it', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({ mode: 'one-to-many' }, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    renderPage();
    const add = await screen.findByRole('button', { name: 'Add recipients' });
    expect(add.className).toContain('bg-blue-500');
    expect(add.className).toContain('text-white');
    expect(add.className).toContain('hover:bg-blue-700');
    expect(add.className).not.toContain('bg-primary');
    const preview = screen.getByRole('button', { name: 'Preview' });
    const copy = screen.getByRole('button', { name: 'Copy public link' });
    for (const secondary of [preview, copy]) {
      expect(secondary.className).toContain('border-input'); // the shared outline variant
      expect(secondary.className).not.toMatch(/\bbg-(primary|blue-[5-9]00)\b/);
      expect(secondary.className).toMatch(/\bmin-h-10\b/);
      expect(secondary.parentElement).toBe(add.parentElement); // one row of actions
    }
    expect(add.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the overview "…" menu is gone
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    // and nothing else on the page is a second primary
    const others = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')].filter(el => el !== add);
    expect(others.filter(el => /\bbg-(primary|blue-[5-9]00)\b/.test(el.className))).toEqual([]);
  });

  it('Preview opens the draft in a new tab; Copy public link copies the public address', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mocks.getLetterOverview.mockResolvedValue(payload({ mode: 'one-to-many' }));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(opened.open).toHaveBeenCalledWith('/letter/doc1/preview', '_blank', 'noopener,noreferrer');
    await user.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/letter/l1`));
  });

  it('a private letter has Add recipients and Preview but no Copy public link; with no source doc, only Add recipients', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload());
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    const first = renderPage();
    await screen.findByRole('button', { name: 'Preview' });
    expect(screen.queryByRole('button', { name: 'Copy public link' })).toBeNull();
    first.unmount();
    mocks.getLetterOverview.mockResolvedValue(payload({ source_doc_id: null }));
    renderPage();
    await screen.findByTestId('letter-recipients');
    expect(screen.getByRole('button', { name: 'Add recipients' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy public link' })).toBeNull();
  });

  it('the whole person row opens that person\'s results; no Results link, no "open results" anywhere', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByText('Di')).toBeInTheDocument();
    expect(within(section).getByText(/Done/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Di' })).toHaveAttribute('href', '/letter/l1/results?delivery=d1');
    expect(screen.queryByRole('link', { name: /Results/ })).toBeNull();
    expect(screen.queryByText(/open results/i)).toBeNull();
    expect(screen.queryByText(/Results/)).toBeNull();
  });

  it('has one Back, at the top: no bottom Go back pill', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    renderPage();
    await screen.findByTestId('letter-recipients');
    expect(screen.getAllByTestId('focus-header')).toHaveLength(1);
    expect(screen.queryByTestId('bottom-back')).toBeNull();
  });

  it('with no recipients it still shows the section, "No recipients yet" and Add recipients', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload());
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    renderPage();
    expect(await screen.findByText('No recipients yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    expect(await screen.findByTestId('receiver-modal')).toHaveTextContent('l1');
  });

  it('shows the new mark as a dot; opening the person\'s results marks nothing read (the results page does, once rendered)', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv()] });
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ d1: 1 });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByRole('img', { name: 'New' })).toBeInTheDocument();
    expect(within(section).queryByText('1 new')).toBeNull();
    fireEvent.click(within(section).getByRole('link', { name: 'Di' }));
    expect(mocks.markDeliveryRead).not.toHaveBeenCalled();
    expect(mocks.markExplainBackRead).not.toHaveBeenCalled();
  });

  it('an unread finished delivery is new even with no explain-backs', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv({ read_at: null })] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).getByRole('img', { name: 'New' })).toBeInTheDocument();
  });

  it('a read finished delivery is not new', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({}, [ovDelivery('d1', '2026-10-05T10:00:00Z')]));
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [dv({ read_at: '2026-10-06T10:00:00Z' })] });
    renderPage();
    const section = await screen.findByTestId('letter-recipients');
    expect(within(section).queryByRole('img', { name: 'New' })).toBeNull();
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

  it('a failed recipients read says so with Retry; the page actions stay and the people list returns after Retry', async () => {
    mocks.getLetterOverview.mockResolvedValue(payload({ mode: 'one-to-many' }));
    mocks.getDeliveriesForLettersOrThrow.mockRejectedValue(new Error('x'));
    renderPage();
    expect(await screen.findByText('Something went wrong loading the recipients.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('letter-recipients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy public link' })).toBeInTheDocument();
  });
});
