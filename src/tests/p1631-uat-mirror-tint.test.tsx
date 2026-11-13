/**
 * P1631 UAT, AC 137: "Phone and below 1280 px: full screen with Back, tinted, 'Your Mirror · Only you see this'". Every container of the Mirror's
 * Clarify thread was bg-background, so on a phone it read as the chat it came from. Below 1280px it now wears the prototype's tint (blue-50, a
 * design-system tint), on the panel and on the message list (which paints its own background); from 1280px (xl) both go back to the page background.
 * jsdom does not evaluate media queries, so the classes are the observable here; a browser check covers the paint.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';

const st = vi.hoisted(() => ({ messages: [] as unknown[], status: 'ready' as string }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() }, from: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'user-id-1234' } }, user: { id: 'user-id-1234' }, sessionChecked: true }) }));
vi.mock('@/app/data/clarify-service', async () => ({
  ...(await vi.importActual<object>('@/app/data/clarify-service')),
  getClarifyThread: vi.fn(async () => []),
}));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: st.messages, messages: st.messages, status: st.status, send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageRow', () => ({ MessageRow: ({ msg }: { msg: ChatMessage }) => <li data-msg={msg.id}>{msg.body ?? 'card'}</li> }));

import { ThreadPanel } from '@/app/pages/chat/ThreadPanel';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const ME = 'user-id-1234';
const mirror = { conversationId: 'conv-mirror', kind: 'mirror', title: 'Test Mirror', canSend: true, other: null, org: null, event: null } as unknown as ChatSummary;
const group = { ...mirror, conversationId: 'conv-group', kind: 'group', title: 'Test Group' } as unknown as ChatSummary;
const root = (over: Partial<ChatMessage>) => ({
  id: 'root-id-1', conversationId: 'conv-mirror', authorId: ME, body: 'a copy', createdAt: '2026-01-01T10:00:00Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'clarify', attachmentKind: null,
  attachmentId: null, clientId: null, contextConversationId: null, ...over,
}) as unknown as ChatMessage;
const ctx = {
  userId: ME, chats: [mirror, group], subscribe: () => () => undefined, authors: { [ME]: { id: ME, name: 'Test Owner', slug: 'test-owner' } }, missingAuthors: new Set(),
  ensureAuthors: vi.fn(), outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), resync: vi.fn(), revision: 0, setViewing: vi.fn(), markRead: vi.fn(),
} as unknown as ChatContextValue;
type PanelProps = Partial<Parameters<typeof ThreadPanel>[0]>;
const mount = (summary: ChatSummary, clarifyPanel = false, extra: PanelProps = {}) => render(
  <MemoryRouter><ChatContext.Provider value={ctx}><ThreadPanel summary={summary} rootId="root-id-1" highlightId={null} onClose={() => undefined} clarifyPanel={clarifyPanel} {...extra} /></ChatContext.Provider></MemoryRouter>,
);
// item 11: the tint is the panel's own classes, given to the message list as its own prop (no selector on another component's test id)
const TINT = ['bg-blue-50', 'xl:bg-background'];

describe('P1631 UAT: the Mirror is tinted below 1280px (AC 137)', () => {
  afterEach(() => { cleanup(); st.status = 'ready'; });

  it('a Clarify thread is tinted on the panel and its message list below 1280px, and untinted from 1280px', async () => {
    st.messages = [root({})];
    mount(mirror);
    expect(await screen.findByText('Your Mirror')).toBeTruthy();
    const panel = screen.getByTestId('thread-panel');
    for (const c of TINT) expect(panel.classList.contains(c), c).toBe(true);
    const list = screen.getByTestId('message-scroller');
    for (const c of TINT) expect(list.classList.contains(c), `list ${c}`).toBe(true);
    expect(list.classList.contains('bg-background')).toBe(false); // merged, not stacked: the tint replaces the page background below 1280px
  });

  it('CONTROL: an ordinary thread of a group is not tinted', () => {
    st.messages = [root({ conversationId: 'conv-group', kind: 'message' })];
    mount(group);
    const panel = screen.getByTestId('thread-panel');
    expect(panel.classList.contains('bg-blue-50')).toBe(false);
    expect(panel.classList.contains('bg-background')).toBe(true);
    expect(screen.getByTestId('message-scroller').classList.contains('bg-blue-50')).toBe(false);
  });
});

/**
 * AC 137, follow-up: below 1280px the Clarify panel is full screen with Back at EVERY width, not only below 1024px (it was a 400px side panel
 * from 1024px). Only the Clarify panel changes: an ordinary thread keeps its side panel from 1024px with × there.
 */
describe('P1631 UAT: the Clarify panel is full screen with Back below 1280px (AC 137)', () => {
  afterEach(cleanup);
  const classesOf = (el: Element | null) => Array.from(el?.classList ?? []);

  it('the Clarify panel is a side panel only from 1280px, with Back below 1280px and × from 1280px', async () => {
    st.messages = [root({})];
    mount(mirror, true);
    await screen.findByText('Your Mirror');
    const panel = screen.getByTestId('thread-panel');
    expect(classesOf(panel)).toEqual(expect.arrayContaining(['xl:w-[440px]', 'xl:flex-none', 'xl:border-l']));
    expect(classesOf(panel).filter((c) => c.startsWith('lg:'))).toEqual([]);
    expect(classesOf(screen.getByRole('button', { name: 'Back to the conversation' }))).toContain('xl:hidden');
    expect(classesOf(screen.getByRole('button', { name: 'Close thread' }))).toEqual(expect.arrayContaining(['hidden', 'xl:flex']));
    expect(classesOf(screen.getByRole('button', { name: 'Close thread' }))).not.toContain('lg:flex');
  });

  it('CONTROL: an ordinary thread is unchanged (side panel, Back hidden and × shown from 1024px)', () => {
    st.messages = [root({ conversationId: 'conv-group', kind: 'message' })];
    mount(group);
    const panel = screen.getByTestId('thread-panel');
    expect(classesOf(panel)).toEqual(expect.arrayContaining(['lg:w-[400px]', 'lg:flex-none', 'lg:border-l', 'xl:w-[440px]']));
    expect(classesOf(screen.getByRole('button', { name: 'Back to the conversation' }))).toContain('lg:hidden');
    expect(classesOf(screen.getByRole('button', { name: 'Close thread' }))).toEqual(expect.arrayContaining(['hidden', 'lg:flex']));
  });
});

describe('P1631 UAT review: the real panel and header', () => {
  afterEach(() => { cleanup(); st.status = 'ready'; });
  const classesOf = (el: Element | null) => Array.from(el?.classList ?? []);

  it('item 12 / item 8: a left thread shows the real "← Chat" control (the design-system button, named "Back to chat") and no Back or ×', () => {
    st.messages = [root({ conversationId: 'conv-group', kind: 'message' })];
    const onBackToChat = vi.fn();
    mount(group, false, { onBackToChat });
    const toChat = screen.getByRole('button', { name: 'Back to chat' });
    expect(toChat.textContent).toBe('Chat');
    expect(toChat.querySelector('svg')).not.toBeNull(); // the ← arrow
    expect(screen.queryByRole('button', { name: 'Back to the conversation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close thread' })).toBeNull();
    fireEvent.click(toChat);
    expect(onBackToChat).toHaveBeenCalledTimes(1);
    const panel = screen.getByTestId('thread-panel'); // it fills the left area: no side-panel width
    expect(classesOf(panel).filter((c) => /w-\[|border-l/.test(c))).toEqual([]);
  });

  it('item 3: an unavailable left thread calls onClose (which leaves the address on the chat), not "← Chat"', () => {
    st.messages = [];
    st.status = 'unavailable';
    const onClose = vi.fn();
    const onBackToChat = vi.fn();
    mount(group, false, { onClose, onBackToChat });
    expect(onClose).toHaveBeenCalled();
    expect(onBackToChat).not.toHaveBeenCalled();
  });

  it('item 7: a Clarify thread of the Mirror chat itself (no clarifyPanel) is full screen with Back below 1280px and says it is a Clarify thread', async () => {
    st.messages = [root({})];
    const onClarifyThread = vi.fn();
    mount(mirror, false, { onClarifyThread });
    await screen.findByText('Your Mirror');
    expect(onClarifyThread).toHaveBeenLastCalledWith(true);
    const panel = screen.getByTestId('thread-panel');
    expect(classesOf(panel)).toEqual(expect.arrayContaining(['xl:w-[440px]', 'xl:flex-none', 'xl:border-l']));
    expect(classesOf(panel).filter((c) => c.startsWith('lg:'))).toEqual([]);
    expect(classesOf(screen.getByRole('button', { name: 'Back to the conversation' }))).toContain('xl:hidden');
  });

  it('item 5: the Mirror own typing box takes focus on mount (with a fine pointer); with focusable off it does not', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(pointer: fine)' })) as typeof window.matchMedia;
    onTestFinished(() => { window.matchMedia = real; });
    st.messages = [root({})];
    const first = mount(mirror, true);
    await screen.findByText('Your Mirror');
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Tell the Mirror what to change' })));
    first.unmount();
    mount(mirror, true, { focusable: false });
    await screen.findByText('Your Mirror');
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Tell the Mirror what to change' }));
  });

  it('round 2 item 3: while the root is being read the panel reports "not known yet" (null), never "not a Clarify thread"', () => {
    st.messages = [];
    st.status = 'loading';
    const onClarifyThread = vi.fn();
    mount(mirror, false, { onClarifyThread });
    expect(onClarifyThread).toHaveBeenCalledWith(null);
    expect(onClarifyThread).not.toHaveBeenCalledWith(false);
  });

  it('round 3 C: while a Mirror-chat thread root is being read the panel is laid out full screen below 1280px (as a Clarify thread)', () => {
    st.messages = [];
    st.status = 'loading';
    mount(mirror);
    const panel = screen.getByTestId('thread-panel');
    expect(classesOf(panel)).toEqual(expect.arrayContaining(['xl:w-[440px]', 'xl:flex-none']));
    expect(classesOf(panel).filter((c) => c.startsWith('lg:'))).toEqual([]);
  });

  it('round 3 C CONTROL: a loading thread of any other chat keeps its side panel from 1024px', () => {
    st.messages = [];
    st.status = 'loading';
    mount(group);
    expect(classesOf(screen.getByTestId('thread-panel'))).toContain('lg:w-[400px]');
  });

  it('round 3 F: a root that failed to load is known (not a Clarify thread): the panel reports false and keeps the side layout', () => {
    st.messages = [];
    st.status = 'error';
    const onClarifyThread = vi.fn();
    mount(mirror, false, { onClarifyThread });
    expect(onClarifyThread).toHaveBeenLastCalledWith(false);
    expect(classesOf(screen.getByTestId('thread-panel'))).toContain('lg:w-[400px]');
  });

  it('Gemini: below 1280px the whole Mirror surface wears the panel tint: the header and the composer band paint no background of their own', async () => {
    st.messages = [root({})];
    mount(mirror, true);
    await screen.findByText('Your Mirror');
    const panel = screen.getByTestId('thread-panel');
    const header = panel.querySelector('header');
    const composer = screen.getByTestId('composer');
    for (const el of [header, composer]) expect(classesOf(el).filter((c) => /^(\w+:)*bg-/.test(c)), el?.tagName).toEqual([]);
    expect(panel.contains(composer)).toBe(true);
  });

  it('item 7 CONTROL: an ordinary thread says it is not a Clarify thread and keeps its side panel from 1024px', () => {
    st.messages = [root({ conversationId: 'conv-group', kind: 'message' })];
    const onClarifyThread = vi.fn();
    mount(group, false, { onClarifyThread });
    expect(onClarifyThread).toHaveBeenLastCalledWith(false);
    expect(classesOf(screen.getByTestId('thread-panel'))).toContain('lg:w-[400px]');
  });
});
