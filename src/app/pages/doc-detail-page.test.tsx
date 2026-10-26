import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), user: { current: { id: 'me' } as { id: string } | null } }));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: mocks.user.current }) }));
vi.mock('@/app/data/docs-service', () => ({ docsService: { getDoc: mocks.getDoc, deleteDoc: vi.fn() } }));
vi.mock('@/app/data/points-service', () => ({
  pointsService: { getPositionCountsForPoints: vi.fn(async () => new Map()), getMyPositionsForPoints: vi.fn(async () => new Map()) },
}));
vi.mock('@/app/data/short-links', () => ({ resolveDocShortCode: (id: string) => id }));
vi.mock('@/app/hooks/useVerificationGate', () => ({ useVerificationGate: () => ({ checkVerified: () => true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/app/components/docs/doc-header', () => ({ DocHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/app/components/docs/doc-privacy-banner', () => ({ DocPrivacyBanner: () => null }));
vi.mock('@/app/components/docs/doc-story-picker', () => ({ DocStoryPicker: () => null }));
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({ LetterReceiverModal: () => null }));
vi.mock('@/app/components/social/StoryCardDetail', () => ({ StoryCardDetail: () => null }));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: vi.fn() }),
}));

import { DocDetailPage } from './doc-detail-page';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'd1', owner_id: 'me', title: 'Draft about trust', visibility: 'private', story_count: 0, point_count: 0, has_sent_letters: false, ...over,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/letters/drafts/d1']}>
      <Routes><Route path="/letters/drafts/:docId" element={<DocDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.current = { id: 'me' };
});

describe('draft editor: Delete draft moved in from the Artifacts row menu', () => {
  it('the owner sees Delete draft below the stories, beside the one blue Prepare letter', async () => {
    mocks.getDoc.mockResolvedValue({ doc: doc(), stories: [] });
    renderPage();
    const del = await screen.findByRole('button', { name: 'Delete draft' });
    const prepare = screen.getByRole('button', { name: /Prepare letter/ });
    expect(prepare.className).toContain('bg-blue-500');
    expect(del.className).not.toContain('bg-blue-');
    expect(prepare.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('No stories yet').compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(del).toBeEnabled();
  });

  it('once letters were sent from the draft it is disabled with the reason', async () => {
    mocks.getDoc.mockResolvedValue({ doc: doc({ has_sent_letters: true }), stories: [] });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Delete draft' })).toBeDisabled();
    expect(screen.getByText("Can't delete — letters were sent from this draft.")).toBeInTheDocument();
  });

  it('someone who is not the owner never sees it', async () => {
    mocks.user.current = { id: 'visitor' };
    mocks.getDoc.mockResolvedValue({ doc: doc(), stories: [] });
    renderPage();
    await screen.findByText('No stories yet');
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull();
  });
});
