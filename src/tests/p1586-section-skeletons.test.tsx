// @vitest-environment jsdom
/**
 * P1586 §1/§2 "Section → the section look": a section that waits under a drawn page frame shows a
 * skeleton of its own shape, drawn from the shared Skeleton primitive. Never the page loader, a
 * large mark, a centred spinner or "Loading…" text.
 *
 * Every member's loading branch is rendered with a read that never answers. A member also keeps
 * what already distinguished it (its test id, its status label) so the existing tests stay meaningful.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const pending = () => new Promise<never>(() => {});

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'user-id-1', email: 'user@example.com' }, isLoading: false, sessionChecked: true }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn(), setUserProperties: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

vi.mock('@/app/data/letters-service', () => ({
  getInboxItems: vi.fn(() => pending()),
  markDeliveryRead: vi.fn(),
  getUnreadExplainBackCountsByDelivery: vi.fn(() => pending()),
  getAllSentLetters: vi.fn(() => pending()),
  getDeliveriesForLetters: vi.fn(() => pending()),
  deleteLetter: vi.fn(),
}));
vi.mock('@/app/data/docs-service', () => ({
  docsService: { getDocsByUser: vi.fn(() => pending()), getCompatibleStories: vi.fn(() => pending()) },
}));
vi.mock('@/app/data/api', () => ({
  getLiveTurns: vi.fn(() => pending()),
  getVerifiedProfilesPage: vi.fn(() => pending()),
  PLEDGERS_PAGE_SIZE: 30,
}));
const attach = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/app/data/chat-ui-helpers', () => ({ loadAttachment: (...a: unknown[]) => attach.load(...a) }));
vi.mock('@/app/pages/chat/artifact-attachment-cache', () => ({ loadArtifact: (...a: unknown[]) => attach.load(...a) }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => null }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: () => null }));
vi.mock('@/app/components/landing/dual-cta', () => ({ DualCTA: () => null }));
vi.mock('@/app/components/social/pledger-grid', () => ({ PledgerGrid: () => null }));

import { InboxTab } from '@/app/components/letters/inbox-tab';
import { SentTab } from '@/app/components/letters/sent-tab';
import { DraftsTab } from '@/app/components/letters/drafts-tab';
import { ReviewModeView } from '@/app/components/partners/review-mode-view';
import { DocStoryPicker } from '@/app/components/docs/doc-story-picker';
import { ClarityPledgersPage } from '@/app/pages/clarity-pledgers-page';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { ArtifactAttachmentCard } from '@/app/pages/chat/ArtifactAttachmentCard';

const inRouter = (ui: ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

/** Text a sighted reader sees: everything except screen-reader-only text. */
function visibleText(root: ParentNode): string {
  const clone = (root as HTMLElement).cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

/** The section look: pulsing primitive blocks, and none of the things a section must not show. */
function expectSectionSkeleton(root: ParentNode, label: string) {
  const blocks = root.querySelectorAll('.animate-pulse.bg-muted');
  expect(blocks.length, `${label}: skeleton blocks drawn from the primitive`).toBeGreaterThan(1);
  expect(root.querySelector('.clarity-page-loader'), `${label}: no page loader inside a section`).toBeNull();
  expect(root.querySelector('svg[aria-label="Loading"]'), `${label}: no mark`).toBeNull();
  expect(root.querySelector('.animate-spin'), `${label}: no centred spinner`).toBeNull();
  expect(visibleText(root), `${label}: no "Loading" text`).not.toMatch(/loading/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  attach.load.mockReturnValue(pending());
});

describe('P1586 section look: letters tabs', () => {
  it('InboxTab', () => {
    const { container } = render(inRouter(<InboxTab userId="user-id-1" onUnreadCountChange={() => {}} />));
    expect(screen.getByTestId('letter-list-skeleton')).toBeInTheDocument();
    expectSectionSkeleton(container, 'inbox');
  });

  it('SentTab', () => {
    const { container } = render(inRouter(<SentTab userId="user-id-1" />));
    expect(screen.getByTestId('letter-list-skeleton')).toBeInTheDocument();
    expectSectionSkeleton(container, 'sent');
  });

  it('DraftsTab', () => {
    const { container } = render(inRouter(<DraftsTab userId="user-id-1" />));
    expect(screen.getByTestId('letter-list-skeleton')).toBeInTheDocument();
    expectSectionSkeleton(container, 'drafts');
  });
});

describe('P1586 section look: review mode, story picker, pledgers', () => {
  it('ReviewModeView: ideas list', () => {
    const session = { id: 'session-id-1' } as never;
    const liveState = { ideasDiscussed: 2, ideasUnderstood: 1 } as never;
    const { container } = render(
      <ReviewModeView session={session} liveState={liveState} currentUserName="Ann" partnerName="Bob" onToggleMode={() => {}} />,
    );
    expect(screen.getByTestId('review-ideas-skeleton')).toBeInTheDocument();
    expectSectionSkeleton(container, 'review');
  });

  it('DocStoryPicker: results area (dialog stays drawn)', () => {
    render(<DocStoryPicker docId="doc-id-1" docVisibility="public" open onOpenChange={() => {}} onStoryAdded={() => {}} />);
    expect(screen.getByText('Select your story')).toBeInTheDocument();
    expect(screen.getByTestId('story-picker-skeleton')).toBeInTheDocument();
    expectSectionSkeleton(document.body, 'picker');
  });

  it('ClarityPledgersPage: grid under the drawn title, keeping the "loader" test id', () => {
    const { container } = render(inRouter(<ClarityPledgersPage />));
    expect(screen.getByText('Clarity Pledgers')).toBeInTheDocument();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expectSectionSkeleton(container, 'pledgers');
  });
});

describe('P1586 section look: chat attachment cards', () => {
  it('AttachmentCard: a pulsing skeleton row, the kind for screen readers only', () => {
    const { container } = render(<AttachmentCard kind="point" id="point-id-1" viewerId="user-id-1" />);
    const status = screen.getByRole('status', { name: 'Loading attachment' });
    expect(status.className).toContain('animate-pulse');
    expect(status).toHaveTextContent('Loading point');
    expect(visibleText(container)).toBe('');
  });

  it('ArtifactAttachmentCard: same', () => {
    const { container } = render(inRouter(<ArtifactAttachmentCard kind="canvas" id="canvas-id-1" viewerId="user-id-1" />));
    const status = screen.getByRole('status', { name: 'Loading attachment' });
    expect(status.className).toContain('animate-pulse');
    expect(status).toHaveTextContent('Loading canvas');
    expect(visibleText(container)).toBe('');
  });
});
