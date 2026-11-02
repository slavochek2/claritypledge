/**
 * @file p1536-w5-tabs.test.tsx
 * @description P1536 §3b W5 (S3b.5) + W6 landing: Artifacts > Canvases has three lists, Drafts / Mine / Shared with me (like Letters).
 *  - Drafts: my canvases with an open draft; a row opens the workspace on that draft (`?ws=1`)
 *  - Mine: my canvases with at least one published version; a row opens the newest published version (no ws), with the (Draft) tag
 *    when a draft exists (3c X14)
 *  - Shared with me: unchanged
 *  - a canvas with neither (never published, draft discarded) is in no list
 *  - the list is in the address (`list=drafts`, as Letters); a plain `?tab=canvases` is still Mine; the Drafts address is one constant
 *    and a discarded never-published canvas lands on it (W6)
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';

const mocks = vi.hoisted(() => ({
  listMyCanvases: vi.fn(),
  listMyOpenCanvasDrafts: vi.fn(),
  listNewestPublishedSeqs: vi.fn(),
  listSharedWithMe: vi.fn(),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'me', slug: 'me' }, isLoading: false, sessionChecked: true }) }));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDocsByUserOrThrow: vi.fn(async () => []), createDoc: vi.fn(), deleteDoc: vi.fn() } }));
vi.mock('@/app/data/letters-service', () => ({
  getAllSentLettersOrThrow: vi.fn(async () => []),
  getDeliveriesForLettersOrThrow: vi.fn(async () => ({})),
  getInboxItems: vi.fn(async () => []),
  getAllReceivedLetters: vi.fn(async () => []),
  markDeliveryRead: vi.fn(),
  deleteLetter: vi.fn(),
  clearSenderNewForDelivery: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(async () => ({})),
}));
vi.mock('@/app/data/canvas-service', () => ({
  canvasService: { listMyCanvases: mocks.listMyCanvases, listSharedWithMe: mocks.listSharedWithMe, getAccess: vi.fn(), markCanvasRead: vi.fn() },
}));
// The data module answers drafts and numbers from ONE read; the tests keep feeding the two answers separately.
vi.mock('@/app/data/canvas-open-drafts', () => ({
  listMyCanvasDraftState: async () => ({ drafts: await mocks.listMyOpenCanvasDrafts(), newestSeqs: await mocks.listNewestPublishedSeqs() }),
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null, loading: false }) }));
vi.mock('@/app/pages/chat/use-canvas-availability', () => ({ useCanvasDraftAvailability: () => true }));
vi.mock('@/app/pages/chat/use-start-canvas', () => ({ useStartCanvas: () => ({ start: vi.fn(), dialog: null }) }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { ChatContext } from '@/app/pages/chat/chat-state';
import { ArtifactsPage } from '@/app/pages/artifacts/artifacts-page';
import { ARTIFACTS_CANVASES_DRAFTS, ARTIFACTS_CANVASES_MINE } from '@/app/pages/artifacts/legacy-redirect-targets';
import { resolveArtifactsLocation } from '@/app/pages/artifacts/artifacts-view-model';
import { NEVER_PUBLISHED_TARGET, discardLanding } from '@/app/pages/canvas/discard-draft-landing';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 24 * 3600_000;
const canvas = (name: string, over: Record<string, unknown> = {}) => ({ canvasId: `cv-${name}`, name, generalAccess: 'restricted', hasAudience: false, lastEdit: ago(2 * DAY), ...over });
const draft = (name: string, over: Record<string, unknown> = {}) => ({
  draftId: `draft-${name}`, canvasName: name, versionName: `${name}_dabc12`, conversationId: 'conv-mirror', threadRootId: `root-${name}`, nextSeq: 3, revision: 2, ...over,
});

// The fixture covers every membership case once:
//   fresh        draft only (nothing published)            -> Drafts
//   pub_only     published, no draft                       -> Mine
//   both         published AND a draft open                -> Drafts and Mine (badge)
//   gone         never published, draft discarded          -> no list (the server lists nothing for it)
//   (shared)     shared with me by someone else            -> Shared with me
const FIXTURE = {
  canvases: [canvas('fresh', { lastEdit: ago(1 * DAY) }), canvas('pub_only', { lastEdit: ago(3 * DAY) }), canvas('both', { lastEdit: ago(2 * DAY) })],
  drafts: [draft('fresh', { nextSeq: 1 }), draft('both', { nextSeq: 4 })],
  shared: [{ canvasId: 'cv-theirs', name: 'theirs', ownerId: 'o1', ownerName: 'Mara', ownerSlug: 'mara', ownerAvatarUrl: null, ownerAvatarColor: null, via: 'person', viaName: null, sharedAt: ago(DAY), unread: false }],
};

function Where() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}
function renderPage(url: string) {
  const wrap = (ui: ReactNode) => <ChatContext.Provider value={{} as ChatContextValue}>{ui}</ChatContext.Provider>;
  return render(
    <MemoryRouter initialEntries={[url]}>
      {wrap(
        <Routes>
          <Route path="/artifacts" element={<><ArtifactsPage /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>,
      )}
    </MemoryRouter>,
  );
}
const titles = () => screen.getAllByTestId('artifact-row').map(r => within(r).getByRole('heading').textContent);
const rowOf = (title: string) => screen.getAllByTestId('artifact-row').find(r => within(r).queryByText(title))!;
const chip = (name: string) => within(screen.getByRole('group', { name: 'Canvases lists' })).getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mocks.listMyCanvases.mockResolvedValue(FIXTURE.canvases);
  mocks.listMyOpenCanvasDrafts.mockResolvedValue(FIXTURE.drafts);
  mocks.listNewestPublishedSeqs.mockResolvedValue({ both: 3, pub_only: 2 });
  mocks.listSharedWithMe.mockResolvedValue(FIXTURE.shared);
});

describe('W5: three lists, in this order, with Mine the default', () => {
  it('the chips read Drafts, Mine, Shared with me; a plain ?tab=canvases is Mine (every existing link keeps working)', async () => {
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Pub only');
    const labels = within(screen.getByRole('group', { name: 'Canvases lists' })).getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['Drafts', 'Mine', 'Shared with me']);
    expect(chip('Mine')).toHaveAttribute('aria-pressed', 'true');
  });

  it('the list is in the address, as for Letters: Drafts is list=drafts, Mine is the bare tab, Shared is list=shared (history replaced)', async () => {
    const u = userEvent.setup();
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Pub only');
    await u.click(chip('Drafts'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/artifacts?tab=canvases&list=drafts'));
    expect(chip('Drafts')).toHaveAttribute('aria-pressed', 'true');
    await u.click(chip('Shared with me'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/artifacts?tab=canvases&list=shared'));
    await u.click(chip('Mine'));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/artifacts?tab=canvases'));
  });

  it('opening the Drafts address lands on Drafts; the Letters Drafts address is not affected', () => {
    expect(resolveArtifactsLocation(new URLSearchParams('tab=canvases&list=drafts'))).toMatchObject({ tab: 'canvases', list: 'canvas-drafts', legacy: false });
    expect(resolveArtifactsLocation(new URLSearchParams('tab=letters&list=drafts'))).toMatchObject({ tab: 'letters', list: 'drafts' });
    expect(resolveArtifactsLocation(new URLSearchParams('tab=letters'))).toMatchObject({ tab: 'letters', list: 'drafts' });
    expect(resolveArtifactsLocation(new URLSearchParams(ARTIFACTS_CANVASES_DRAFTS.split('?')[1]))).toMatchObject({ tab: 'canvases', list: 'canvas-drafts' });
  });
});

describe('W5: tab membership', () => {
  it('Drafts: the canvases with an open draft (draft only, and published plus a draft), newest edit first; nothing else', async () => {
    renderPage(ARTIFACTS_CANVASES_DRAFTS);
    await screen.findByText('Fresh');
    expect(titles()).toEqual(['Fresh', 'Both']);
    expect(screen.getAllByTestId('artifact-meta').map(m => m.textContent)).toEqual(['v1 · Edited 1d ago', 'v4 · Edited 2d ago']);
  });

  it('Mine: the canvases with a published version (published only, and published plus a draft); a draft-only canvas is NOT here', async () => {
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Pub only');
    expect(titles()).toEqual(['Both', 'Pub only']);
    expect(screen.queryByText('Fresh')).toBeNull();
  });

  it('Shared with me: unchanged', async () => {
    renderPage('/artifacts?tab=canvases&list=shared');
    await screen.findByText('Theirs');
    expect(titles()).toEqual(['Theirs']);
  });

  it('a canvas with neither (never published, its draft discarded) is in no list', async () => {
    mocks.listMyCanvases.mockResolvedValue([canvas('pub_only')]); // the server lists nothing for "gone"
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([]);
    for (const url of [ARTIFACTS_CANVASES_DRAFTS, ARTIFACTS_CANVASES_MINE, '/artifacts?tab=canvases&list=shared']) {
      renderPage(url);
      await waitFor(() => expect(screen.queryByTestId('loc')).not.toBeNull());
      await screen.findByRole('group', { name: 'Canvases lists' });
      await waitFor(() => expect(screen.queryByText('Loading more…')).toBeNull());
      expect(screen.queryByText('Gone')).toBeNull();
      cleanup();
    }
  });

  it('after a discard the draft-only canvas leaves Drafts, and a canvas that still has a published version stays in Mine without the badge', async () => {
    mocks.listMyOpenCanvasDrafts.mockResolvedValue([]);
    mocks.listMyCanvases.mockResolvedValue([canvas('both'), canvas('pub_only')]);
    renderPage(ARTIFACTS_CANVASES_DRAFTS);
    expect(await screen.findByText('No canvas drafts.')).toBeInTheDocument();
    cleanup();
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Both');
    expect(screen.queryByTestId('artifact-badge')).toBeNull();
  });
});

describe('W5: where a row goes', () => {
  it('a Drafts row opens the workspace on that draft: ?v=<draft version>&ws=1', async () => {
    const u = userEvent.setup();
    renderPage(ARTIFACTS_CANVASES_DRAFTS);
    await screen.findByText('Both');
    const link = within(rowOf('Both')).getByRole('link', { name: 'Both' });
    expect(link.getAttribute('href')).toBe('/p/me/canvas/both?v=both_dabc12&ws=1');
    await u.click(link);
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/p/me/canvas/both?v=both_dabc12&ws=1'));
  });

  it('a Mine row opens the newest published version: the canvas path, no ws, no v, even when a draft is open', async () => {
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Both');
    expect(within(rowOf('Both')).getByRole('link', { name: 'Both' }).getAttribute('href')).toBe('/p/me/canvas/both');
    expect(within(rowOf('Pub only')).getByRole('link', { name: 'Pub only' }).getAttribute('href')).toBe('/p/me/canvas/pub_only');
  });

  it('X14: a Mine row carries the (Draft) tag when a draft exists, and none when it does not; its number is the newest published one', async () => {
    renderPage(ARTIFACTS_CANVASES_MINE);
    await screen.findByText('Both');
    expect(within(rowOf('Both')).getByTestId('canvas-draft-tag')).toHaveTextContent('Draft');
    expect(within(rowOf('Both')).getByTestId('artifact-meta')).toHaveTextContent(/^v3 · /);
    expect(within(rowOf('Pub only')).queryByTestId('canvas-draft-tag')).toBeNull();
    expect(within(rowOf('Pub only')).getByTestId('artifact-meta')).toHaveTextContent(/^v2 · /);
  });

  it('X14: a Drafts row has no tag (the list is the state), says the draft number, and has no Share', async () => {
    renderPage(ARTIFACTS_CANVASES_DRAFTS);
    await screen.findByText('Both');
    expect(screen.queryByTestId('canvas-draft-tag')).toBeNull();
    expect(within(rowOf('Both')).getByTestId('artifact-meta')).toHaveTextContent(/^v4 · /);
    expect(screen.queryByRole('button', { name: /^Share:/ })).toBeNull();
  });
});

describe('W6 landing: a discarded never-published canvas lands on Artifacts > Canvases > Drafts', () => {
  it('the constant is the Drafts address, and the address opens the Drafts list', () => {
    expect(NEVER_PUBLISHED_TARGET).toBe(ARTIFACTS_CANVASES_DRAFTS);
    expect(ARTIFACTS_CANVASES_DRAFTS).toBe('/artifacts?tab=canvases&list=drafts');
    const params = new URLSearchParams(ARTIFACTS_CANVASES_DRAFTS.split('?')[1]);
    expect(resolveArtifactsLocation(params)).toMatchObject({ tab: 'canvases', list: 'canvas-drafts' });
  });

  it('discardLanding: nothing published goes to the Drafts address; a canvas with a published version returns to it (CONTROL)', () => {
    const only = { versions: [{ name: 'c_d1', seq: null, draft: true }], draft: { baseSeq: null } } as never;
    expect(discardLanding({ ownerSlug: 'ana', canvasName: 'c', ready: only })).toEqual({ href: ARTIFACTS_CANVASES_DRAFTS, published: false });
    const withV1 = { versions: [{ name: 'c_v1', seq: 1, draft: false }, { name: 'c_d2', seq: null, draft: true }], draft: { baseSeq: 1 } } as never;
    expect(discardLanding({ ownerSlug: 'ana', canvasName: 'c', ready: withV1 })).toEqual({ href: '/p/ana/canvas/c?v=c_v1', published: true });
  });
});
