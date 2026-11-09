/**
 * P1652 review fixes, UI items: reactions on a transcript row (10), a link edited into a message loads its card (11), the toolbar
 * breakpoint (12), who-reacted through MobileTooltip with no swallowed next tap, and the picker's keyboard, focus return and scroll (13).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { mapMessageRow, type ChatMessageRow } from '@/app/data/chat-mappers';

const h = vi.hoisted(() => ({ cardRead: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/pages/chat/link-card-cache', () => ({ loadLinkCard: h.cardRead, clearLinkCardCache: vi.fn() }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="feed-point" /> }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: () => <div data-testid="feed-story" /> }));
vi.mock('@/app/data/chat-reactions-service', () => ({
  REACTION_EMOJI: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
  listReactions: async (ids: string[]) => (ids.includes('root-1') ? [{ id: 'r1', messageId: 'root-1', profileId: 'user-id-other', emoji: '👍' }] : []),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  subscribeToReactions: () => () => undefined,
}));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';
import { ChatLinkCard } from '@/app/pages/chat/ChatLinkCard';
import { MessageReactions } from '@/app/pages/chat/MessageReactions';
import { NARROW_QUERY } from '@/app/pages/chat/chat-hooks';
import type { MessageReactionsState } from '@/app/pages/chat/use-message-reactions';

const ME = 'user-id-me';
const OTHER = 'user-id-other';
const START = '2026-11-05T12:37:00Z';
const rootRow: ChatMessageRow = {
  id: 'root-1', conversation_id: 'c1', author_id: null, body: `session|${START}|1`, created_at: START, edited_at: null, deleted_at: null,
  reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds',
};
const chatValue = { userId: ME, status: 'ready', chats: [], authors: { [OTHER]: { id: OTHER, name: 'Anna Example', slug: 'anna' } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined } as unknown as ChatContextValue;
const actions: MessageActions = {
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
};

describe('item 10: reactions on a transcript row', () => {
  it('a transcript row shows its reaction pills (React is not a dead control)', async () => {
    render(
      <MemoryRouter>
        <ChatContext.Provider value={chatValue}>
          <MirrorContext.Provider value={null}>
            <ul><MessageRow msg={mapMessageRow(rootRow)} mine={false} viewerId={ME} author={undefined} authors={chatValue.authors} compact={false} highlight={false} actions={actions} /></ul>
          </MirrorContext.Provider>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('transcript-open')).toBeTruthy(); // control: it IS the transcript branch
    const pill = await screen.findByTestId('reaction-pill');
    expect(pill.textContent).toBe('👍1');
  });
});

class NearObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() { this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
}

describe('item 11: a link edited into a message loads its card', () => {
  const original = globalThis.IntersectionObserver;
  beforeEach(() => { h.cardRead.mockReset(); vi.stubGlobal('IntersectionObserver', NearObserver); });
  afterEach(() => vi.stubGlobal('IntersectionObserver', original));
  const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('plain text edited into a story link reads the card; control: plain text reads nothing', async () => {
    h.cardRead.mockResolvedValue({ kind: 'point', item: { point: {} } });
    const ui = (b: string) => <MemoryRouter><ChatLinkCard body={b} viewerId="v" /></MemoryRouter>;
    const { rerender } = render(ui('just words'));
    await act(async () => undefined);
    expect(h.cardRead).not.toHaveBeenCalled();
    rerender(ui(`now https://claritypledge.com/point/${ID}`));
    await act(async () => undefined);
    expect(h.cardRead).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('feed-point')).toBeTruthy();
  });
});

describe('item 12: the toolbar moves Forward into More wherever the row does not fit', () => {
  it('the breakpoint covers 375 and 360 (computed need of about 307px against 78px of row chrome)', () => {
    expect(NARROW_QUERY).toBe('(max-width: 399px)');
    const need = 5 * 40 + 91 + 16; // five icon buttons (Forward among them), Clarify with its word, gaps/padding/border: 307
    const available = (viewport: number) => viewport - 16 - 16 - 36 - 10; // row margin, padding, avatar, gap
    expect(available(400)).toBeGreaterThanOrEqual(need); // at the breakpoint the full toolbar fits
    expect(available(384)).toBeLessThan(need); // control: just below the computed width it does not, so 400 is not arbitrary
  });
});

const rx = (over: Partial<MessageReactionsState> = {}): MessageReactionsState => ({
  enabled: true, messageId: 'm1', viewerId: 'me', pickerAt: null, openPicker: vi.fn(), closePicker: vi.fn(), toggle: vi.fn(),
  reactions: [
    { id: '1', messageId: 'm1', profileId: 'me', emoji: '👍' },
    { id: '2', messageId: 'm1', profileId: 'p2', emoji: '👍' },
  ],
  ...over,
});
const authors = { p2: { id: 'p2', name: 'Ada', slug: null, avatarUrl: null, avatarColor: null, hasPledged: false } };

describe('item 13: who reacted, through MobileTooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('a long press shows the names; a long press with NO click after it does not swallow the next real tap', () => {
    const state = rx();
    render(<MessageReactions rx={state} authors={authors} />);
    const pill = screen.getAllByTestId('reaction-pill')[0]!;
    fireEvent.pointerDown(pill, { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getAllByRole('tooltip')[0]!.textContent).toContain('You, Ada');
    fireEvent.pointerUp(pill, { pointerType: 'touch' }); // many touch browsers fire no click after a long press
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.pointerDown(pill, { pointerType: 'touch' });
    fireEvent.pointerUp(pill, { pointerType: 'touch' });
    fireEvent.click(pill);
    expect(state.toggle).toHaveBeenCalledWith('👍');
  });
  it('a long press that ends with a click does not toggle; control: the next plain tap does', () => {
    const state = rx();
    render(<MessageReactions rx={state} authors={authors} />);
    const pill = screen.getAllByTestId('reaction-pill')[0]!;
    fireEvent.pointerDown(pill, { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(pill, { pointerType: 'touch' });
    fireEvent.click(pill);
    expect(state.toggle).not.toHaveBeenCalled();
    fireEvent.pointerDown(pill, { pointerType: 'touch' });
    fireEvent.pointerUp(pill, { pointerType: 'touch' });
    fireEvent.click(pill);
    expect(state.toggle).toHaveBeenCalledTimes(1);
  });
});

describe('item 13: the picker', () => {
  beforeEach(() => vi.useRealTimers());
  const open = (extra: Partial<MessageReactionsState> = {}) => {
    const state = rx({ pickerAt: { x: 10, y: 10 }, ...extra });
    render(<MessageReactions rx={state} authors={authors} />);
    return state;
  };
  it('the first emoji takes focus; arrows, Home and End move; Escape closes', () => {
    const state = open();
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowRight' }); // wraps
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(state.closePicker).toHaveBeenCalled();
  });
  it('focus returns to the opener on close, and to the message when the opener is gone', () => {
    function Host() {
      const [at, setAt] = useState<{ x: number; y: number } | null>(null);
      const [gone, setGone] = useState(false);
      return (
        <li data-msg="m1">
          <button data-testid="inline">in the row</button>
          {!gone && <button data-testid="opener" onClick={() => setAt({ x: 5, y: 5 })}>react</button>}
          <button data-testid="drop" onClick={() => setGone(true)}>drop</button>
          <MessageReactions rx={rx({ pickerAt: at, closePicker: () => setAt(null) })} authors={authors} />
          <button data-testid="close" onClick={() => setAt(null)}>close</button>
        </li>
      );
    }
    render(<Host />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByTestId('close'));
    expect(document.activeElement).toBe(opener);
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('drop')); // the opener unmounts while the picker is open
    fireEvent.click(screen.getByTestId('close'));
    expect(document.activeElement?.closest('[data-msg="m1"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });
  it('a scroll closes the picker', () => {
    const state = open();
    fireEvent.scroll(window);
    expect(state.closePicker).toHaveBeenCalled();
  });
  it('control: no scroll, nothing closes', () => {
    const state = open();
    expect(state.closePicker).not.toHaveBeenCalled();
  });
});
