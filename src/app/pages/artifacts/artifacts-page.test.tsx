import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import type { ClarityDoc, InboxItem, LetterDelivery } from '@/app/types';

const mocks = vi.hoisted(() => ({
  getDocsByUserOrThrow: vi.fn(),
  createDoc: vi.fn(),
  getAllSentLettersOrThrow: vi.fn(),
  getDeliveriesForLettersOrThrow: vi.fn(),
  getInboxItems: vi.fn(),
  getAllReceivedLetters: vi.fn(),
  markDeliveryRead: vi.fn(),
  deleteDoc: vi.fn(),
  deleteLetter: vi.fn(),
  clearSenderNew: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(),
  listMyCanvases: vi.fn(),
  listSharedWithMe: vi.fn(),
  getAccess: vi.fn(),
  markCanvasRead: vi.fn(),
  invite: { current: null as null | Record<string, unknown> },
  auth: { current: null as null | { user: { id: string; slug: string } | null; isLoading: boolean; sessionChecked: boolean } },
}));

const signedIn = { user: { id: 'me', slug: 'me' }, isLoading: false, sessionChecked: true }; // stable ref: a new object per render would refetch forever
vi.mock('@/auth', () => ({ useAuth: () => mocks.auth.current ?? signedIn }));
vi.mock('@/app/data/docs-service', () => ({
  docsService: { getDocsByUserOrThrow: mocks.getDocsByUserOrThrow, createDoc: mocks.createDoc, deleteDoc: mocks.deleteDoc },
}));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: mocks.getAllSentLettersOrThrow,
  getDeliveriesForLettersOrThrow: mocks.getDeliveriesForLettersOrThrow,
  getInboxItems: mocks.getInboxItems,
  getAllReceivedLetters: mocks.getAllReceivedLetters,
  markDeliveryRead: mocks.markDeliveryRead,
  deleteLetter: mocks.deleteLetter,
  clearSenderNewForDelivery: mocks.clearSenderNew,
  getUnreadExplainBackCountsByDelivery: mocks.getUnreadExplainBackCountsByDelivery,
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: {
    listMyCanvases: mocks.listMyCanvases,
    listSharedWithMe: mocks.listSharedWithMe,
    getAccess: mocks.getAccess,
    markCanvasRead: mocks.markCanvasRead,
  },
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: mocks.invite.current, loading: false }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// The share panel is covered by its own tests; here only "did the row open it".
vi.mock('@/app/components/canvas/canvas-share-control', () => ({
  CanvasShareControl: ({ name, openSignal }: { name: string; openSignal?: number }) => (
    <div data-testid="share-control" data-name={name} data-signal={openSignal} />
  ),
}));
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({
  LetterReceiverModal: ({ letterId, onRecipientAdded }: { letterId: string; onRecipientAdded?: () => void }) => (
    <div data-testid="receiver-modal">{letterId}<button onClick={onRecipientAdded}>mock-added</button></div>
  ),
}));

import { toast } from 'sonner';
import { isSafeRedirectPath } from '@/auth/redirect-allowlist';
import { ArtifactsPage } from './artifacts-page';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3600_000;

const doc = (over: Partial<ClarityDoc> = {}) =>
  ({ id: 'd1', title: 'Draft about trust', visibility: 'private', updated_at: ago(2 * H), story_count: 2, point_count: 3, has_sent_letters: false, ...over }) as ClarityDoc;
const sentLetter = { id: 'l1', source_doc_id: 'd9', sender_id: 'me', mode: 'one-to-one', status: 'sealed', sealed_at: ago(30 * H), created_at: ago(30 * H), doc_title: 'Hello Tom' };
const delivery = (over: Partial<LetterDelivery> = {}) =>
  ({ id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_name: 'Ann', status: 'completed', read_at: ago(H), ...over }) as LetterDelivery;
const received = (over: Partial<InboxItem> = {}): InboxItem => ({
  type: 'received', delivery_id: 'rd1', letter_id: 'rl1', title: 'Note from Mara', actor_name: 'Mara', actor_slug: 'mara',
  timestamp: ago(H), read_at: null, completed_at: null, ...over,
});

function LocationProbe() {
  const loc = useLocation();
  const nav = useNavigationType();
  return <div data-testid="loc" data-nav={nav}>{loc.pathname + loc.search}</div>;
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
  mocks.auth.current = null;
  mocks.getDocsByUserOrThrow.mockResolvedValue([doc()]);
  mocks.getAllSentLettersOrThrow.mockResolvedValue([sentLetter]);
  mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [delivery()] });
  mocks.listMyCanvases.mockResolvedValue([
    { canvasId: null, name: 'sales_map', generalAccess: 'link', hasAudience: false, lastEdit: ago(3 * 24 * H) },
  ]);
  // Letters to me come from their own paged read; the mixed inbox list only supplies sender activity
  // (it still carries a received row here: a control that Received never lists it from there).
  mocks.getAllReceivedLetters.mockResolvedValue([received()]);
  mocks.getInboxItems.mockResolvedValue([
    received({ delivery_id: 'from-mixed-list', title: 'Must not show twice' }),
    // activity on my own letter (already read here; unread activity has its own test): must not become a row in Received
    { ...received(), type: 'recipient_responded', delivery_id: 'dv1', letter_id: 'l1', title: 'Hello Tom', actor_name: 'Ann', read_at: ago(H) },
  ]);
  mocks.listSharedWithMe.mockResolvedValue([
    { canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null, via: 'person', viaName: null, sharedAt: ago(H), unread: true },
  ]);
  mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({});
  mocks.markDeliveryRead.mockResolvedValue(undefined);
  mocks.markCanvasRead.mockResolvedValue(undefined);
});

const user = () => userEvent.setup();
const titles = () => rows().map(r => within(r).getByRole('heading').textContent);
const loc = () => screen.getByTestId('loc').textContent;
// A chip or tab may carry a dot, which adds ", unread" / ", new" to its name: match the label with or without it.
const named = (label: string) => new RegExp(`^${label}(,|$)`);
const chip = (label: string) => screen.getByRole('button', { name: named(label) });
const tab = (label: string) => screen.getByRole('tab', { name: named(label) });

describe('Artifacts page: split by kind', () => {
  it('defaults to Letters, Drafts: one list at a time, no headings, no All chip, no Yours / Shared with you tabs', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    expect(tab('Letters')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Canvases')).toHaveAttribute('aria-selected', 'false');
    expect(chip('Drafts')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Sent')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('button', { pressed: true }).map(b => b.textContent)).toEqual(['Drafts']);
    expect(titles()).toEqual(['Draft about trust']);
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['2 stories, 3 points · 2h ago']);
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Yours|Shared with you/ })).toBeNull();
    // the filter holds Letters' three lists only
    expect(screen.getByRole('group', { name: 'Letters lists' }).querySelectorAll('button')).toHaveLength(3);
    // one fixed button at most: none, the row link opens the item
    expect(screen.queryByRole('button', { name: /^(open|edit|results)/i })).toBeNull();
  });

  it('shows each list on its own: Sent, Received, then Canvases Mine and Shared with me', async () => {
    renderPage('/artifacts?tab=letters&list=sent');
    await screen.findByText('Hello Tom');
    expect(titles()).toEqual(['Hello Tom']);
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['To Ann · 1 of 1 finished · 1d ago']);
    expect(chip('Sent')).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    renderPage('/artifacts?tab=letters&list=received');
    await screen.findByText('Note from Mara');
    expect(titles()).toEqual(['Note from Mara']);
    expect(screen.queryByText('Must not show twice')).toBeNull();
    cleanup();
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Sales map');
    expect(titles()).toEqual(['Sales map']);
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['Edited 3d ago']);
    expect(screen.getByRole('group', { name: 'Canvases lists' }).querySelectorAll('button')).toHaveLength(2);
    expect(chip('Mine')).toHaveAttribute('aria-pressed', 'true');
    cleanup();
    renderPage('/artifacts?tab=canvases&list=shared');
    await screen.findByText('Q4 plan');
    expect(titles()).toEqual(['Q4 plan']);
    expect(chip('Shared with me')).toHaveAttribute('aria-pressed', 'true');
  });

  it('the list ends clear of the fixed phone tab bar: bottom padding of 6rem plus the home-indicator inset, none on desktop', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const frame = document.querySelector('[data-page-frame]') as HTMLElement;
    expect(frame.className).toContain('pb-[calc(6rem+env(safe-area-inset-bottom))]');
    expect(frame.className).toContain('lg:pb-8');
  });

  it('unread activity on a sent letter says "To Ann · 1 new" with the activity time in the Sent list', async () => {
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [delivery({ completed_at: ago(10 * 60_000), read_at: null })] });
    renderPage('/artifacts?tab=letters&list=sent');
    await screen.findByText('Hello Tom');
    await waitFor(() => expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['To Ann · 1 new · 10m ago']));
  });

  it('Sent lists letters with something new first, with the words and no row dot', async () => {
    const other = { ...sentLetter, id: 'l2', doc_title: 'Quiet newer', sealed_at: ago(2 * H), created_at: ago(2 * H) };
    mocks.getAllSentLettersOrThrow.mockResolvedValue([other, sentLetter]);
    mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({ l1: [delivery()], l2: [delivery({ id: 'dv2', letter_id: 'l2' })] });
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ dv1: 1 });
    renderPage('/artifacts?tab=letters&list=sent');
    await waitFor(() => expect(titles()).toEqual(['Hello Tom', 'Quiet newer']));
    expect(screen.getAllByTestId('artifact-meta')[0]!.textContent).toMatch(/^To Ann · 1 new · /);
    expect(screen.queryAllByRole('img', { name: 'Unread' })).toHaveLength(0);
    expect(screen.getByTestId('list-dot-sent')).toBeInTheDocument();
  });

  describe('signed out', () => {
    it.each([
      ['/artifacts', '%2Fartifacts'],
      ['/artifacts?tab=letters&list=sent', '%2Fartifacts%3Ftab%3Dletters%26list%3Dsent'],
      ['/artifacts?tab=canvases&list=shared', '%2Fartifacts%3Ftab%3Dcanvases%26list%3Dshared'],
    ])('%s goes to login and carries the whole address back, URL-encoded', async (url, encoded) => {
      mocks.auth.current = { user: null, isLoading: false, sessionChecked: true };
      renderPage(url);
      await waitFor(() => expect(loc()).toBe(`/login?redirect=${encoded}`));
      const back = new URLSearchParams(loc()!.split('?')[1]).get('redirect');
      expect(back).toBe(url);
      expect(isSafeRedirectPath(back)).toBe(true); // the login page would accept it, not fall back to /feed
    });
  });

  describe('tabs and filter write the URL', () => {
    it('Letters / Canvases tabs and the lists inside them, replacing history; the default list is the bare tab', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(chip('Sent'));
      expect(loc()).toBe('/artifacts?tab=letters&list=sent');
      await waitFor(() => expect(titles()).toEqual(['Hello Tom']));
      await u.click(chip('Received'));
      expect(loc()).toBe('/artifacts?tab=letters&list=received');
      await u.click(chip('Drafts'));
      expect(loc()).toBe('/artifacts?tab=letters');
      await u.click(tab('Canvases'));
      expect(loc()).toBe('/artifacts?tab=canvases');
      await waitFor(() => expect(titles()).toEqual(['Sales map']));
      await u.click(chip('Shared with me'));
      expect(loc()).toBe('/artifacts?tab=canvases&list=shared');
      await waitFor(() => expect(titles()).toEqual(['Q4 plan']));
      await u.click(chip('Mine'));
      expect(loc()).toBe('/artifacts?tab=canvases');
      await u.click(tab('Letters'));
      expect(loc()).toBe('/artifacts?tab=letters');
      expect(screen.getByTestId('loc').dataset.nav).toBe('REPLACE');
    });

    it('switching tabs lands on the new tab\'s default list, not on a list left over from the other tab', async () => {
      const u = user();
      renderPage('/artifacts?tab=canvases&list=shared');
      await screen.findByText('Q4 plan');
      await u.click(tab('Letters'));
      expect(loc()).toBe('/artifacts?tab=letters');
      expect(chip('Drafts')).toHaveAttribute('aria-pressed', 'true');
    });

    it('a list that belongs to the other tab, or junk, falls back to the tab\'s default list', async () => {
      renderPage('/artifacts?tab=letters&list=shared');
      await screen.findByText('Draft about trust');
      expect(chip('Drafts')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('old links keep working', () => {
    it.each([
      ['/artifacts?tab=yours', '/artifacts?tab=letters&list=drafts', 'Draft about trust'],
      ['/artifacts?tab=yours&type=letters', '/artifacts?tab=letters&list=drafts', 'Draft about trust'],
      ['/artifacts?tab=yours&type=canvases', '/artifacts?tab=canvases&list=mine', 'Sales map'],
      ['/artifacts?tab=shared', '/artifacts?tab=letters&list=received', 'Note from Mara'],
      ['/artifacts?tab=shared&type=letters', '/artifacts?tab=letters&list=received', 'Note from Mara'],
      ['/artifacts?tab=shared&type=canvases', '/artifacts?tab=canvases&list=shared', 'Q4 plan'],
    ])('%s opens the right list and rewrites the address, replacing history', async (from, to, title) => {
      renderPage(from);
      await screen.findByText(title);
      await waitFor(() => expect(loc()).toBe(to));
      expect(screen.getByTestId('loc').dataset.nav).toBe('REPLACE');
      expect(titles()).toEqual([title]);
    });
  });

  describe('dots', () => {
    const dotsIn = (el: HTMLElement) => within(el).queryAllByTestId(/-dot-/);

    it('Received and Shared with me carry a dot while anything is unread, and each tab carries one for its lists', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      expect(within(screen.getByRole('button', { name: 'Received, unread' })).getByTestId('list-dot-received')).toBeInTheDocument();
      expect(within(screen.getByRole('tab', { name: 'Letters, new' })).getByTestId('tab-dot-letters')).toBeInTheDocument();
      expect(within(screen.getByRole('tab', { name: 'Canvases, new' })).getByTestId('tab-dot-canvases')).toBeInTheDocument();
      // Drafts and Sent have nothing to flag
      expect(dotsIn(chip('Drafts'))).toHaveLength(0);
      expect(dotsIn(chip('Sent'))).toHaveLength(0);
      // the dot is a mark, not a count
      expect(screen.getByTestId('list-dot-received').textContent).toBe('');
      expect(screen.getByRole('tab', { name: 'Letters, new' }).textContent).toBe('Letters');
      // and a dot is not a row dot: no row is unread in Drafts
      expect(document.querySelectorAll('[aria-label="Unread"]')).toHaveLength(0);
    });

    it('inside Canvases, Shared with me carries the dot and Mine does not', async () => {
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      expect(within(screen.getByRole('button', { name: 'Shared with me, unread' })).getByTestId('list-dot-shared')).toBeInTheDocument();
      expect(dotsIn(chip('Mine'))).toHaveLength(0);
    });

    it('the dots do not depend on which list is open: every tab and chip dot is the same whichever list the page opens on', async () => {
      const urls = [
        '/artifacts',
        '/artifacts?tab=letters&list=sent',
        '/artifacts?tab=letters&list=received',
        '/artifacts?tab=canvases',
        '/artifacts?tab=canvases&list=shared',
      ];
      for (const url of urls) {
        renderPage(url);
        // both tabs carry a dot on every list: unread received letters, and unread shared canvases
        await screen.findByRole('tab', { name: 'Letters, new' });
        await screen.findByRole('tab', { name: 'Canvases, new' });
        // and the chips of the open tab carry theirs
        if (url.includes('canvases')) {
          expect(await screen.findByRole('button', { name: 'Shared with me, unread' })).toBeInTheDocument();
          expect(screen.getByRole('button', { name: 'Mine' })).toBeInTheDocument();
        } else {
          expect(await screen.findByRole('button', { name: 'Received, unread' })).toBeInTheDocument();
          expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument();
        }
        cleanup();
      }
    });

    it('on Mine, the Canvases tab and the Shared with me chip light up as soon as the shared canvases arrive, with no click', async () => {
      let arrive: (rows: unknown[]) => void = () => {};
      mocks.listSharedWithMe.mockReturnValue(new Promise(r => { arrive = r; }));
      mocks.getAllReceivedLetters.mockResolvedValue([]);
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      expect(screen.queryByTestId('tab-dot-canvases')).toBeNull(); // nothing is known yet
      expect(screen.queryByTestId('list-dot-shared')).toBeNull();
      await act(async () => {
        arrive([{ canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null, via: 'person', viaName: null, sharedAt: ago(H), unread: true }]);
      });
      expect(await screen.findByTestId('tab-dot-canvases')).toBeInTheDocument();
      expect(screen.getByTestId('list-dot-shared')).toBeInTheDocument();
      expect(screen.getAllByTestId('artifact-row')).toHaveLength(1); // still on Mine
    });

    it('with nothing unread or new there are no dots anywhere', async () => {
      mocks.getAllReceivedLetters.mockResolvedValue([received({ read_at: ago(H) })]);
      mocks.listSharedWithMe.mockResolvedValue([]);
      renderPage();
      await screen.findByText('Draft about trust');
      await waitFor(() => expect(mocks.getAllReceivedLetters).toHaveBeenCalled());
      expect(screen.queryAllByTestId(/-dot-/)).toHaveLength(0);
      expect(tab('Letters')).toBeInTheDocument();
    });

    it('Sent carries a dot while a sent letter has something new, and the letter\'s row says it in words only', async () => {
      mocks.getAllReceivedLetters.mockResolvedValue([]);
      mocks.listSharedWithMe.mockResolvedValue([]);
      mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ dv1: 1 });
      renderPage('/artifacts?tab=letters&list=sent');
      await screen.findByText('Hello Tom');
      expect(await screen.findByRole('button', { name: 'Sent, new activity' })).toBeInTheDocument();
      expect(screen.getByTestId('list-dot-sent')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Letters, new' })).toBeInTheDocument();
      expect(screen.getByTestId('tab-dot-letters')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-dot-canvases')).toBeNull();
      expect(screen.getByTestId('artifact-meta').textContent).toMatch(/^To Ann · 1 new · /);
      expect(within(rows()[0]!).queryByRole('img', { name: 'Unread' })).toBeNull();
    });

    it('opening an unread item clears its dot, its chip\'s and its tab\'s at once', async () => {
      const u = user();
      const stay = (e: Event) => e.preventDefault(); // keep the page mounted: the row link must not navigate here
      document.addEventListener('click', stay, true);
      mocks.listSharedWithMe.mockResolvedValue([]);
      try {
        renderPage('/artifacts?tab=letters&list=received');
        await screen.findByText('Note from Mara');
        expect(screen.getByTestId('list-dot-received')).toBeInTheDocument();
        expect(screen.getByTestId('tab-dot-letters')).toBeInTheDocument();
        await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
        expect(within(rows()[0]!).queryByRole('img', { name: 'Unread' })).toBeNull();
        expect(screen.queryByTestId('list-dot-received')).toBeNull();
        expect(screen.queryByTestId('tab-dot-letters')).toBeNull();
        expect(screen.getByRole('button', { name: 'Received' })).toBeInTheDocument();
      } finally {
        document.removeEventListener('click', stay, true);
      }
    });
  });

  it('titles weigh the same in every list; only an unread title is heavier', async () => {
    mocks.getAllReceivedLetters.mockResolvedValue([received(), received({ delivery_id: 'rd2', letter_id: 'rl2', title: 'Old note', read_at: ago(H) })]);
    renderPage();
    await screen.findByText('Draft about trust');
    const weight = (r: HTMLElement) => within(r).getByRole('heading').className.match(/font-(normal|medium|semibold|bold)/)![0];
    expect(rows().map(weight)).toEqual(['font-medium']);
    await user().click(chip('Received'));
    const readRow = (await screen.findByText('Old note')).closest('[data-testid="artifact-row"]') as HTMLElement;
    const unreadRow = screen.getByText('Note from Mara').closest('[data-testid="artifact-row"]') as HTMLElement;
    expect(weight(readRow)).toBe('font-medium');
    expect(weight(unreadRow)).toBe('font-semibold');
  });

  it('the dot is in the same place on every row: first in the title line, before the title, never at the right edge', async () => {
    mocks.getAllReceivedLetters.mockResolvedValue([received(), received({ delivery_id: 'rd3', letter_id: 'rl3', title: 'A much longer note title that wraps over two lines on a phone width screen', read_at: null })]);
    const check = () => {
      const dotRows = rows().filter(r => within(r).queryByRole('img', { name: /^(Unread|New)$/ }));
      for (const row of dotRows) {
        const dots = within(row).getAllByRole('img', { name: /^(Unread|New)$/ });
        expect(dots).toHaveLength(1); // at most one per row
        const line = dots[0]!.parentElement!;
        expect(line.firstElementChild).toBe(dots[0]); // first, so before the title
        expect(dots[0]!.nextElementSibling).toBe(row.querySelector('h3')); // directly before the title
        expect(row.querySelector('h3')!.className).toContain('font-semibold'); // the title is bold while new
      }
      return dotRows.length;
    };
    renderPage('/artifacts?tab=letters&list=received');
    await screen.findByText('Note from Mara');
    expect(check()).toBe(2); // short and long title
    cleanup();
    renderPage('/artifacts?tab=canvases&list=shared');
    await screen.findByText('Q4 plan');
    expect(check()).toBe(1);
    cleanup();
    // Sent rows too: a dot like chat, with the words kept
    mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ dv1: 1 });
    renderPage('/artifacts?tab=letters&list=sent');
    await screen.findByText('Hello Tom');
    await waitFor(() => expect(check()).toBe(1));
    expect(screen.getByTestId('artifact-meta').textContent).toMatch(/^To Ann · 1 new · /);
    cleanup();
    // Drafts and Mine never carry one
    renderPage();
    await screen.findByText('Draft about trust');
    expect(screen.queryAllByTestId('artifact-unread-dot')).toHaveLength(0);
    cleanup();
    renderPage('/artifacts?tab=canvases');
    await screen.findByText('Sales map');
    expect(screen.queryAllByTestId('artifact-unread-dot')).toHaveLength(0);
  });

  it('own items open the meta line with the visibility icon, so title and meta share a left edge', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const row = rows()[0]!;
    const meta = within(row).getByTestId('artifact-meta');
    expect(meta.textContent).toBe('2 stories, 3 points · 2h ago');
    const icon = within(row).getByRole('img', { name: /Only people you share with/ });
    expect(meta.parentElement).toContainElement(icon);
    expect(within(row).getByRole('heading')).not.toContainElement(icon);
    expect(icon.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the visibility icon aligns with the FIRST line of a wrapping meta line (top-aligned with a small offset, not centred on the block)', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    const row = rows()[0]!;
    const line = within(row).getByTestId('artifact-meta').parentElement!;
    expect(line.className).toMatch(/\bitems-start\b/);
    expect(line.className).not.toMatch(/\bitems-center\b/);
    expect(line.className).toMatch(/\bleading-5\b/); // a known line height, so the offset below is exact
    const icon = within(row).getByRole('img', { name: /Only people you share with/ });
    const holder = [...line.children].find(c => c.contains(icon))!;
    expect(holder.className).toMatch(/\bmt-\[3px\]/); // (20px line - 14px icon) / 2
  });

  it('rows carry no type icon: the tab already says what the list holds', async () => {
    renderPage();
    await screen.findByText('Draft about trust');
    expect(screen.queryByTestId('artifact-type-letter')).toBeNull();
    expect(screen.queryByTestId('artifact-type-canvas')).toBeNull();
    const row = rows()[0]!;
    expect(within(row).getByRole('img', { name: /Only people you share with/ })).toBeInTheDocument(); // the lock in the meta line stays
  });

  it('Received and Shared with me list sender and unread dots, never activity on your letters, and carry no visibility icon', async () => {
    renderPage('/artifacts?tab=letters&list=received');
    await screen.findByText('Note from Mara');
    expect(screen.queryByText('Hello Tom')).toBeNull();
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['From Mara · 1h ago']);
    cleanup();
    renderPage('/artifacts?tab=canvases&list=shared');
    await screen.findByText('Q4 plan');
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['From Tom · 1h ago']);
    for (const r of rows()) {
      expect(within(r).getByRole('img', { name: 'Unread' })).toBeInTheDocument();
      expect(within(r).queryByRole('img', { name: /public|private|only you/i })).toBeNull();
    }
  });

  describe('the whole row opens the item; controls sit on the title line', () => {
    const buttons = (row: HTMLElement) => [...within(row).getByTestId('row-actions').querySelectorAll('button')].map(el => el.getAttribute('aria-label'));
    const openMenu = async (u: ReturnType<typeof userEvent.setup>, title: string) => {
      await u.click(await screen.findByRole('button', { name: `Actions for ${title}` }));
    };
    const menuLabels = async () => (await screen.findAllByRole('menuitem')).map(m => m.firstElementChild!.textContent);

    it('the title is one link stretched over the row, and no interactive element is nested in another', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      const row = rows()[0]!;
      const link = within(row).getByRole('link', { name: 'Draft about trust' });
      expect(link).toHaveAttribute('href', '/letters/drafts/d1');
      expect(link.className).toContain("after:absolute");
      expect(link.className).toContain('after:inset-0');
      expect(row.className).toMatch(/\brelative\b/);
      expect(row.className).toContain('hover:bg-accent/50'); // desktop hover tint
      expect(row.className).toContain('active:bg-accent'); // press tint on phones
      expect(within(row).getAllByRole('link')).toHaveLength(1);
      for (const control of within(row).getByTestId('row-actions').querySelectorAll('button, a')) {
        expect(control.closest('a')).toBeNull(); // nothing interactive inside the link
        expect(control.closest('h3')).toBeNull();
      }
      expect(within(row).getByTestId('row-actions').className).toMatch(/\bz-10\b/); // raised above the overlay
    });

    it('a press on the row body opens the item; a press on a control does not', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(within(rows()[0]!).getByRole('button', { name: 'Actions for Draft about trust' }));
      expect(loc()).toBe('/artifacts'); // the menu opened, nothing navigated
      await u.keyboard('{Escape}');
      await u.click(within(rows()[0]!).getByRole('link', { name: 'Draft about trust' }));
      await waitFor(() => expect(loc()).toBe('/letters/drafts/d1'));
    });

    it('the title keeps to one line (ellipsis) so the controls always fit; the meta line may wrap', async () => {
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc({ title: 'A very long draft title '.repeat(10) })]);
      renderPage();
      await screen.findByText(/A very long draft title/);
      const row = rows()[0]!;
      expect(within(row).getByRole('link').className).toMatch(/\btruncate\b/);
      expect(row.querySelector('h3')!.className).toMatch(/\bmin-w-0\b/);
      expect(within(row).getByTestId('row-actions').className).toMatch(/\bshrink-0\b/);
      expect(within(row).getByTestId('artifact-meta').className).not.toMatch(/truncate|whitespace-nowrap/);
      expect(within(row).getByTestId('row-actions').parentElement).toBe(row.querySelector('h3')!.parentElement); // same line as the title
    });

    it('draft: Prepare letter (quiet blue text) then … ; the menu has Delete draft', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      const row = rows()[0]!;
      expect(buttons(row)).toEqual(['Prepare letter: Draft about trust', 'Actions for Draft about trust']);
      const primary = within(row).getByRole('button', { name: 'Prepare letter: Draft about trust' });
      expect(primary.className).toContain('text-blue-700');
      expect(primary.className).not.toMatch(/(^|\s)(bg-blue-\d00|border)(\s|$)/); // quiet text: never filled, no border
      expect(primary.className).toMatch(/\bh-10\b/);
      expect(within(row).queryByRole('link', { name: /^Edit/ })).toBeNull();
      await openMenu(u, 'Draft about trust');
      expect(await menuLabels()).toEqual(['Open', 'Delete draft']);
    });

    it('draft: Prepare letter goes to the compose page', async () => {
      const u = user();
      renderPage();
      await u.click(await screen.findByRole('button', { name: 'Prepare letter: Draft about trust' }));
      await waitFor(() => expect(loc()).toBe('/letter/d1/compose'));
    });

    it('draft with 0 stories: Prepare letter is muted but still focusable and clickable; a tap says why in a toast; no reason text on the row', async () => {
      const u = user();
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc({ story_count: 0 })]);
      renderPage();
      await screen.findByText('Draft about trust');
      const btn = screen.getByRole('button', { name: 'Prepare letter: Draft about trust' });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).not.toBeDisabled();
      btn.focus();
      expect(btn).toHaveFocus();
      expect(btn.className).toContain('text-slate-400');
      expect(rows()[0]!).not.toHaveTextContent('Add at least one story first.');
      await u.click(btn);
      expect(toast).toHaveBeenCalledWith('Add at least one story first.');
      expect(loc()).toBe('/artifacts'); // neither the row nor compose opened
    });

    it('on desktop, hovering the muted Prepare letter shows its reason as a tooltip', async () => {
      const u = user();
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc({ story_count: 0 })]);
      renderPage();
      await u.hover(await screen.findByRole('button', { name: 'Prepare letter: Draft about trust' }));
      expect((await screen.findAllByText('Add at least one story first.')).length).toBeGreaterThan(0);
    });

    it('draft: the "…" always lists Delete draft; with letters sent a tap on it says why (toast) and deletes nothing', async () => {
      const u = user();
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc({ has_sent_letters: true })]);
      renderPage();
      await openMenu(u, 'Draft about trust');
      const del = await screen.findByRole('menuitem', { name: /Delete draft/ });
      expect(del).toHaveAttribute('aria-disabled', 'true');
      expect(within(del).getByText("Can't delete — letters were sent from this draft.")).toBeVisible();
      await u.click(del);
      expect(toast).toHaveBeenCalledWith("Can't delete — letters were sent from this draft.");
      expect(screen.queryByText('Are you sure you want to delete “Draft about trust”? This cannot be undone.')).toBeNull();
    });

    it('draft: Delete asks first, then deletes and refreshes', async () => {
      const u = user();
      mocks.deleteDoc.mockResolvedValue(undefined);
      renderPage();
      await openMenu(u, 'Draft about trust');
      await u.click(await screen.findByRole('menuitem', { name: /Delete draft/ }));
      expect(await screen.findByText('Are you sure you want to delete “Draft about trust”? This cannot be undone.')).toBeInTheDocument();
      expect(mocks.deleteDoc).not.toHaveBeenCalled();
      const calls = mocks.getDocsByUserOrThrow.mock.calls.length;
      await u.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledWith('d1'));
      await waitFor(() => expect(mocks.getDocsByUserOrThrow.mock.calls.length).toBeGreaterThan(calls));
    });

    it('sent, private: + Add recipient then …; the row opens the overview; the menu has Preview and Delete letter', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=sent');
      await screen.findByText('Hello Tom');
      const row = rows()[0]!;
      expect(buttons(row)).toEqual(['Add recipient: Hello Tom', 'Actions for Hello Tom']);
      expect(within(row).getByRole('link', { name: 'Hello Tom' })).toHaveAttribute('href', '/letter/l1/overview');
      expect(within(row).getByRole('button', { name: 'Add recipient: Hello Tom' }).textContent).toBe('+Add recipientAdd'); // "+ Add" below 400px
      await openMenu(u, 'Hello Tom');
      expect(await menuLabels()).toEqual(['Open', 'Preview', 'Delete letter']);
    });

    it('sent, public: the same + Add recipient; Copy link moves into the menu (Copy link, Preview, Delete letter)', async () => {
      const u = user();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mocks.getAllSentLettersOrThrow.mockResolvedValue([{ ...sentLetter, mode: 'one-to-many' }]);
      renderPage('/artifacts?tab=letters&list=sent');
      await screen.findByText('Hello Tom');
      const row = rows()[0]!;
      expect(buttons(row)).toEqual(['Add recipient: Hello Tom', 'Actions for Hello Tom']);
      expect(within(row).queryByRole('button', { name: /^Copy link/ })).toBeNull();
      await openMenu(u, 'Hello Tom');
      expect(await menuLabels()).toEqual(['Open', 'Copy link', 'Preview', 'Delete letter']);
      await u.click(screen.getByRole('menuitem', { name: /Copy link/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/letter/l1`));
    });

    it('sent: Preview opens the draft in a new tab', async () => {
      const u = user();
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      renderPage('/artifacts?tab=letters&list=sent');
      await openMenu(u, 'Hello Tom');
      await u.click(await screen.findByRole('menuitem', { name: /Preview/ }));
      expect(open).toHaveBeenCalledWith('/letter/d9/preview', '_blank', 'noopener,noreferrer');
      open.mockRestore();
    });

    it('sent: Delete letter is muted once someone has the letter (a tap says why); with nobody it asks, deletes on confirm, refreshes', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=sent');
      await openMenu(u, 'Hello Tom');
      const del = await screen.findByRole('menuitem', { name: /Delete letter/ });
      expect(del).toHaveAttribute('aria-disabled', 'true'); // the fixture letter has one recipient
      await u.click(del);
      expect(toast).toHaveBeenCalledWith("Can't delete — letter has been shared.");
      cleanup();
      mocks.getDeliveriesForLettersOrThrow.mockResolvedValue({});
      mocks.deleteLetter.mockResolvedValue(undefined);
      renderPage('/artifacts?tab=letters&list=sent');
      await openMenu(u, 'Hello Tom');
      const free = await screen.findByRole('menuitem', { name: /Delete letter/ });
      expect(free).not.toHaveAttribute('aria-disabled', 'true');
      await u.click(free);
      expect(await screen.findByText('Delete letter?')).toBeInTheDocument();
      expect(mocks.deleteLetter).not.toHaveBeenCalled();
      const calls = mocks.getAllSentLettersOrThrow.mock.calls.length;
      await u.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(mocks.deleteLetter).toHaveBeenCalledWith('l1'));
      await waitFor(() => expect(mocks.getAllSentLettersOrThrow.mock.calls.length).toBeGreaterThan(calls));
    });

    it('sent: + Add recipient opens the add-recipient dialog for that letter', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=sent');
      await u.click(await screen.findByRole('button', { name: 'Add recipient: Hello Tom' }));
      expect(await screen.findByTestId('receiver-modal')).toHaveTextContent('l1');
      await u.click(screen.getByText('mock-added'));
      expect(screen.queryByTestId('receiver-modal')).toBeNull();
    });

    it('received: a quiet Open; the row opens the letter, or your results once finished, and says Finished', async () => {
      mocks.getAllReceivedLetters.mockResolvedValue([
        received(),
        received({ delivery_id: 'rd2', letter_id: 'rl2', title: 'Finished note', completed_at: ago(H), read_at: ago(H) }),
      ]);
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Note from Mara');
      for (const row of rows()) {
        expect(buttons(row)).toEqual([`Open: ${within(row).getByRole('link').textContent}`]);
      }
      expect(screen.getByRole('link', { name: 'Note from Mara' })).toHaveAttribute('href', '/letter/rd1');
      expect(screen.getByRole('link', { name: 'Finished note' })).toHaveAttribute('href', '/letter/rl2/results?delivery=rd2');
      expect(rows().find(r => r.textContent?.includes('Finished note'))!).toHaveTextContent('From Mara · Finished · ');
      expect(screen.queryByRole('button', { name: /^Results/ })).toBeNull(); // one word on every received row: Open, never Open vs Results
    });

    it('own canvas: Share (blue outline) then … ; the menu has Copy link, muted with a toast while the canvas is private', async () => {
      const u = user();
      mocks.listMyCanvases.mockResolvedValue([{ canvasId: null, name: 'sales_map', generalAccess: 'restricted', hasAudience: false, lastEdit: ago(3 * 24 * H) }]);
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      expect(buttons(rows()[0]!)).toEqual(['Share: Sales map', 'Actions for Sales map']);
      expect(screen.getByRole('link', { name: 'Sales map' })).toHaveAttribute('href', '/p/me/canvas/sales_map');
      await openMenu(u, 'Sales map');
      const copyItem = await screen.findByRole('menuitem', { name: /Copy link/ });
      expect(copyItem).toHaveAttribute('aria-disabled', 'true');
      await u.click(copyItem);
      expect(toast).toHaveBeenCalledWith('Share this canvas first to get a link.');
    });

    it('own canvas: Share opens the canvas page\'s own share panel for that canvas', async () => {
      const u = user();
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-signal', '0');
      await u.click(screen.getByRole('button', { name: 'Share: Sales map' }));
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-name', 'sales_map');
      expect(screen.getByTestId('share-control')).toHaveAttribute('data-signal', '1');
      expect(loc()).toBe('/artifacts?tab=canvases'); // the row did not open
    });

    it('own canvas open to anyone with the link: Copy link fetches the current token and copies an address that carries #k=', async () => {
      const u = user();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mocks.getAccess.mockResolvedValue({ entries: [], generalAccess: 'link', linkToken: 'tok123' });
      renderPage('/artifacts?tab=canvases'); // the fixture canvas has link access
      await openMenu(u, 'Sales map');
      await u.click(await screen.findByRole('menuitem', { name: /Copy link/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/me/canvas/sales_map#k=tok123`));
      expect(mocks.getAccess).toHaveBeenCalledWith('sales_map');
    });

    it('a link-public canvas whose token cannot be read copies nothing and says so', async () => {
      const u = user();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mocks.getAccess.mockRejectedValue(new Error('rpc down'));
      renderPage('/artifacts?tab=canvases');
      await openMenu(u, 'Sales map');
      await u.click(await screen.findByRole('menuitem', { name: /Copy link/ }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to copy link'));
      expect(writeText).not.toHaveBeenCalled();
    });

    it('a shared (restricted) canvas copies the plain address without asking for a token', async () => {
      const u = user();
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mocks.listMyCanvases.mockResolvedValue([{ canvasId: null, name: 'sales_map', generalAccess: 'restricted', hasAudience: true, lastEdit: ago(H) }]);
      renderPage('/artifacts?tab=canvases');
      await openMenu(u, 'Sales map');
      await u.click(await screen.findByRole('menuitem', { name: /Copy link/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/me/canvas/sales_map`));
      expect(mocks.getAccess).not.toHaveBeenCalled();
    });

    it('shared canvas: a quiet Open, the row opens the canvas', async () => {
      renderPage('/artifacts?tab=canvases&list=shared');
      await screen.findByText('Q4 plan');
      const row = rows()[0]!;
      expect(buttons(row)).toEqual(['Open: Q4 plan']);
      expect(within(row).getByRole('link', { name: 'Q4 plan' })).toHaveAttribute('href', '/p/tom/canvas/q4_plan');
    });

    it('no row has an expansion toggle: a sent row does not open in place', async () => {
      renderPage('/artifacts?tab=letters&list=sent');
      await screen.findByText('Hello Tom');
      expect(screen.queryByRole('button', { name: /who it went to/ })).toBeNull();
      expect([...document.querySelectorAll('[aria-expanded]')].filter(el => !/^Actions for/.test(el.getAttribute('aria-label') ?? ''))).toHaveLength(0); // only the "…" menus
      expect(screen.queryByTestId('letter-recipients')).toBeNull();
    });

    it('controls are 40px targets and never wrap under the title', async () => {
      renderPage('/artifacts?tab=letters&list=sent');
      await screen.findByText('Hello Tom');
      for (const el of within(rows()[0]!).getByTestId('row-actions').querySelectorAll('button')) expect(el.className).toMatch(/\b(h-10|w-10)\b/);
    });
  });

  describe('search covers the current list only', () => {
    it('expands in place, filters titles, and closing clears it; the title and New letter stay', async () => {
      const u = user();
      mocks.getDocsByUserOrThrow.mockResolvedValue([doc(), doc({ id: 'd2', title: 'Something else' })]);
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'Search artifacts' }));
      expect(screen.getByRole('heading', { level: 1, name: 'Artifacts' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New letter' })).toBeInTheDocument();
      await u.type(screen.getByRole('searchbox', { name: 'Search artifacts by title' }), 'TRUST');
      expect(titles()).toEqual(['Draft about trust']);
      await u.clear(screen.getByRole('searchbox'));
      await u.type(screen.getByRole('searchbox'), 'zzz');
      expect(screen.getByText('No drafts match “zzz”.')).toBeInTheDocument();
      await u.click(screen.getByRole('button', { name: 'Close search' }));
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(rows()).toHaveLength(2);
    });

    it('a title from another list does not match: on Received, "trust" (a draft) finds nothing and the line names the list', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Note from Mara');
      await u.click(screen.getByRole('button', { name: 'Search artifacts' }));
      await u.type(screen.getByRole('searchbox'), 'trust');
      // plain text naming the scope (this list), not a dashed box
      const line = screen.getByText('No received letters match “trust”.');
      expect(line.className).not.toMatch(/dashed|border/);
      expect(line.parentElement!.className).not.toMatch(/dashed|border/);
      expect(rows()).toHaveLength(0);
    });

    it('the same query keeps applying to the list you switch to, and Clear search clears it', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'Search artifacts' }));
      await u.type(screen.getByRole('searchbox'), 'hello');
      expect(screen.getByText('No drafts match “hello”.')).toBeInTheDocument();
      await u.click(chip('Sent'));
      expect(titles()).toEqual(['Hello Tom']);
      await u.click(chip('Drafts'));
      await u.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(titles()).toEqual(['Draft about trust']);
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      expect(loc()).toBe('/artifacts?tab=letters'); // only the query is cleared; the list stays
    });

    it('search keeps one style at every width: magnifier shown, blue focus ring, title and New letter untouched', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'Search artifacts' }));
      const box = screen.getByRole('searchbox');
      expect(box.className).toContain('focus-visible:ring-blue-600');
      expect(box.className).not.toContain('focus-visible:ring-2');
      expect(box.parentElement!.querySelector('svg.lucide-search')!.getAttribute('class')).not.toMatch(/hidden/);
      expect(screen.getByRole('heading', { level: 1, name: 'Artifacts' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'New letter' })).toBeVisible();
    });

    it('the search clear button has a 40px hit area and the field keeps a minimum width on a phone', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'Search artifacts' }));
      const close = screen.getByRole('button', { name: 'Close search' });
      expect(close.className).toMatch(/\bh-10\b/);
      expect(close.className).toMatch(/\bw-10\b/);
      expect(screen.getByRole('search').className).toMatch(/min-w-\[130px\]/);
      // while searching, the long label waits for sm and the narrowest phones drop to the "+" (the button keeps its aria-label)
      expect(screen.getByText('New', { selector: 'span.sm\\:hidden' }).className).toMatch(/max-\[340px\]:hidden/);
      expect(screen.getByText('New letter').className).toMatch(/\bhidden\b.*\bsm:inline\b/);
    });
  });

  it('header, tabs and filter scroll together: nothing is sticky (as Feed and Chats)', async () => {
    const { container } = renderPage();
    await screen.findByText('Draft about trust');
    expect(container.querySelector('.sticky')).toBeNull();
  });

  describe('New letter', () => {
    it('is the blue button on the Letters tab, in the header row; the old "New artifact" menu is gone', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      const btn = screen.getByRole('button', { name: 'New letter' });
      expect(btn.className).toContain('bg-blue-600');
      expect(btn.closest('header')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'New artifact' })).toBeNull();
      expect(screen.queryByText(/New artifact/)).toBeNull();
      // it is shown in every Letters list, hidden for Canvases
      await user().click(chip('Received'));
      expect(screen.getByRole('button', { name: 'New letter' })).toBeInTheDocument();
    });

    it('reads "+ New letter" from 360px up and "+ New" below, with the plus kept; the aria-label is always "New letter"', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      const btn = screen.getByRole('button', { name: 'New letter' });
      expect(btn.querySelector('svg.lucide-plus')).not.toBeNull();
      expect(within(btn).getByText('New letter').className).toMatch(/\bhidden\b.*min-\[360px\]:inline/);
      expect(within(btn).getByText('New').className).toMatch(/min-\[360px\]:hidden/);
      expect(within(btn).getByText('New').className).not.toMatch(/max-\[340px\]:hidden/); // only hidden while the search field is open
    });

    it('Canvases shows no New button, in either of its lists', async () => {
      const u = user();
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      expect(screen.queryByRole('button', { name: /^New/ })).toBeNull();
      await u.click(chip('Shared with me'));
      expect(screen.queryByRole('button', { name: /^New/ })).toBeNull();
    });

    it('a tap asks "Who can read it?" with two choices; Private creates a private draft and opens it', async () => {
      const u = user();
      mocks.createDoc.mockResolvedValue({ id: 'new-doc' });
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'New letter' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Who can read it?')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /^Private\s*Only people you send it to$/ })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /^Public\s*Anyone with the link$/ })).toBeInTheDocument();
      expect(mocks.createDoc).not.toHaveBeenCalled();
      await u.click(within(dialog).getByRole('button', { name: /^Private\s*Only people you send it to$/ }));
      await waitFor(() => expect(mocks.createDoc).toHaveBeenCalledWith('private'));
      await waitFor(() => expect(loc()).toBe('/letters/drafts/new-doc'));
    });

    it('Public creates a public draft', async () => {
      const u = user();
      mocks.createDoc.mockResolvedValue({ id: 'pub-doc' });
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'New letter' }));
      await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Public\s*Anyone with the link$/ }));
      await waitFor(() => expect(mocks.createDoc).toHaveBeenCalledWith('public'));
      await waitFor(() => expect(loc()).toBe('/letters/drafts/pub-doc'));
    });

    it('Cancel creates nothing', async () => {
      const u = user();
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'New letter' }));
      await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(mocks.createDoc).not.toHaveBeenCalled();
      expect(loc()).toBe('/artifacts');
    });

    it('a failed create says so and stays on the page, ready to try again', async () => {
      const u = user();
      mocks.createDoc.mockRejectedValue(new Error('x'));
      renderPage();
      await screen.findByText('Draft about trust');
      await u.click(screen.getByRole('button', { name: 'New letter' }));
      await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Private\s*Only people you send it to$/ }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't create draft."));
      expect(loc()).toBe('/artifacts');
      await waitFor(() => expect(screen.getByRole('button', { name: 'New letter' })).toBeEnabled());
    });
  });

  describe('opening items', () => {
    it('each row\'s link opens the item\'s existing page: a draft edits, a sent letter opens its overview, a canvas opens the canvas', async () => {
      renderPage();
      await screen.findByText('Draft about trust');
      expect(screen.getByRole('link', { name: 'Draft about trust' })).toHaveAttribute('href', '/letters/drafts/d1');
      cleanup();
      renderPage('/artifacts?tab=letters&list=sent');
      expect(await screen.findByRole('link', { name: 'Hello Tom' })).toHaveAttribute('href', '/letter/l1/overview');
      cleanup();
      renderPage('/artifacts?tab=canvases');
      expect(await screen.findByRole('link', { name: 'Sales map' })).toHaveAttribute('href', '/p/me/canvas/sales_map');
    });

    it('opening a sent row with something new clears its dot at once (all of its deliveries\' news), and hands the overview who was new', async () => {
      const u = user();
      const stay = (e: Event) => e.preventDefault();
      document.addEventListener('click', stay, true);
      mocks.getUnreadExplainBackCountsByDelivery.mockResolvedValue({ dv1: 1 });
      try {
        renderPage('/artifacts?tab=letters&list=sent');
        await screen.findByTestId('list-dot-sent');
        const row = rows()[0]!;
        expect(within(row).getByRole('img', { name: 'New' })).toBeInTheDocument();
        await u.click(within(row).getByRole('link', { name: 'Hello Tom' }));
        expect(mocks.clearSenderNew).toHaveBeenCalledWith('dv1');
        expect(within(rows()[0]!).queryByRole('img', { name: 'New' })).toBeNull();
        expect(screen.queryByTestId('list-dot-sent')).toBeNull();
        expect(screen.queryByTestId('tab-dot-letters')).not.toBeNull(); // Received is still unread
      } finally {
        document.removeEventListener('click', stay, true);
      }
    });

    it('a sent row with nothing new opens without clearing anything', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=sent');
      await u.click(await screen.findByRole('link', { name: 'Hello Tom' }));
      expect(mocks.clearSenderNew).not.toHaveBeenCalled();
    });

    it('opening an unread item tells the nav badge to re-read', async () => {
      const u = user();
      const stay = (e: Event) => e.preventDefault();
      document.addEventListener('click', stay, true);
      const onRead = vi.fn();
      window.addEventListener('p1545:artifacts-read', onRead);
      try {
        renderPage('/artifacts?tab=letters&list=received');
        await screen.findByText('Note from Mara');
        await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
        await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
      } finally {
        document.removeEventListener('click', stay, true);
        window.removeEventListener('p1545:artifacts-read', onRead);
      }
    });

    it('opening an unread received letter marks the delivery read', async () => {
      const u = user();
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Note from Mara');
      await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
      expect(mocks.markDeliveryRead).toHaveBeenCalledWith('rd1');
      await waitFor(() => expect(loc()).toBe('/letter/rd1'));
    });

    it('opening an unread shared canvas marks it read for that owner and name', async () => {
      const u = user();
      renderPage('/artifacts?tab=canvases&list=shared');
      await screen.findByText('Q4 plan');
      await u.click(screen.getByRole('link', { name: 'Q4 plan' }));
      expect(mocks.markCanvasRead).toHaveBeenCalledWith('o1', 'q4_plan');
      await waitFor(() => expect(loc()).toBe('/p/tom/canvas/q4_plan'));
    });

    it('a failed mark-read brings the unread dot back and the next open retries', async () => {
      const u = user();
      const stay = (e: Event) => e.preventDefault();
      document.addEventListener('click', stay, true);
      try {
        mocks.markDeliveryRead.mockRejectedValueOnce(new Error('x'));
        renderPage('/artifacts?tab=letters&list=received');
        await screen.findByText('Note from Mara');
        const rowOf = () => rows().find(r => r.textContent?.includes('Note from Mara'))!;
        await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
        await waitFor(() => expect(within(rowOf()).getByRole('img', { name: 'Unread' })).toBeInTheDocument());
        await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
        expect(mocks.markDeliveryRead).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(within(rowOf()).queryByRole('img', { name: 'Unread' })).toBeNull());
      } finally {
        document.removeEventListener('click', stay, true);
      }
    });

    it('once the server reports the item read, a later re-share shows unread again', async () => {
      const u = user();
      const stay = (e: Event) => e.preventDefault();
      document.addEventListener('click', stay, true);
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      const canvasRow = () => rows().find(r => r.textContent?.includes('Q4 plan'))!;
      const refresh = async () => { await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); };
      const sharedCanvas = (unread: boolean) => ({ canvasId: 'c1', name: 'q4_plan', ownerId: 'o1', ownerName: 'Tom', ownerSlug: 'tom', ownerAvatarUrl: null, ownerAvatarColor: null, via: 'person', viaName: null, sharedAt: ago(H), unread });
      try {
        renderPage('/artifacts?tab=canvases&list=shared');
        await screen.findByText('Q4 plan');
        await u.click(screen.getByRole('link', { name: 'Q4 plan' }));
        expect(within(canvasRow()).queryByRole('img', { name: 'Unread' })).toBeNull();
        mocks.listSharedWithMe.mockResolvedValue([sharedCanvas(false)]); // the server now reports it read
        await refresh();
        await waitFor(() => expect(mocks.listSharedWithMe).toHaveBeenCalledTimes(2));
        expect(within(canvasRow()).queryByRole('img', { name: 'Unread' })).toBeNull();
        mocks.listSharedWithMe.mockResolvedValue([sharedCanvas(true)]); // re-shared
        await refresh();
        await waitFor(() => expect(within(canvasRow()).getByRole('img', { name: 'Unread' })).toBeInTheDocument());
      } finally {
        document.removeEventListener('click', stay, true);
      }
    });

    it('a read item opens without marking anything', async () => {
      const u = user();
      mocks.getAllReceivedLetters.mockResolvedValue([received({ read_at: ago(H) })]);
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Note from Mara');
      await u.click(screen.getByRole('link', { name: 'Note from Mara' }));
      expect(mocks.markDeliveryRead).not.toHaveBeenCalled();
    });
  });

  describe('live invite', () => {
    const openInvite = { sessionId: 's1', code: 'ABC', authorName: 'Zed', storyTitle: 'A story', closedAt: null };

    it('sits above both tabs with Join, in a Letters list and in Canvases alike', async () => {
      mocks.invite.current = openInvite;
      renderPage('/artifacts?tab=letters&list=received');
      const row = await screen.findByTestId('live-invite-row');
      await screen.findByText('Note from Mara'); // the invite no longer waits for the lists
      expect(row).toHaveTextContent('Zed invited you to verify A story');
      expect(within(row).getByRole('button', { name: 'Join' })).toBeInTheDocument();
      expect(row.compareDocumentPosition(rows()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(row.compareDocumentPosition(screen.getByRole('tab', { name: /Letters/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      cleanup();
      renderPage('/artifacts?tab=canvases');
      expect(await screen.findByTestId('live-invite-row')).toBeInTheDocument();
    });

    it('is not counted in any dot: it carries its own', async () => {
      mocks.invite.current = openInvite;
      mocks.getAllReceivedLetters.mockResolvedValue([]);
      mocks.listSharedWithMe.mockResolvedValue([]);
      renderPage();
      await screen.findByTestId('live-invite-row');
      await screen.findByText('Draft about trust');
      expect(screen.queryAllByTestId(/-dot-/)).toHaveLength(0);
    });

    it('still shows at the top while the Received sources are loading', async () => {
      mocks.invite.current = openInvite;
      mocks.getAllReceivedLetters.mockReturnValue(new Promise(() => {}));
      mocks.getInboxItems.mockReturnValue(new Promise(() => {}));
      renderPage('/artifacts?tab=letters&list=received');
      expect(await screen.findByTestId('live-invite-row')).toHaveTextContent('Zed invited you to verify A story');
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('still shows above the error and Retry when the Received source fails', async () => {
      mocks.invite.current = openInvite;
      mocks.getAllReceivedLetters.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=letters&list=received');
      expect(await screen.findByText('Something went wrong loading what was shared with you.')).toBeInTheDocument();
      expect(screen.getByTestId('live-invite-row')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('stays when a search is active', async () => {
      mocks.invite.current = openInvite;
      renderPage('/artifacts?tab=canvases');
      await screen.findByText('Sales map');
      await user().click(screen.getByRole('button', { name: 'Search artifacts' }));
      await user().type(screen.getByRole('searchbox'), 'zzz');
      expect(screen.getByTestId('live-invite-row')).toBeInTheDocument();
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
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Letter 0');
      expect(rows()).toHaveLength(25);
      expect(screen.getByText('Letter 24')).toBeInTheDocument();
      expect(screen.queryByText('Hello Tom')).toBeNull();
    });

    it('a failing sender-activity read does not blank or error Received', async () => {
      mocks.getInboxItems.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=letters&list=received');
      await screen.findByText('Note from Mara');
      expect(screen.queryByText('Some items could not be loaded.')).toBeNull();
    });
  });

  describe('loading, error and empty states', () => {
    it('shows a loader first', () => {
      mocks.getDocsByUserOrThrow.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('a list whose source failed shows the message and Retry; the other lists stay usable', async () => {
      const u = user();
      mocks.getAllSentLettersOrThrow.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=letters&list=sent');
      expect(await screen.findByText('Something went wrong loading your artifacts.')).toBeInTheDocument();
      await u.click(chip('Drafts'));
      expect(await screen.findByText('Draft about trust')).toBeInTheDocument();
      await u.click(chip('Sent'));
      mocks.getAllSentLettersOrThrow.mockResolvedValue([sentLetter]);
      await u.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText('Hello Tom')).toBeInTheDocument();
    });

    it('a failing received-letters read is the Received list\'s error only', async () => {
      mocks.getAllReceivedLetters.mockRejectedValue(new Error('x'));
      renderPage('/artifacts?tab=canvases&list=shared');
      await screen.findByText('Q4 plan');
      expect(screen.queryByText('Something went wrong loading what was shared with you.')).toBeNull();
    });

    it('each empty list says so', async () => {
      mocks.getDocsByUserOrThrow.mockResolvedValue([]);
      mocks.getAllSentLettersOrThrow.mockResolvedValue([]);
      mocks.listMyCanvases.mockResolvedValue([]);
      mocks.getInboxItems.mockResolvedValue([]);
      mocks.getAllReceivedLetters.mockResolvedValue([]);
      mocks.listSharedWithMe.mockResolvedValue([]);
      const expectations: [string, RegExp | string][] = [
        ['/artifacts', /Nothing here yet\./],
        ['/artifacts?tab=letters&list=sent', 'No letters sent yet.'],
        ['/artifacts?tab=letters&list=received', 'Nothing has been shared with you yet.'],
        ['/artifacts?tab=canvases', 'No canvases here yet.'],
        ['/artifacts?tab=canvases&list=shared', 'Nothing has been shared with you yet.'],
      ];
      for (const [url, text] of expectations) {
        renderPage(url);
        expect(await screen.findByText(text)).toBeInTheDocument();
        cleanup();
      }
    });
  });

  it('does not show the empty state while the list\'s source is still pending', async () => {
    mocks.getDocsByUserOrThrow.mockResolvedValue([]);
    mocks.getAllSentLettersOrThrow.mockReturnValue(new Promise(() => {}));
    renderPage('/artifacts?tab=letters&list=sent');
    await screen.findByRole('status', { name: 'Loading' });
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText(/nothing here|no letters|yet/i)).toBeNull();
  });
});
