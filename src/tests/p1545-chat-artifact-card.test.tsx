/**
 * @file p1545-chat-artifact-card.test.tsx
 * @description P1545 WP4: a canvas / letter shared into a chat is a small card that opens the artifact.
 *   - available canvas: title, "<first name> shared a canvas", links to the canvas page
 *   - available letter: the recipient opens /letter/<their delivery id> (the route takes a DELIVERY id),
 *     the sender /letter/:id/overview
 *   - unavailable: "No longer available", muted, not a link
 *   - one read per artifact, however many cards or renders
 *   - opening a canvas as a reader marks it read (and the owner does not call it)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ChatArtifact } from '@/app/data/canvas-service';

const svc = vi.hoisted(() => ({
  getChatArtifact: vi.fn(),
  markCanvasRead: vi.fn(async () => undefined),
  getCanvas: vi.fn(),
  getAudience: vi.fn(async () => []),
  setPosition: vi.fn(),
}));
const auth = vi.hoisted(() => ({ viewerId: 'viewer-1' }));

vi.mock('@/app/data/canvas-service', () => ({ canvasService: svc }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId }, sessionChecked: true }),
}));
vi.mock('@/app/data/api', () => ({
  getProfileBySlugResult: vi.fn(async () => ({
    success: true,
    data: { id: 'owner-1', name: 'Ana', avatarUrl: null, avatarColor: '#3b82f6', hasPledged: false },
  })),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getCanvasProjectTags: vi.fn(async () => ['sales']) } }));
vi.mock('@/app/data/calibration-service', () => ({ calibrationService: { getEarsCount: vi.fn(async () => 0) } }));
vi.mock('@/app/contexts/agent-accounts-context', () => ({ useAgentAccountIds: () => ({ isAgentAccountId: () => false, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/pages/not-found-page', () => ({ NotFoundPage: () => <div data-testid="canvas-not-found" /> }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="point-card" /> }));
vi.mock('@/app/components/social/point-positions-block', () => ({ PointPositionsBlock: () => null }));
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({ LetterPositionStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-add-story-dialog', () => ({ CanvasAddStoryDialog: () => null }));
vi.mock('@/app/components/canvas/canvas-share-control', () => ({ CanvasShareControl: () => null }));

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';
import { CanvasPage } from '@/app/pages/canvas-page';
import { clearListReturnCache } from '@/lib/list-return-cache';
import type { PointWithUserPosition } from '@/app/types';
import { TypeDisc } from '@/app/pages/artifacts/artifact-row';

const rawNamed: ChatArtifact = { available: true, kind: 'canvas', id: 'cv2', name: 'q4_roadmap_draft', ownerId: 'owner-1', ownerName: 'Ana Petrova', ownerSlug: 'ana', isOwner: false };
const canvas: ChatArtifact = { available: true, kind: 'canvas', id: 'cv1', name: 'Sales plan', ownerId: 'owner-1', ownerName: 'Ana Petrova', ownerSlug: 'ana', isOwner: false };
const letter: ChatArtifact = { available: true, kind: 'letter', id: 'lt1', title: 'On our roadmap', senderId: 'owner-1', senderName: 'Ana Petrova', senderSlug: 'ana', isSender: false, deliveryId: 'dl1' };

const card = (kind: 'canvas' | 'letter', id: string, compact = false) =>
  render(
    <MemoryRouter>
      <AttachmentCard kind={kind} id={id} viewerId="viewer-1" compact={compact} />
    </MemoryRouter>,
  );

beforeEach(() => {
  clearArtifactAttachmentCache();
  clearListReturnCache();
  svc.getChatArtifact.mockReset();
  svc.markCanvasRead.mockClear();
  svc.getCanvas.mockReset();
  auth.viewerId = 'viewer-1';
});
afterEach(cleanup);

describe('canvas card', () => {
  it('shows the title and who shared it, and opens the canvas page', async () => {
    svc.getChatArtifact.mockResolvedValue(canvas);
    card('canvas', 'cv1');
    const link = await screen.findByTestId('attachment-canvas');
    expect(link).toHaveTextContent('Sales plan');
    expect(link).toHaveTextContent('Ana shared a canvas');
    expect(link).toHaveAttribute('href', '/p/ana/canvas/Sales%20plan');
    expect(link.tagName).toBe('A');
    expect(svc.getChatArtifact).toHaveBeenCalledWith('canvas', 'cv1');
  });

  it('titles a canvas the way the Artifacts list does: underscores as spaces, first letter capitalised, address unchanged', async () => {
    svc.getChatArtifact.mockResolvedValue(rawNamed);
    card('canvas', 'cv2');
    const link = await screen.findByTestId('attachment-canvas');
    expect(link).toHaveTextContent('Q4 roadmap draft');
    expect(link).not.toHaveTextContent('q4_roadmap_draft');
    expect(link).toHaveAttribute('href', '/p/ana/canvas/q4_roadmap_draft');
  });

  it('says "You shared" to the owner', async () => {
    svc.getChatArtifact.mockResolvedValue({ ...canvas, isOwner: true });
    card('canvas', 'cv1');
    expect(await screen.findByTestId('attachment-canvas')).toHaveTextContent('You shared a canvas');
  });

  it('inside a quote it is drawn, not linked (buttons do not nest)', async () => {
    svc.getChatArtifact.mockResolvedValue(canvas);
    card('canvas', 'cv1', true);
    const el = await screen.findByTestId('attachment-canvas');
    expect(el.tagName).not.toBe('A');
    expect(el).toHaveTextContent('Sales plan');
  });
});

describe('letter card', () => {
  it('draws the same envelope icon the Artifacts list uses for letters', async () => {
    svc.getChatArtifact.mockResolvedValue(letter);
    const listDisc = render(<TypeDisc kind="letter" />);
    const listIcon = listDisc.container.querySelector('svg')!.getAttribute('class')!.match(/lucide-[a-z-]+/)![0];
    expect(listIcon).toBe('lucide-mail'); // CONTROL: the reference is what we think it is
    listDisc.unmount();
    card('letter', 'lt1');
    const disc = await screen.findByTestId('attachment-letter-disc');
    expect(disc.querySelector('svg')!.getAttribute('class')).toContain(listIcon);
  });

  it('a recipient opens the letter', async () => {
    svc.getChatArtifact.mockResolvedValue(letter);
    card('letter', 'lt1');
    const link = await screen.findByTestId('attachment-letter');
    expect(link).toHaveTextContent('On our roadmap');
    expect(link).toHaveTextContent('Ana shared a letter');
    // /letter/:id takes a DELIVERY id: a letter with several recipients has one delivery each.
    expect(link).toHaveAttribute('href', '/letter/dl1');
  });

  it('a recipient whose delivery id is missing gets a drawn card, never a link to the letter id', async () => {
    svc.getChatArtifact.mockResolvedValue({ ...letter, deliveryId: null });
    card('letter', 'lt1');
    const el = await screen.findByTestId('attachment-letter');
    expect(el.tagName).not.toBe('A');
    expect(el).toHaveTextContent('On our roadmap');
  });

  it('the sender opens the overview', async () => {
    svc.getChatArtifact.mockResolvedValue({ ...letter, isSender: true });
    card('letter', 'lt1');
    const link = await screen.findByTestId('attachment-letter');
    expect(link).toHaveAttribute('href', '/letter/lt1/overview');
    expect(link).toHaveTextContent('You shared a letter');
  });
});

describe('unavailable and failure', () => {
  it.each(['canvas', 'letter'] as const)('a revoked or deleted %s reads "No longer available" and is not a link', async (kind) => {
    svc.getChatArtifact.mockResolvedValue({ available: false, kind, id: 'gone' });
    card(kind, 'gone');
    const note = await screen.findByTestId(`attachment-${kind}-unavailable`);
    expect(note).toHaveTextContent('No longer available');
    expect(note.tagName).not.toBe('A');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a failed read says so and asks again on the next mount', async () => {
    svc.getChatArtifact.mockRejectedValueOnce(new Error('network'));
    const first = card('canvas', 'cv-err');
    expect(await screen.findByTestId('attachment-error')).toBeInTheDocument();
    first.unmount();
    svc.getChatArtifact.mockResolvedValue(canvas);
    card('canvas', 'cv-err');
    expect(await screen.findByTestId('attachment-canvas')).toBeInTheDocument();
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(2);
  });
});

describe('loading is batched', () => {
  it('two cards for one artifact, and a re-render, read it once', async () => {
    svc.getChatArtifact.mockResolvedValue(canvas);
    const view = render(
      <MemoryRouter>
        <AttachmentCard kind="canvas" id="cv1" viewerId="viewer-1" />
        <AttachmentCard kind="canvas" id="cv1" viewerId="viewer-1" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByTestId('attachment-canvas')).toHaveLength(2));
    view.rerender(
      <MemoryRouter>
        <AttachmentCard kind="canvas" id="cv1" viewerId="viewer-1" />
        <AttachmentCard kind="canvas" id="cv1" viewerId="viewer-1" />
      </MemoryRouter>,
    );
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(1);
  });
});

describe('opening a canvas from a chat marks it read', () => {
  const point = {
    id: 'p1', statement: 'Point one', tags: [], systemTags: ['canvas:problem'], visibility: 'private', userPosition: null,
    totalPositions: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
  } as unknown as PointWithUserPosition;
  const view = (isOwner: boolean) => ({
    points: [point], stories: new Map(), addedStoryIds: [], positions: new Map(),
    visibility: 'shared' as const, isOwner, admitted: true, generalAccess: 'restricted' as const, via: null,
  });
  const page = () =>
    render(
      <MemoryRouter initialEntries={['/p/ana/canvas/sales']}>
        <Routes><Route path="/p/:handle/canvas/:projectTag" element={<CanvasPage />} /></Routes>
      </MemoryRouter>,
    );

  it('a reader\'s page mount calls markCanvasRead with the owner and the canvas name', async () => {
    svc.getCanvas.mockResolvedValue(view(false));
    page();
    await waitFor(() => expect(svc.markCanvasRead).toHaveBeenCalledWith('owner-1', 'sales'));
    expect(svc.markCanvasRead).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a canvas that is not readable marks nothing', async () => {
    svc.getCanvas.mockResolvedValue({ ...view(false), points: [], admitted: false });
    page();
    await screen.findByTestId('canvas-not-found');
    expect(svc.markCanvasRead).not.toHaveBeenCalled();
  });

  it('the owner opening their own canvas does not call it', async () => {
    svc.getCanvas.mockResolvedValue(view(true));
    page();
    await screen.findByTestId('canvas-grid');
    expect(svc.markCanvasRead).not.toHaveBeenCalled();
  });
});
