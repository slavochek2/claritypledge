/**
 * @file p1536-message-list-canvas.test.tsx
 * @description P1536 v2: the two hooks the message list gives a canvas thread. `tail` is drawn after the last message
 * inside the scroll (the draft card), and `hideId` keeps one message out of the list (a new canvas's root, which only
 * carries the draft's own version) without touching the others.
 */
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ConversationApi } from '@/app/pages/chat/MessageList';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body}</li> }));

import { MessageList } from '@/app/pages/chat/MessageList';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});

const m = (id: string, body: string, createdAt: string): ChatMessage => ({
  id, conversationId: 'c', authorId: 'me', body, createdAt, editedAt: null, deletedAt: null, isDeleted: false, replyToId: null, threadRootId: 'root',
  forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
});

const conv = {
  status: 'ready', messages: [m('root', 'the root', '2026-10-27T08:00:00.000Z'), m('a', 'my note', '2026-10-27T09:00:00.000Z'), m('b', 'the reply', '2026-10-27T10:00:00.000Z')],
  stats: new Map(), hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0,
  retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
} as unknown as ConversationApi;

function mount(extra: { tail?: ReactNode; hideId?: string | null; leadAfterId?: string | null }) {
  return render(
    <MemoryRouter>
      <MessageList conv={conv} actions={{} as never} viewerId="me" authors={{}} label="Thread messages" empty="empty" lead={<p>opener</p>} {...extra} />
    </MemoryRouter>,
  );
}

describe('MessageList: tail and hideId', () => {
  it('the tail is drawn after the last message, inside the scroll', () => {
    mount({ tail: <p data-testid="the-tail">draft card</p> });
    const tail = screen.getByTestId('the-tail');
    expect(screen.getByTestId('message-scroller')).toContainElement(tail);
    expect((document.querySelector('[data-msg="b"]')?.compareDocumentPosition(tail) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('CONTROL: no tail, no tail wrapper', () => {
    mount({});
    expect(screen.queryByTestId('message-tail')).not.toBeInTheDocument();
  });

  it('hideId keeps that one message out of the list, and only that one', () => {
    mount({ hideId: 'root' });
    expect(document.querySelector('[data-msg="root"]')).toBeNull();
    expect(document.querySelector('[data-msg="a"]')).not.toBeNull();
    expect(document.querySelector('[data-msg="b"]')).not.toBeNull();
  });

  it('CONTROL: with no hideId every message is drawn', () => {
    mount({});
    expect(document.querySelectorAll('[data-msg]')).toHaveLength(3);
  });
});

/** The ids and the opener in the order they sit in the page. */
const order = () => [...document.querySelectorAll('[data-msg], [data-testid="message-lead"]')].map((n) => n.getAttribute('data-msg') ?? 'LEAD');

describe('MessageList: where the lead sits', () => {
  it('CONTROL: by default the lead is above every message', () => {
    mount({});
    expect(order()).toEqual(['LEAD', 'root', 'a', 'b']);
  });

  it('an update thread: the base-version card (the root) comes first, then the lead, then the messages', () => {
    mount({ leadAfterId: 'root' });
    expect(order()).toEqual(['root', 'LEAD', 'a', 'b']);
    expect(screen.getAllByTestId('message-lead')).toHaveLength(1);
  });

  it('a leadAfterId that is not in the list leaves the lead at the top', () => {
    mount({ leadAfterId: 'gone' });
    expect(order()).toEqual(['LEAD', 'root', 'a', 'b']);
  });

  it('a hidden root cannot anchor the lead: it stays at the top', () => {
    mount({ leadAfterId: 'root', hideId: 'root' });
    expect(order()).toEqual(['LEAD', 'a', 'b']);
  });
});
