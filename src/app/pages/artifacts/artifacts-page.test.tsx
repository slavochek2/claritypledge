import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';

const mocks = vi.hoisted(() => ({
  getDocsByUserOrThrow: vi.fn(),
  deleteDoc: vi.fn(),
  createDoc: vi.fn(),
  getAllSentLettersOrThrow: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getInboxItems: vi.fn(),
  getAllReceivedLetters: vi.fn(),
  markDeliveryRead: vi.fn(),
  deleteLetter: vi.fn(),
  listMyCanvases: vi.fn(),
  listSharedWithMe: vi.fn(),
  markCanvasRead: vi.fn(),
  invite: { current: null as null | Record<string, unknown> },
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'me', slug: 'me' }, isLoading: false, sessionChecked: true }),
}));
vi.mock('@/app/data/docs-service', () => ({
  docsService: { getDocsByUserOrThrow: mocks.getDocsByUserOrThrow, deleteDoc: mocks.deleteDoc, createDoc: mocks.createDoc },
}));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: mocks.getAllSentLettersOrThrow,
  getDeliveriesForLettersOrThrow: mocks.getDeliveriesForLettersOrThrow,
  getInboxItems: mocks.getInboxItems,
  getAllReceivedLetters: mocks.getAllReceivedLetters,
  markDeliveryRead: mocks.markDeliveryRead,
  deleteLetter: mocks.deleteLetter,
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: {
    listMyCanvases: mocks.listMyCanvases,
    listSharedWithMe: mocks.listSharedWithMe,
    markCanvasRead: mocks.markCanvasRead,
  },
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: mocks.invite.current, loading: false }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// The heavy modals are covered by their own tests; here only "did the row open them".
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({
  LetterReceiverModal: ({ letterId }: { letterId: string }) => <div data-testid="receiver-modal">{letterId}</div>,
}));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({
  CanvasShareControl: ({ name, openSignal }: { name: string; openSignal?: number }) => (
    <div data-testid="share-control" data-name={name} data-signal={openSignal} />
  ),
}));

import { ArtifactsPage } from './artifacts-page';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3600_000;

const doc = (over: Partial<ClarityDoc> = {}) =>
  ({ id: 'd1', title: 'Draft about trust', visibility: 'private', updated_at: ago(2 * H), story_count: 2, point_count: 3, has_sent_letters: false, ...over }) as ClarityDoc;
const sentLetter = { id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: ago(30 * H), created_at: ago(30 * H), doc_title: 'Hello Tom' };
const delivery = (over: Partial<LetterDelivery> = {}) =>
  ({ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_name: 'Ann', status: 'completed', ...over }) as LetterDelivery;
const received = (over: Partial<InboxItem> = {}): InboxItem => ({
  type: 'received', delivery_id: 'rd1', letter_id: 'rl1', title: 'Note from Mara', actor_name: 'Mara', actor_slug: 'mara',
  timestamp: ago(H), read_at: null, completed_at: null, ...over,
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderPage(url = '/artifacts') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/artifacts" element={<><ArtifactsPage /><LocationProbe /></>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rows = () => screen.queryAllByTestId('artifact-row');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invite.current = null;
  mocks.getDocsByUserOrThrow.mockResolvedValue([doc()]);
  mocks.getAllSentLettersOrThrow.mockResolvedValue([sentLetter]);
  mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [delivery()] });
  mocks.listMyCanvases.mockResolvedValue([
    { canvasId: null, name: 'sales_map', generalAccess: 'link', hasAudience: false, lastEdit: ago(3 * 24 * H) },
  ]);
  // Letters to me come from their own paged read; the mixed inbox list only supplies sender activity
  // (it still carries a received row here: a control that Shared with you never lists it from there).
  mocks.getAllReceivedLetters.mockResolvedValue([received()]);
  mocks.getInboxItems.mockResolvedValue([
    received({ delivery_id: 'from-mixed-list', title: 'Must not show twice' }),
    // activity on my own letter: must not become a row in Shared with you
    { ...received(), type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', title: 'Hello Tom', actor_name: 'Ann' },
  ]);
  mocks.listSharedWithMe.mockResolvedValue([
    { canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null, via: 'person', viaName: null, sharedAt: ago(H), unread: true },
  ]);
  mocks.markDeliveryRead.mockResolvedValue(undefined);
  mocks.markCanvasRead.mockResolvedValue(undefined);
});

describe('Artifacts page', () => {
  it('defaults to Yours and lists drafts, sent letters and own canvases', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    expect(screen.getByRole('tab', { name: 'Yours' })).toHaveAttribute('aria-selected', 'true');
    expect(rows().map(r => within(r).getByRole('heading').textContent)).toEqual(['Draft about trust', 'Hello Tom', 'sales map']);
    const metas = screen.getAllByTestId('artifact-meta').map(m => m.textContent);
    expect(metas).toEqual(['Draft · edited 2h ago', 'Sent to 1 · 1 replied', 'Edited 3d ago']);
    // one fixed button at most: none, the row link opens the item
    expect(screen.queryByRole('button', { name: /^(open|edit|results)/i })).toBeNull();
  });

  it('shows the unread count on the Shared with you tab, not on Yours', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const tab = screen.getByRole('tab', { name: 'Shared with you, 2 unread' });
    expect(tab).toBeInTheDocument();
    // the label is words plus a dot: the number never reads as an item count
    expect(tab.textContent).toBe('Shared with you');
    expect(tab.textContent).not.toMatch(/[()0-9]/);
    expect(within(tab).getByTestId('shared-unread-dot')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Yours' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Yours' })!.querySelector('[data-testid="shared-unread-dot"]')).toBeNull();
    expect(document.querySelectorAll('[aria-label="Unread"]')).toHaveLength(0); // no dots on Yours
  });

  it('with nothing unread the tab carries no dot', async () => {
    mocks.getAllReceivedLetters.mockResolvedValue([received({ read_at: ago(H) })]);
    mocks.listSharedWithMe.mockResolvedValue([]);
    renderPage();
    await screen.findByText('Draft about trust');
    const tab = screen.getByRole('tab', { name: 'Shared with you' });
    expect(within(tab).queryByTestId('shared-unread-dot')).toBeNull();
  });

  it('titles weigh the same on both tabs; only an unread title is heavier, and its dot sits next to the title', async () => {
    const user = userEvent.setup();
    mocks.getAllReceivedLetters.mockResolvedValue([received(), received({ delivery_id: 'rd2', letter_id: 'rl2', title: 'Old note', read_at: ago(H) })]);
    renderPage();
    await screen.findByText('Draft about trust');
    const yoursWeights = rows().map(r => within(r).getByRole('heading').firstElementChild!.className.match(/font-(normal|medium|semibold|bold)/)![0]);
    expect(new Set(yoursWeights)).toEqual(new Set(['font-normal']));
    await user.click(screen.getByRole('tab', { name: /Shared with you/ }));
    const readRow = (await screen.findByText('Old note')).closest('[data-testid="artifact-row"]') as HTMLElement;
    const unreadRow = screen.getByText('Note from Mara').closest('[data-testid="artifact-row"]') as HTMLElement;
    expect(within(readRow).getByRole('heading').firstElementChild!.className).toContain('font-normal');
    const unreadHeading = within(unreadRow).getByRole('heading');
    expect(unreadHeading.firstElementChild!.className).toContain('font-semibold');
    // dot: a sibling of the title heading (same title line), not inside the "…" action slot
    const dot = within(unreadRow).getByRole('img', { name: 'Unread' });
    expect(dot.parentElement).toBe(unreadHeading.parentElement);
    expect(dot.closest('div.relative')).toBeNull();
  });

  it('own items open the meta line with the visibility icon, so title and meta share a left edge', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const row = rows()[0]!;
    const meta = within(row).getByTestId('artifact-meta');
    expect(meta.textContent).toBe('Draft · edited 2h ago');
    const icon = within(row).getByRole('img', { name: /Only people you share with/ });
    expect(meta.parentElement).toContainElement(icon);
    expect(within(row).getByRole('heading')).not.toContainElement(icon);
    expect(icon.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('letter and canvas discs share one pale tint and keep different icons', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const letter = screen.getAllByTestId('artifact-type-letter')[0]!;
    const canvas = screen.getByTestId('artifact-type-canvas');
    for (const disc of [letter, canvas]) {
      expect(disc.className).toContain('bg-blue-50');
      expect(disc.className).not.toMatch(/bg-blue-[6-9]00/);
    }
    expect(letter.innerHTML).not.toBe(canvas.innerHTML);
  });

  it('Shared with you lists received letters and canvases with sender and unread dots, never activity on your letters', async () => {
    renderPage('/artifacts?tab=shared');
    await screen.findByText('Note from Mara');
    const list = rows();
    expect(list).toHaveLength(2);
    expect(screen.queryByText('Hello Tom')).toBeNull();
    const metas = screen.getAllByTestId('artifact-meta').map(m => m.textContent);
    expect(metas).toEqual(expect.arrayContaining(['From Mara · 1h ago', 'From Tom · 1h ago']));
    for (const r of list) {
      expect(within(r).getByRole('img', { name: 'Unread' })).toBeInTheDocument();
      expect(within(r).queryByRole('button', { name: /^Actions for/ })).toBeNull(); // no menu on received items
      expect(within(r).queryByRole('img', { name: /public|private|only you/i })).toBeNull(); // no visibility icon
    }
  });

  it('tabs write ?tab= and replace history; chips write ?type=', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('tab', { name: /Shared with you/ }));
    expect(screen.getByTestId('loc').textContent).toBe('/artifacts?tab=shared');
    await user.click(screen.getByRole('button', { name: 'Canvases' }));
    expect(screen.getByTestId('loc').textContent).toBe('/artifacts?tab=shared&type=canvases');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Canvases' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('loc').textContent).toBe('/artifacts?tab=shared');
  });

  it('chips filter Yours by type', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Letters' }));
    expect(rows().map(r => r.getAttribute('data-kind'))).toEqual(['letter', 'letter']);
    await user.click(screen.getByRole('button', { name: 'Canvases' }));
    expect(rows().map(r => r.getAttribute('data-kind'))).toEqual(['canvas']);
  });

  it('search expands in place, filters titles, and closing clears it; title and New stay', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Search artifacts' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Artifacts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New artifact' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search artifacts by title' }), 'TRUST');
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Draft about trust')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No artifacts match “zzz”.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(rows()).toHaveLength(3);
  });

  it('header, tabs and chips scroll together: nothing is sticky (as Feed and Chats)', async () => {
    const { container } = renderPage();
    await screen.findByText('Draft about trust');
    expect(container.querySelector('.sticky')).toBeNull();
  });

  it('the search clear button has a 40px hit area and the field keeps a minimum width on a phone', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Search artifacts' }));
    const close = screen.getByRole('button', { name: 'Close search' });
    expect(close.className).toMatch(/\bh-10\b/);
    expect(close.className).toMatch(/\bw-10\b/);
    expect(screen.getByRole('search').className).toMatch(/min-w-\[130px\]/);
    // the narrowest phones drop the New label (the button keeps its aria-label) while searching
    expect(screen.getByText('New', { selector: 'span.sm\\:hidden' }).className).toMatch(/max-\[340px\]:hidden/);
  });

  it('the row menu opens below its button, end-aligned', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Actions for Draft about trust' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('data-side', 'bottom');
    expect(menu).toHaveAttribute('data-align', 'end');
  });

  it('search covers the current tab only', async () => {
    const user = userEvent.setup();
    renderPage('/artifacts?tab=shared');
    await screen.findByText('Note from Mara');
    await user.click(screen.getByRole('button', { name: 'Search artifacts' }));
    await user.type(screen.getByRole('searchbox'), 'trust'); // a Yours title
    // plain text naming the scope (this tab), not a dashed box
    const line = screen.getByText('No artifacts shared with you match “trust”.');
    expect(line.className).not.toMatch(/dashed|border/);
    expect(line.parentElement!.className).not.toMatch(/dashed|border/);
  });

  it('the no-match state offers Clear search, which clears the query and the type chip', async () => {
    const user = userEvent.setup();
    renderPage('/artifacts?type=letters');
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Search artifacts' }));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No letters match “zzz”.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByTestId('loc').textContent).toBe('/artifacts');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(rows()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('search keeps one style at every width: magnifier shown, blue focus ring, title and New untouched', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'Search artifacts' }));
    const box = screen.getByRole('searchbox');
    expect(box.className).toContain('focus-visible:ring-blue-600');
    expect(box.className).not.toContain('focus-visible:ring-2');
    expect(box.parentElement!.querySelector('svg.lucide-search')!.getAttribute('class')).not.toMatch(/hidden/);
    expect(screen.getByRole('heading', { level: 1, name: 'Artifacts' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New artifact' })).toBeVisible();
  });

  it('New artifact offers the two letter drafts and no dead Canvas entry; a letter creates a draft', async () => {
    const user = userEvent.setup();
    mocks.createDoc.mockResolvedValue({ id: 'new-doc' });
    renderPage();
    await screen.findByText('Draft about trust');
    await user.click(screen.getByRole('button', { name: 'New artifact' }));
    expect(await screen.findByRole('menuitem', { name: /Letter \(public draft\)/ })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.queryByRole('menuitem', { name: /Canvas/ })).toBeNull(); // P1536 adds it; no disabled placeholder (P955)
    await user.click(screen.getByRole('menuitem', { name: /Letter \(private draft\)/ }));
    await waitFor(() => expect(mocks.createDoc).toHaveBeenCalledWith('private'));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/letters/drafts/new-doc'));
  });

  describe('"…" menu', () => {
    const openMenu = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
      await user.click(await screen.findByRole('button', { name: `Actions for ${title}` }));
    };

    it('draft: Prepare letter + Delete, with today\'s guards', async () => {
      const user = userEvent.setup();
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc({ story_count: 0, has_sent_letters: true })]);
      renderPage();
      await openMenu(user, 'Draft about trust');
      const prepare = await screen.findByRole('menuitem', { name: /Prepare letter/ });
      expect(prepare).toHaveAttribute('aria-disabled', 'true');
      expect(within(prepare).getByText('Add at least one story first.')).toBeInTheDocument();
      const del = screen.getByRole('menuitem', { name: /Delete/ });
      expect(del).toHaveAttribute('aria-disabled', 'true');
      expect(within(del).getByText("Can't delete — letters were sent from this draft.")).toBeInTheDocument();
    });

    it('draft: Delete asks first, then deletes and refreshes', async () => {
      const user = userEvent.setup();
      mocks.deleteDoc.mockResolvedValue(undefined);
      renderPage();
      await openMenu(user, 'Draft about trust');
      await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      expect(await screen.findByText('Delete draft')).toBeInTheDocument();
      expect(mocks.deleteDoc).not.toHaveBeenCalled();
      const calls = mocks.getDocsByUserOrThrow.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledWith('d1'));
      await waitFor(() => expect(mocks.getDocsByUserOrThrow.mock.calls.length).toBeGreaterThan(calls));
    });

    it('sent letter: no Delete item once shared; Add recipient(s) opens the modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await openMenu(user, 'Hello Tom');
      await screen.findByRole('menuitem', { name: 'Add recipient(s)' });
      expect(screen.queryByRole('menuitem', { name: /Delete letter/ })).toBeNull(); // omitted, not disabled
      expect(screen.queryByText("Can't delete — letter has been shared.")).toBeNull();
      expect(screen.queryByRole('menuitem', { name: /Copy public link/ })).toBeNull(); // private letter
      await user.click(screen.getByRole('menuitem', { name: 'Add recipient(s)' }));
      expect(await screen.findByTestId('receiver-modal')).toHaveTextContent('l1');
    });

    it('sent letter nobody has received: Delete letter is offered and asks first', async () => {
      const user = userEvent.setup();
      mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({});
      renderPage();
      await openMenu(user, 'Hello Tom');
      const del = await screen.findByRole('menuitem', { name: /Delete letter/ });
      expect(del).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('canvas: Share opens the P1515 share panel for that canvas', async () => {
      const user = userEvent.setup();
      renderPage();
      await openMenu(user, 'sales map');
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-signal', '0');
      await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-name', 'sales_map');
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-signal', '1');
    });
  });

  describe('opening items', () => {
    it('a row is a link to the item\'s existing page', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      expect(screen.getByRole('link', { name: 'Draft about trust' })).toHaveAttribute('href', '/letters/drafts/d1');
      expect(screen.getByRole('link', { name: 'Hello Tom' })).toHaveAttribute('href', '/letter/l1/overview');
      expect(screen.getByRole('link', { name: 'sales map' })).toHaveAttribute('href', '/p/me/canvas/sales_map');
    });

    it('opening an unread item clears its dot at once and tells the nav badge to re-read', async () => {
      const user = userEvent.setup();
      const stay = (e: Event) => e.preventDefault(); // keep the page mounted: the row link must not navigate here
      document.addEventListener('click', stay, true);
      const onRead = vi.fn();
      window.addEventListener('p1545:artifacts-read', onRead);
      try {
        renderPage('/artifacts?tab=shared');
        await screen.findByText('Note from Mara');
        expect(screen.getByRole('tab', { name: 'Shared with you, 2 unread' })).toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Note from Mara' }));
        expect(within(rows().find(r => r.textContent?.includes('Note from Mara'))!).queryByRole('img', { name: 'Unread' })).toBeNull();
        expect(screen.getByRole('tab', { name: 'Shared with you, 1 unread' })).toBeInTheDocument();
        await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
      } finally {
        document.removeEventListener('click', stay, true);
        window.removeEventListener('p1545:artifacts-read', onRead);
      }
    });

    it('opening an unread received letter marks the delivery read', async () => {
      const user = userEvent.setup();
      renderPage('/artifacts?tab=shared');
      await screen.findByText('Note from Mara');
      await user.click(screen.getByRole('link', { name: 'Note from Mara' }));
      expect(mocks.markDeliveryRead).toHaveBeenCalledWith('rd1');
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/letter/rd1'));
    });

    it('opening an unread shared canvas marks it read for that owner and name', async () => {
      const user = userEvent.setup();
      renderPage('/artifacts?tab=shared');
      await screen.findByText('q4 plan');
      await user.click(screen.getByRole('link', { name: 'q4 plan' }));
      expect(mocks.markCanvasRead).toHaveBeenCalledWith('o1', 'q4_plan');
      await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/p/tom/canvas/q4_plan'));
    });

    it('a read item opens without marking anything', async () => {
      const user = userEvent.setup();
      mocks.getAllReceivedLetters.mockResolvedValue([received({ read_at: ago(H) })]);
      renderPage('/artifacts?tab=shared');
      await screen.findByText('Note from Mara');
      await user.click(screen.getByRole('link', { name: 'Note from Mara' }));
      expect(mocks.markDeliveryRead).not.toHaveBeenCalled();
    });
  });

  describe('live invite', () => {
    it('sits at the top of Shared with you with Join, and counts in the tab number', async () => {
      mocks.invite.current = { sessionId: 's1', code: 'ABC', authorName: 'Zed', storyTitle: 'A story', closedAt: null };
      renderPage('/artifacts?tab=shared');
      const row = await screen.findByTestId('live-invite-row');
      expect(row).toHaveTextContent('Zed invited you to verify A story');
      expect(within(row).getByRole('button', { name: 'Join' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Shared with you, 3 unread' })).toBeInTheDocument();
      expect(row.compareDocumentPosition(rows()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('is not drawn on Yours', async () => {
      mocks.invite.current = { sessionId: 's1', code: 'ABC', authorName: 'Zed', storyTitle: 'A story', closedAt: null };
      renderPage();
      await screen.findByText('Draft about trust');
      expect(screen.queryByTestId('live-invite-row')).toBeNull();
    });
  });

  describe('received letters are not trimmed by sender activity (Codex finding)', () => {
    it('lists all 25 received letters even when 30 newer activity rows fill the mixed inbox', async () => {
      const letters = Array.from({ length: 25 }, (_, i) => received({ delivery_id: `rd${i}`, letter_id: `rl${i}`, title: `Letter ${i}`, timestamp: ago((i + 2) * H) }));
      const activity = Array.from({ length: 30 }, (_, i) => ({
        ...received(), type: 'recipient_responded' as const, delivery_id: `act${i}`, letter_id: 'l1', title: 'Hello Tom', timestamp: ago(i * 1000),
      }));
      mocks.getAllReceivedLetters.mockResolvedValue(letters);
      mocks.getInboxItems.mockResolvedValue(activity.slice(0, 20)); // what the capped mixed list can hold
      mocks.listSharedWithMe.mockResolvedValue([]);
      renderPage('/artifacts?tab=shared');
      await screen.findByText('Letter 0');
      expect(rows()).toHaveLength(25);
      expect(screen.getByText('Letter 24')).toBeInTheDocument();
      expect(screen.queryByText('Hello Tom')).toBeNull();
    });

    it('a failing sender-activity read does not blank or error Shared with you', async () => {
      mocks.getInboxItems.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=shared');
      await screen.findByText('Note from Mara');
      expect(screen.queryByText('Some items could not be loaded.')).toBeNull();
    });

    it('a failing received-letters read says some items are missing and keeps the canvases', async () => {
      mocks.getAllReceivedLetters.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=shared');
      await screen.findByText('q4 plan');
      expect(screen.getByText('Some items could not be loaded.')).toBeInTheDocument();
    });
  });

  describe('loading, error and empty states', () => {
    it('shows a loader first', () => {
      mocks.getDocsByUserOrThrow.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('Yours error: message and Retry; Shared with you stays usable', async () => {
      const user = userEvent.setup();
      mocks.getDocsByUserOrThrow.mockRejectedValue(new Error('x'));
      mocks.getAllSentLettersOrThrow.mockRejectedValue(new Error('x'));
      mocks.listMyCanvases.mockRejectedValue(new Error('x'));
      renderPage();
      expect(await screen.findByText('Something went wrong loading your artifacts.')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: /Shared with you/ }));
      expect(await screen.findByText('Note from Mara')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Yours' }));
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc()]);
      mocks.getAllSentLettersOrThrow.mockResolvedValue([]);
      mocks.listMyCanvases.mockResolvedValue([]);
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText('Draft about trust')).toBeInTheDocument();
    });

    it('one failing source keeps the rest and says some items are missing', async () => {
      mocks.listMyCanvases.mockRejectedValue(new Error('x'));
      renderPage();
      await screen.findByText('Draft about trust');
      expect(screen.getByText('Some items could not be loaded.')).toBeInTheDocument();
      expect(rows()).toHaveLength(2);
    });

    it('empty Yours and empty Shared with you each say so', async () => {
      const user = userEvent.setup();
      mocks.getDocsByUserOrThrow.mockResolvedValue([]);
      mocks.getAllSentLettersOrThrow.mockResolvedValue([]);
      mocks.listMyCanvases.mockResolvedValue([]);
      mocks.getInboxItems.mockResolvedValue([]);
      mocks.getAllReceivedLetters.mockResolvedValue([]);
      mocks.listSharedWithMe.mockResolvedValue([]);
      renderPage();
      expect(await screen.findByText(/Nothing here yet\./)).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Shared with you' }));
      expect(await screen.findByText('Nothing has been shared with you yet.')).toBeInTheDocument();
    });

    it('a type chip with nothing in it says so', async () => {
      const user = userEvent.setup();
      mocks.listMyCanvases.mockResolvedValue([]);
      renderPage();
      await screen.findByText('Draft about trust');
      await user.click(screen.getByRole('button', { name: 'Canvases' }));
      expect(screen.getByText('No canvases here yet.')).toBeInTheDocument();
    });
  });

  it('shows loaded drafts and a quiet "Loading more" line while sent letters are pending, with no empty state', async () => {
    mocks.getAllSentLettersOrThrow.mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByText('Draft about trust');
    expect(screen.getByText('Loading more…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('does not show the empty state while a source is still pending', async () => {
    mocks.getDocsByUserOrThrow.mockResolvedValue([]);
    mocks.listMyCanvases.mockResolvedValue([]);
    mocks.getAllSentLettersOrThrow.mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByRole('status', { name: 'Loading' });
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText(/nothing here|no artifacts|yet/i)).toBeNull();
  });
});
