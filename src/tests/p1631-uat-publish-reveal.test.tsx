/**
 * P1631 UAT, bug 4: right after a first Publish into a DM, "That message isn't loaded, and could not be found further back." appeared.
 * The reveal opens the chat on the new card (?m=<card id>) while the chat may not hold it yet: it is newer than everything loaded, so paging back
 * can never find it. Now the reveal notes the card (published-cards.ts) and asks for one re-read; the list that opens on it claims it, goes to the
 * bottom ONCE and waits, jumps to the card when it arrives (unless the reader scrolled away), and never reports it missing. The wait ends after
 * PUBLISHED_WAIT_MS or when the list's target changes. A search or quote jump behaves as before (controls), and runs once, not on every message.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-mappers';

const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body}</li> }));

import { MessageList } from '@/app/pages/chat/MessageList';
import { PUBLISHED_WAIT_MS, claimPublishedCard, notePublishedCard } from '@/app/pages/chat/published-cards';
import type { useConversationMessages } from '@/app/pages/chat/use-conversation';
import { useRevealPublished } from '@/app/pages/chat/use-reveal-published';

type Conv = ReturnType<typeof useConversationMessages>;
const ME = 'user-id-1234';
const MISSING = "That message isn't loaded, and could not be found further back.";
const row = (id: string, n: number, authorId = ME) => ({
  id, conversationId: 'conv-id-1234', authorId, body: id, createdAt: new Date(Date.UTC(2026, 0, 1, 10, 0, n)).toISOString(), editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null,
  kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
}) as unknown as ChatMessage;
/** One conversation as the hook hands it to the list; getLoaded reads the rows, as the real hook's does. */
function conv(messages: ChatMessage[], ensureLoaded: Conv['ensureLoaded'] = vi.fn(async () => false)) {
  return {
    status: 'ready', messages, server: messages, stats: new Map(), hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(async () => 0), ensureLoaded,
    lookup: vi.fn(), getLoaded: (id: string) => messages.find((m) => m.id === id), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  } as unknown as Conv;
}
const list = (c: Conv, targetId: string | null) => <MessageList conv={c} actions={{} as never} viewerId={ME} authors={{}} label="Messages" targetId={targetId} empty={null} />;

/** The scroller with real-looking geometry: 1000px of content in a 100px window; every write to scrollTop is recorded. */
function geometry() {
  const el = screen.getByTestId('message-scroller');
  let top = 900;
  const writes: number[] = [];
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { writes.push(v); top = v; } });
  return { writes, scrollUp: () => { top = 0; fireEvent.scroll(el); } };
}

const scrolled = vi.fn();
const stable = [row('m1', 1), row('m2', 2)];
beforeEach(() => {
  toastFn.mockClear();
  scrolled.mockClear();
  Element.prototype.scrollIntoView = function (this: Element) { scrolled(this.getAttribute('data-msg')); } as typeof Element.prototype.scrollIntoView;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('P1631 UAT: the jump to a just-published card', () => {
  it('publish, then the card arrives (the reveal re-read): the list jumps to it, with no paging back and no error', async () => {
    notePublishedCard('card-1');
    const ensureLoaded = vi.fn(async () => false);
    const view = render(list(conv(stable, ensureLoaded), 'card-1'));
    expect(scrolled).not.toHaveBeenCalled();
    view.rerender(list(conv([...stable, row('card-1', 3)], ensureLoaded), 'card-1'));
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith('card-1'));
    expect(ensureLoaded).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('publish while the card is not yet delivered: no "isn\'t loaded" error, and no paging back for it', async () => {
    notePublishedCard('card-2');
    const ensureLoaded = vi.fn(async () => false);
    render(list(conv(stable, ensureLoaded), 'card-2'));
    await new Promise((r) => setTimeout(r, 50));
    expect(toastFn).not.toHaveBeenCalled();
    expect(ensureLoaded).not.toHaveBeenCalled();
  });

  it('A(ii): while it waits, other messages arriving never pull a reader who scrolled up back down, and the card does not yank them either', async () => {
    notePublishedCard('card-3');
    const view = render(list(conv(stable), null));
    const g = geometry();
    view.rerender(list(conv(stable), 'card-3')); // the reveal's address: the wait starts with ONE trip to the bottom
    expect(g.writes).toEqual([1000]);
    g.scrollUp();
    g.writes.length = 0;
    view.rerender(list(conv([...stable, row('other-1', 3, 'user-id-5678')]), 'card-3'));
    view.rerender(list(conv([...stable, row('other-1', 3, 'user-id-5678'), row('other-2', 4, 'user-id-5678')]), 'card-3'));
    view.rerender(list(conv([...stable, row('other-1', 3, 'user-id-5678'), row('other-2', 4, 'user-id-5678'), row('card-3', 5, 'user-id-5678')]), 'card-3'));
    await new Promise((r) => setTimeout(r, 20));
    expect(g.writes).toEqual([]);
    expect(scrolled).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('B: a card that never arrives stops the wait after PUBLISHED_WAIT_MS: no error, and a late arrival is not jumped to', async () => {
    vi.useFakeTimers();
    notePublishedCard('card-4');
    const view = render(list(conv(stable), 'card-4'));
    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLISHED_WAIT_MS + 10); });
    view.rerender(list(conv([...stable, row('card-4', 3)]), 'card-4'));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(scrolled).not.toHaveBeenCalled();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('B: leaving the address ends the wait: the card arriving afterwards is not jumped to', async () => {
    notePublishedCard('card-5');
    const view = render(list(conv(stable), 'card-5'));
    view.rerender(list(conv(stable), null));
    view.rerender(list(conv([...stable, row('card-5', 3)]), null));
    await new Promise((r) => setTimeout(r, 20));
    expect(scrolled).not.toHaveBeenCalled();
  });

  it('B: a note is claimed by one list only, and a note nobody claims expires', () => {
    vi.useFakeTimers();
    notePublishedCard('card-6');
    expect(claimPublishedCard('card-6')).toBe(true);
    expect(claimPublishedCard('card-6')).toBe(false); // a second list opening on the same id is an ordinary jump
    notePublishedCard('card-7');
    vi.advanceTimersByTime(PUBLISHED_WAIT_MS + 1);
    expect(claimPublishedCard('card-7')).toBe(false);
    expect(claimPublishedCard('never-noted')).toBe(false);
  });

  it('A(ii), Codex shape: an edit to a message already shown, while it waits and the reader is scrolled up, does not move the reader', async () => {
    notePublishedCard('card-10');
    const view = render(list(conv(stable), null));
    const g = geometry();
    view.rerender(list(conv(stable), 'card-10'));
    g.scrollUp();
    g.writes.length = 0;
    view.rerender(list(conv([stable[0] as ChatMessage, { ...(stable[1] as ChatMessage), body: 'm2 edited', editedAt: new Date(Date.UTC(2026, 0, 1, 11)).toISOString() }]), 'card-10'));
    await new Promise((r) => setTimeout(r, 20));
    expect(g.writes).toEqual([]);
  });

  it('B, Codex shape: a list that unmounts while waiting leaves nothing behind; the next list on the same address jumps the ordinary way (paging allowed)', async () => {
    notePublishedCard('card-11');
    const ensureLoaded = vi.fn(async () => false);
    const first = render(list(conv(stable, ensureLoaded), 'card-11'));
    first.unmount();
    render(list(conv(stable, ensureLoaded), 'card-11'));
    await waitFor(() => expect(ensureLoaded).toHaveBeenCalledWith('card-11'));
  });

  describe('G: only a card this publish made is waited for', () => {
    let reveal: ReturnType<typeof useRevealPublished> = () => undefined;
    function Probe() { reveal = useRevealPublished(); return null; }
    const mountReveal = () => render(<MemoryRouter initialEntries={['/chats/c/conv-id-1234?clarify=root-id-1']}><Probe /></MemoryRouter>);

    it('a new card ("published") is noted for the list to wait on', () => {
      mountReveal();
      act(() => reveal({ status: 'published', messageId: 'card-8', conversationId: 'conv-id-1234', threadRootId: null }));
      expect(claimPublishedCard('card-8')).toBe(true);
    });

    it('an existing card ("already") is not noted: the list pages back for it as for any jump', async () => {
      mountReveal();
      act(() => reveal({ status: 'already', messageId: 'card-9', conversationId: 'conv-id-1234', threadRootId: null }));
      cleanup();
      const ensureLoaded = vi.fn(async () => true);
      render(list(conv(stable, ensureLoaded), 'card-9'));
      await waitFor(() => expect(ensureLoaded).toHaveBeenCalledWith('card-9'));
    });
  });

  it('CONTROL: a search jump to an older message still pages back and lands on it', async () => {
    let messages = [row('m3', 3), row('m4', 4)];
    const ensureLoaded = vi.fn(async (id: string) => { messages = [row('old-1', 1), ...messages]; return id === 'old-1'; });
    const view = render(list(conv(messages, ensureLoaded), 'old-1'));
    await waitFor(() => expect(ensureLoaded).toHaveBeenCalledWith('old-1'));
    view.rerender(list(conv(messages, ensureLoaded), 'old-1'));
    await waitFor(() => expect(scrolled).toHaveBeenCalledWith('old-1'));
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('A(i) CONTROL: a failed search jump is reported once and not retried as new messages arrive (as at HEAD)', async () => {
    const ensureLoaded = vi.fn(async () => false);
    const view = render(list(conv([row('m1', 1)], ensureLoaded), 'no-such-message'));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(MISSING));
    view.rerender(list(conv([row('m1', 1), row('m2', 2, 'user-id-5678')], ensureLoaded), 'no-such-message'));
    view.rerender(list(conv([row('m1', 1), row('m2', 2, 'user-id-5678'), row('m3', 3, 'user-id-5678')], ensureLoaded), 'no-such-message'));
    await new Promise((r) => setTimeout(r, 20));
    expect(ensureLoaded).toHaveBeenCalledTimes(1);
    expect(toastFn).toHaveBeenCalledTimes(1);
  });
});
