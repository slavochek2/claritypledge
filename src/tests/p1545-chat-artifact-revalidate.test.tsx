/**
 * @file p1545-chat-artifact-revalidate.test.tsx
 * @description P1545 Codex finding 3: the per-viewer attachment cache must not hold an answer forever.
 *   - available -> access revoked -> chat reopened -> the card reads "No longer available"
 *   - unavailable -> access granted -> chat reopened -> the card shows the artifact
 *   - within one open chat, cards and re-renders still share ONE read (batching kept)
 *   - an answer older than the TTL is read again
 *   (sign-out clearing: p1545-artifact-cache-sign-out.test.tsx)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChatArtifact } from '@/app/data/canvas-service';

const svc = vi.hoisted(() => ({ getChatArtifact: vi.fn() }));
const chatSvc = vi.hoisted(() => ({
  listMessages: vi.fn(async () => []),
  listThread: vi.fn(),
  getMessage: vi.fn(),
  getThreadStats: vi.fn(async () => new Map()),
  deleteMessage: vi.fn(),
  editMessage: vi.fn(),
}));
vi.mock('@/app/data/canvas-service', () => ({ canvasService: svc }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-mappers')), ...chatSvc }));
vi.mock('@/app/pages/chat/chat-state', () => {
  const chat = { subscribe: () => () => {}, ensureAuthors: () => {}, outbox: [] };
  return { useChat: () => chat };
});

import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import { useConversationMessages } from '@/app/pages/chat/use-conversation';
import { ARTIFACT_ATTACHMENT_TTL_MS, clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';

const canvas: ChatArtifact = { available: true, kind: 'canvas', id: 'cv1', name: 'Sales plan', ownerId: 'o1', ownerName: 'Ana', ownerSlug: 'ana', isOwner: false };
const gone: ChatArtifact = { available: false, kind: 'canvas', id: 'cv1' };

/** An open chat: the hook loads the conversation, then the card for the artifact shared in it is drawn. */
function Chat({ conversationId }: { conversationId: string }) {
  const { status } = useConversationMessages({ conversationId });
  if (status !== 'ready') return <div data-testid="chat-loading" />;
  return <AttachmentCard kind="canvas" id="cv1" viewerId="viewer-1" />;
}
const open = (conversationId: string) => (
  <MemoryRouter>
    <Chat conversationId={conversationId} />
  </MemoryRouter>
);

beforeEach(() => {
  clearArtifactAttachmentCache();
  svc.getChatArtifact.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('reopening a chat revalidates its artifact cards', () => {
  it('available -> revoked -> reopen: "No longer available"', async () => {
    svc.getChatArtifact.mockResolvedValueOnce(canvas);
    const view = render(open('c1'));
    expect(await screen.findByTestId('attachment-canvas')).toBeInTheDocument();
    svc.getChatArtifact.mockResolvedValueOnce(gone);
    view.unmount(); // the person leaves the chat
    render(open('c1')); // and opens it again
    expect(await screen.findByTestId('attachment-canvas-unavailable')).toHaveTextContent('No longer available');
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(2);
  });

  it('unavailable -> granted -> reopen: the artifact shows', async () => {
    svc.getChatArtifact.mockResolvedValueOnce(gone);
    const view = render(open('c1'));
    expect(await screen.findByTestId('attachment-canvas-unavailable')).toBeInTheDocument();
    svc.getChatArtifact.mockResolvedValueOnce(canvas);
    view.unmount();
    render(open('c1'));
    expect(await screen.findByTestId('attachment-canvas')).toHaveTextContent('Sales plan');
  });

  it('switching to another chat and back revalidates too', async () => {
    svc.getChatArtifact.mockResolvedValueOnce(canvas);
    const view = render(open('c1'));
    await screen.findByTestId('attachment-canvas');
    svc.getChatArtifact.mockResolvedValueOnce(gone);
    view.rerender(open('c2'));
    view.rerender(open('c1'));
    expect(await screen.findByTestId('attachment-canvas-unavailable')).toBeInTheDocument();
  });

  it('CONTROL: staying in the open chat re-renders without a second read', async () => {
    svc.getChatArtifact.mockResolvedValue(canvas);
    const view = render(open('c1'));
    await screen.findByTestId('attachment-canvas');
    view.rerender(open('c1'));
    await waitFor(() => expect(screen.getByTestId('attachment-canvas')).toBeInTheDocument());
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(1);
  });
});

describe('TTL', () => {
  it('an answer older than the TTL is read again; a fresh one is not', async () => {
    const { loadArtifact } = await import('@/app/pages/chat/artifact-attachment-cache');
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    svc.getChatArtifact.mockResolvedValue(canvas);
    await loadArtifact('canvas', 'cv1', 'viewer-1');
    now.mockReturnValue(1_000_000 + ARTIFACT_ATTACHMENT_TTL_MS - 1);
    await loadArtifact('canvas', 'cv1', 'viewer-1');
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000_000 + ARTIFACT_ATTACHMENT_TTL_MS + 1);
    svc.getChatArtifact.mockResolvedValue(gone);
    expect(await loadArtifact('canvas', 'cv1', 'viewer-1')).toEqual(gone);
    expect(svc.getChatArtifact).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
