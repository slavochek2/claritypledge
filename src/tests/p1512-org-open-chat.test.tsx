/**
 * @file p1512-org-open-chat.test.tsx
 * @description P1512 — the group page's "Open chat" button: members only, secondary, and it opens the
 * group's General channel in Home (or Home while the channel is not in the chat list yet).
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';
import type { ChatContextValue } from '@/app/pages/chat/chat-state';

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/components/social/pledger-grid', () => ({ PledgerGrid: () => null }));
vi.mock('@/app/prototypes/events/components/EventsList', () => ({ EventsList: () => null }));
vi.mock('@/app/components/shared/ShareDialog', () => ({ ShareDialog: () => null }));

const org = { id: 'org-1', slug: 'builders', name: 'Builders', blurb: null, description: null, visibility: 'public', hasEvents: false };
const svc = vi.hoisted(() => ({
  getOrganizationBySlug: vi.fn(),
  getMembers: vi.fn(),
  getParticipation: vi.fn(),
  getMyMembership: vi.fn(),
  leaveOrganization: vi.fn(),
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: svc }));

import { OrgPage } from '@/app/pages/org-page';
import { ChatContext } from '@/app/pages/chat/chat-state';

const channel = (id: string, orgId: string): ChatSummary =>
  ({
    conversationId: id,
    kind: 'group',
    title: null,
    other: null,
    org: { id: orgId, slug: 'x', name: 'X' },
    event: null,
    ownerFirstName: null,
    lastMessage: null,
    unreadCount: 0,
    manualUnread: false,
    archived: false,
    lastReadAt: null,
    isPartner: false,
    membersSince: null,
    canSend: true,
    blockedByMe: false,
  }) as ChatSummary;

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}</div>;
}

const refresh = vi.fn();

function renderPage(chats: ChatSummary[] | null) {
  const ctx = chats === null ? null : ({ chats, refresh } as unknown as ChatContextValue);
  return render(
    <MemoryRouter initialEntries={['/groups/builders']}>
      <ChatContext.Provider value={ctx}>
        <Routes>
          <Route path="/groups/:slug" element={<OrgPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refresh.mockResolvedValue(null);
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  svc.getOrganizationBySlug.mockResolvedValue(org);
  svc.getMembers.mockResolvedValue([]);
  svc.getParticipation.mockResolvedValue({});
  svc.getMyMembership.mockResolvedValue({ role: 'member', termsVersion: 1, acceptedAt: '2026-01-01' });
});

describe('P1512 — group page "Open chat"', () => {
  it('a member sees an outline Open chat next to Manage membership, and it opens the group\'s General channel', async () => {
    renderPage([channel('c-other', 'org-9'), channel('c-builders', 'org-1')]);
    const button = await screen.findByRole('button', { name: 'Open chat' });
    expect(screen.getByRole('button', { name: /manage membership/i })).toBeInTheDocument();
    // Secondary: the outline variant, never a second primary.
    expect(button.className).toContain('border');
    expect(button.className).not.toContain('bg-blue');
    fireEvent.click(button);
    expect(await screen.findByTestId('where')).toHaveTextContent('/home/c/c-builders');
  });

  it('right after joining, the channel is not in the list yet: it reads the list again and opens the channel', async () => {
    refresh.mockResolvedValue([channel('c-other', 'org-9'), channel('c-builders', 'org-1')]);
    renderPage([channel('c-other', 'org-9')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/home/c/c-builders');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('it goes to Home only when the list read again still lacks the channel (or the read failed)', async () => {
    refresh.mockResolvedValue([channel('c-other', 'org-9')]);
    const { unmount } = renderPage([channel('c-other', 'org-9')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/home$/);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();

    refresh.mockResolvedValue(null);
    renderPage([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/home$/);
  });

  it('a channel already in the list opens without reading the list again', async () => {
    renderPage([channel('c-builders', 'org-1')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/home/c/c-builders');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a signed-in non-member sees Join and no Open chat', async () => {
    svc.getMyMembership.mockResolvedValue(null);
    renderPage([channel('c-builders', 'org-1')]);
    expect(await screen.findByRole('button', { name: /join as member/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
  });

  it('a signed-out visitor sees Join and no Open chat', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderPage(null);
    expect(await screen.findByRole('button', { name: /join as member/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument();
    await waitFor(() => expect(svc.getMyMembership).not.toHaveBeenCalled());
  });
});

describe('P1512 — a late chat refresh never redirects someone who has already moved on', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
  }

  function renderWithExit(chats: ChatSummary[]) {
    const ctx = { chats, refresh } as unknown as ChatContextValue;
    return render(
      <MemoryRouter initialEntries={['/groups/builders']}>
        <ChatContext.Provider value={ctx}>
          <Link to="/elsewhere">leave</Link>
          <Link to="/groups/other">other group</Link>
          <Routes>
            <Route path="/groups/:slug" element={<OrgPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
  }

  it('navigating to another page before the refresh resolves: the late result does not pull them to the chat', async () => {
    const late = deferred<ChatSummary[] | null>();
    refresh.mockReturnValue(late.promise);
    renderWithExit([channel('c-other', 'org-9')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    fireEvent.click(screen.getByText('leave'));
    expect(await screen.findByTestId('where')).toHaveTextContent('/elsewhere');
    late.resolve([channel('c-builders', 'org-1')]);
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByTestId('where')).toHaveTextContent('/elsewhere');
  });

  it('moving to a DIFFERENT group page (the same component stays mounted) is also a move on', async () => {
    const late = deferred<ChatSummary[] | null>();
    refresh.mockReturnValue(late.promise);
    renderWithExit([channel('c-other', 'org-9')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    fireEvent.click(screen.getByText('other group'));
    late.resolve([channel('c-builders', 'org-1')]);
    await new Promise(r => setTimeout(r, 50));
    // Still on a group page (OrgPage), not redirected into the first group's chat.
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('staying put: the refresh still opens the channel', async () => {
    const late = deferred<ChatSummary[] | null>();
    refresh.mockReturnValue(late.promise);
    renderWithExit([channel('c-other', 'org-9')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }));
    late.resolve([channel('c-builders', 'org-1')]);
    expect(await screen.findByTestId('where')).toHaveTextContent('/home/c/c-builders');
  });
});

