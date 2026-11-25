/**
 * P1631 entries: Clarify on a chat-list row (menu, long press), the Mirror root card of a whole-chat Clarify, and New point in an ordinary chat's composer.
 * The database is mocked at the rpc boundary, so the call names and arguments are asserted as the server sees them.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import { mapForwardSnapshot } from '@/app/data/chat-mappers';

const ME = 'user-id-me';
const rpc = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());
const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
const state = vi.hoisted(() => ({ messages: [] as unknown[] }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: toastFn }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: ME, name: 'Ada', email: 'ada@example.com' }, sessionChecked: true }) }));
vi.mock('@/app/data/chat-live-transcription', () => ({ getChatLiveTranscription: async () => null, hasTranscribedInChat: async () => false }));
vi.mock('@/app/data/room-transcription-state', () => ({ getChatTranscriptionProcessing: async () => [], getMyRoomStates: async () => new Map() }));
vi.mock('@/app/pages/chat/clarify-run', async () => ({ ...(await vi.importActual<object>('@/app/pages/chat/clarify-run')), runClarifyDraft: run }));
vi.mock('@/app/pages/chat/use-message-actions', () => ({ useMessageActions: () => ({ actions: {}, dialogs: null }) }));
vi.mock('@/app/pages/chat/use-conversation', () => ({
  isLocal: () => false,
  useConversationMessages: () => ({
    server: state.messages, messages: state.messages, status: 'ready', send: vi.fn(), stats: new Map(), hasMore: false, loadingEarlier: false,
    loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  }),
}));
vi.mock('@/app/pages/chat/MessageList', async () => ({ ...(await vi.importActual<object>('@/app/pages/chat/MessageList')), MessageList: () => null }));

import { ChatList } from '@/app/pages/chat/ChatList';
import { ConversationPane } from '@/app/pages/chat/ConversationPane';
import { ForwardedBody } from '@/app/pages/chat/MessageParts';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { useClarifyParts } from '@/app/pages/chat/use-clarify-parts';
import { resetClarifyAvailability, seedClarifyAvailability } from '@/app/pages/chat/use-clarify-availability';
import { buildMenuItems } from '@/app/pages/chat/message-menu-items';
import { withClarifyPanel } from '@/app/pages/chat/clarify-panel';
import { LONG_PRESS_MS } from '@/app/pages/chat/MessageRow';
import { CLARIFY_BUSY_TOAST, CLARIFY_NO_DRAFT_HINT, CLARIFY_NOTHING_YET_TOAST } from '@/app/pages/chat/clarify-copy';

const summary = (over: Partial<ChatSummary>): ChatSummary => ({
  conversationId: 'conv-1', kind: 'dm', title: 'Example Person', other: { id: 'user-id-other', name: 'Example Person', slug: 'example-person', avatarUrl: null, avatarColor: null, hasPledged: false },
  org: null, event: null, ownerFirstName: 'Ana', lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false, ...over,
} as ChatSummary);
const lastMessage = { id: 'm1', body: 'hello', authorId: 'user-id-other', authorName: 'Example Person', createdAt: '2026-11-01T08:00:00.000Z', isDeleted: false, kind: 'message' } as unknown as ChatSummary['lastMessage'];
const DM = summary({ conversationId: 'conv-dm', lastMessage });
const GROUP = summary({ conversationId: 'conv-group', kind: 'group', title: 'Example Group', other: null, lastMessage } as Partial<ChatSummary>);
const EVENT = summary({ conversationId: 'conv-event', kind: 'event', title: 'Example Event', other: null, lastMessage } as Partial<ChatSummary>);
const MIRROR = summary({ conversationId: 'conv-mirror', kind: 'mirror', title: 'Mira', other: null, lastMessage } as Partial<ChatSummary>);

function chatValue(chats: ChatSummary[]): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats, unreadCount: 0, refresh: vi.fn(async () => chats), setArchived: vi.fn(), setManualUnread: vi.fn(),
    markRead: vi.fn(), subscribe: () => () => undefined, setViewing: vi.fn(), revision: 0, authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(),
    outbox: [], sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(), resync: vi.fn(),
  } as ChatContextValue;
}
function Where() {
  const l = useLocation();
  return <output data-testid="path">{l.pathname}{l.search}</output>;
}
async function mount(ui: ReactNode, chats: ChatSummary[], path = '/chats') {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <ChatContext.Provider value={chatValue(chats)}>
        <Routes><Route path="*" element={ui} /></Routes>
        <Where />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}
const rowOf = (id: string) => document.querySelector(`[data-chat="${id}"] button`) as HTMLElement;
const started = (over: Record<string, unknown> = {}) => ({ data: { status: 'started', draft_id: 'draft-1', thread_root_id: 'root-1', mirror_conversation_id: 'conv-mirror', ...over }, error: null });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  state.messages = [];
  resetClarifyAvailability();
  seedClarifyAvailability(true); // the server said drafting is on; the availability describe below turns it off
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Clarify on a chat-list row', () => {
  it.each([[DM], [GROUP], [EVENT]])('the row menu of a %# chat starts with Clarify', async (chat) => {
    await mount(<ChatList activeId={null} />, [chat, MIRROR]);
    fireEvent.contextMenu(rowOf(chat.conversationId));
    expect(await screen.findByTestId('row-clarify')).toHaveTextContent('Clarify');
  });

  it('a Mirror row has Clarify too (P1722)', async () => {
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    fireEvent.contextMenu(rowOf(MIRROR.conversationId));
    await screen.findByRole('menuitem', { name: /Archive|Mark as/ });
    expect(await screen.findByTestId('row-clarify')).toHaveTextContent('Clarify');
  });

  it('selecting it calls clarify_start_chat, opens the Mirror beside THAT chat and starts the run', async () => {
    rpc.mockResolvedValueOnce(started());
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    fireEvent.contextMenu(rowOf('conv-dm'));
    fireEvent.click(await screen.findByTestId('row-clarify'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/chats/c/conv-dm?clarify=root-1'));
    expect(rpc).toHaveBeenCalledWith('clarify_start_chat', { p_conversation: 'conv-dm', p_draft: true });
    await waitFor(() => expect(run).toHaveBeenCalledWith('draft-1'));
  });

  it("'empty' shows the toast and goes nowhere", async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'empty' }, error: null });
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    fireEvent.contextMenu(rowOf('conv-dm'));
    fireEvent.click(await screen.findByTestId('row-clarify'));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(CLARIFY_NOTHING_YET_TOAST));
    expect(screen.getByTestId('path').textContent).toBe('/chats');
    expect(run).not.toHaveBeenCalled();
  });

  it('a long press opens the menu and does not open the chat; a short tap still does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    const row = rowOf('conv-dm');
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] });
    await act(async () => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.touchEnd(row);
    fireEvent.click(row);
    expect(await screen.findByTestId('row-clarify')).toBeInTheDocument();
    expect(screen.getByTestId('path').textContent).toBe('/chats');
    // CONTROL: a tap that is not held (and a press that drifted) opens the chat and no menu
    cleanup();
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    const again = rowOf('conv-dm');
    fireEvent.touchStart(again, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchMove(again, { touches: [{ clientX: 60, clientY: 10 }] });
    await act(async () => { vi.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.touchEnd(again);
    fireEvent.click(again);
    expect(screen.queryByTestId('row-clarify')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/chats/c/conv-dm'));
  });
});

describe('review fixes', () => {
  const msg = { id: 'm1', body: 'hello', kind: 'message', isDeleted: false, threadRootId: null, createdAt: '2026-11-01T08:00:00.000Z' };
  const pane = <ConversationPane conversationId="conv-dm" highlightId={null} paneVisible />;
  const pressPlus = async () => {
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByTestId('plus-new-point'));
  };

  it('a hold of 1.5 s that opened the menu does not open the chat when the finger lifts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    const row = rowOf('conv-dm');
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] });
    await act(async () => { vi.advanceTimersByTime(1500); });
    fireEvent.touchEnd(row);
    fireEvent.click(row);
    expect(await screen.findByTestId('row-clarify')).toBeInTheDocument();
    expect(screen.getByTestId('path').textContent).toBe('/chats');
    // CONTROL: the next ordinary tap is not swallowed by the earlier press
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(row);
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/chats/c/conv-dm'));
  });

  it('opening the Mirror panel drops the points panel parameter and keeps the others', () => {
    const search = withClarifyPanel('?points=1&m=msg-1', 'root-1');
    const p = new URLSearchParams(search);
    expect(p.has('points')).toBe(false);
    expect(p.get('clarify')).toBe('root-1');
    expect(p.get('m')).toBe('msg-1');
  });

  it('New point pressed from ?points=1 leaves no points parameter', async () => {
    state.messages = [msg];
    rpc.mockImplementation(async (name: string) => (name === 'clarify_start_chat' ? started({ draft_id: null }) : { data: null, error: null }));
    await mount(pane, [DM, MIRROR], '/chats/c/conv-dm?points=1');
    await pressPlus();
    await waitFor(() => expect(screen.getByTestId('path').textContent).toContain('clarify=root-1'));
    expect(screen.getByTestId('path').textContent).not.toContain('points');
  });

  it('busy is said, from the row and from New point, and nothing opens', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'clarify_start_chat' ? { data: { status: 'busy' }, error: null } : { data: null, error: null }));
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    fireEvent.contextMenu(rowOf('conv-dm'));
    fireEvent.click(await screen.findByTestId('row-clarify'));
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(CLARIFY_BUSY_TOAST));
    expect(screen.getByTestId('path').textContent).toBe('/chats');
    cleanup();
    toastFn.mockClear();
    state.messages = [msg];
    await mount(pane, [DM, MIRROR], '/chats/c/conv-dm');
    await pressPlus();
    await waitFor(() => expect(toastFn).toHaveBeenCalledWith(CLARIFY_BUSY_TOAST));
    expect(screen.getByTestId('path').textContent).toBe('/chats/c/conv-dm');
  });

  it.each([
    ['a system post only', { ...msg, systemKind: 'round_thread' }],
    ['a thread reply only', { ...msg, threadRootId: 'root-x' }],
    ['a deleted message only', { ...msg, isDeleted: true }],
    ['a private ask row only', { ...msg, contextConversationId: 'conv-other' }],
    ['a transcribed line only', { ...msg, isTranscription: true }], // 20261112240000: the server never anchors on one
  ])('no New point + when the chat holds %s (control: a plain message gets it)', async (_name, only) => {
    state.messages = [only];
    await mount(pane, [DM, MIRROR], '/chats/c/conv-dm');
    await screen.findByTestId('conversation');
    expect(screen.queryByTestId('composer-plus')).toBeNull();
    cleanup();
    state.messages = [only, msg];
    await mount(pane, [DM, MIRROR], '/chats/c/conv-dm');
    expect(await screen.findByTestId('composer-plus')).toBeInTheDocument();
  });
});

describe('the Mirror root card of a whole-chat Clarify', () => {
  const root = (snap: Record<string, unknown>) => ({ kind: 'clarify', forwardSnapshot: mapForwardSnapshot(snap), attachmentKind: null, forwardedFromMessageId: 'm9', forwardAuthorId: null }) as unknown as ChatMessage;
  const base = { scope: 'chat', created_at: '2026-11-01T08:00:00.000Z' };

  it('a DM reads "Chat with {name}" under the Clarify kicker: no body, no author line, no thread', async () => {
    await mount(<ForwardedBody msg={root({ ...base, new_point: false, conversation_kind: 'dm', conversation_title: 'Anna Example' })} viewerId={ME} />, [MIRROR]);
    expect(screen.getByTestId('clarify-chat-kicker')).toHaveTextContent('Clarify');
    expect(screen.getByTestId('clarify-chat-title')).toHaveTextContent('Chat with Anna Example');
    expect(screen.queryByTestId('clarified-author')).toBeNull();
    expect(screen.queryByTestId('forwarded-thread')).toBeNull();
    expect(screen.queryByTestId('clarified-card')).toBeNull();
  });

  it('a group shows its title alone, and New point is the kicker when new_point is true', async () => {
    await mount(<ForwardedBody msg={root({ ...base, new_point: true, conversation_kind: 'group', conversation_title: 'Example Org · General' })} viewerId={ME} />, [MIRROR]);
    expect(screen.getByTestId('clarify-chat-kicker')).toHaveTextContent('New point');
    expect(screen.getByTestId('clarify-chat-title').textContent).toBe('Example Org · General');
  });

  it('a message-scope copy still renders as the quoted card (control)', async () => {
    await mount(<ForwardedBody msg={root({ author_name: 'Anna Example', body: 'a quoted line', created_at: base.created_at, conversation_kind: 'dm', conversation_title: 'Anna Example' })} viewerId={ME} />, [MIRROR]);
    expect(screen.getByTestId('clarified-card')).toHaveTextContent('a quoted line');
    expect(screen.queryByTestId('clarify-chat-card')).toBeNull();
  });
});

describe('New point in the composer', () => {
  const pane = (c: ChatSummary) => <ConversationPane conversationId={c.conversationId} highlightId={null} paneVisible />;
  const plus = () => screen.queryByTestId('composer-plus');
  const msg = { id: 'm1', body: 'hello', kind: 'message', isDeleted: false, threadRootId: null, createdAt: '2026-11-01T08:00:00.000Z' };

  it('a DM with messages has the + with one item, New point', async () => {
    state.messages = [msg];
    await mount(pane(DM), [DM, MIRROR], '/chats/c/conv-dm');
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(await screen.findByTestId('plus-new-point')).toHaveTextContent('New point');
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('an empty DM has no +, and neither has the Mirror (its own + needs canvas drafting, which is off here)', async () => {
    await mount(pane(DM), [DM, MIRROR], '/chats/c/conv-dm');
    await screen.findByTestId('conversation');
    expect(plus()).toBeNull();
    cleanup();
    state.messages = [msg];
    await mount(pane(MIRROR), [DM, MIRROR], '/chats/c/conv-mirror');
    await screen.findByTestId('conversation');
    expect(screen.queryByTestId('plus-new-point')).toBeNull();
  });

  it('New point asks for a thread with no draft, opens the Mirror on it and never starts a run', async () => {
    state.messages = [msg];
    // the pane makes other reads on mount: answer by name so the right call gets the answer
    rpc.mockImplementation(async (name: string) => (name === 'clarify_start_chat' ? started({ draft_id: null }) : { data: null, error: null }));
    await mount(pane(DM), [DM, MIRROR], '/chats/c/conv-dm');
    fireEvent.pointerDown(await screen.findByTestId('composer-plus'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByTestId('plus-new-point'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/chats/c/conv-dm?clarify=root-1'));
    expect(rpc).toHaveBeenCalledWith('clarify_start_chat', { p_conversation: 'conv-dm', p_draft: false });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('a Clarify thread with no draft yet', () => {
  const root = { id: 'root-1', kind: 'clarify', threadRootId: null, isDeleted: false, createdAt: '2026-11-01T08:00:00.000Z' } as unknown as ChatMessage;
  function Footer() {
    const parts = useClarifyParts(MIRROR, root, ME, [root]);
    return <>{parts.footer}</>;
  }

  it('says what to type until the first draft exists', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await mount(<Footer />, [MIRROR]);
    expect(await screen.findByTestId('clarify-no-draft-hint')).toHaveTextContent(CLARIFY_NO_DRAFT_HINT);
  });

  it('shows no hint once a draft exists (control)', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'd1', state: 'running', created_at: '2026-11-01T08:00:00.000Z' }], error: null });
    await mount(<Footer />, [MIRROR]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_clarify_thread', { p_thread_root: 'root-1' }));
    await act(async () => {});
    expect(screen.queryByTestId('clarify-no-draft-hint')).toBeNull();
  });
});

describe('every Clarify entry waits for drafting to be on', () => {
  const msg = { id: 'm1', body: 'hello', kind: 'message', isDeleted: false, threadRootId: null, createdAt: '2026-11-01T08:00:00.000Z' };
  const pane = <ConversationPane conversationId="conv-dm" highlightId={null} paneVisible />;

  it.each([[false], [null]])('with the answer %s: no row Clarify, no + in a DM with messages, no onClarify', async (answer) => {
    seedClarifyAvailability(answer);
    state.messages = [msg];
    await mount(<ChatList activeId={null} />, [DM, MIRROR]);
    fireEvent.contextMenu(rowOf('conv-dm'));
    expect((await screen.findAllByRole('menuitem', { name: /Archive|Mark as/ })).length).toBeGreaterThan(0); // CONTROL: the row menu does open
    expect(screen.queryByTestId('row-clarify')).toBeNull();
    cleanup();
    await mount(pane, [DM, MIRROR], '/chats/c/conv-dm');
    await screen.findByTestId('conversation');
    expect(screen.queryByTestId('composer-plus')).toBeNull();
  });

  it('message Clarify (menu and hover bar both read onClarify) is withheld until it is on', async () => {
    const real = await vi.importActual<typeof import('@/app/pages/chat/use-message-actions')>('@/app/pages/chat/use-message-actions');
    const probe = (on: boolean | null) => {
      seedClarifyAvailability(on);
      const out: { has: boolean | null } = { has: null };
      function P() {
        out.has = !!real.useMessageActions({ summary: DM, conv: { remove: vi.fn() } as never, onReply: vi.fn() }).actions.onClarify;
        return null;
      }
      return { out, P };
    };
    for (const [on, expected] of [[true, true], [false, false], [null, false]] as const) {
      cleanup();
      const { out, P } = probe(on);
      await mount(<P />, [DM, MIRROR]);
      expect(out.has, String(on)).toBe(expected);
    }
  });
});

describe('Forward of a whole-chat Clarify root', () => {
  const ctx = (snap: Record<string, unknown>) => ({
    server: { id: 'r1', kind: 'clarify', body: null, attachmentKind: null, attachmentId: null, threadRootId: null, forwardSnapshot: mapForwardSnapshot(snap) } as unknown as ChatMessage,
    live: true, privateHere: false, agent: false, mine: true, ownerOnly: false, noCopy: false, voiceNote: false,
    actions: { onReply: vi.fn(), onForward: vi.fn(), onDelete: vi.fn() }, startEdit: vi.fn(),
  }) as unknown as Parameters<typeof buildMenuItems>[0];
  const keys = (snap: Record<string, unknown>) => buildMenuItems(ctx(snap)).map((i) => i.key);

  it('has no Forward (a forward would arrive as a removed message), while a message-scope Clarify copy keeps it', () => {
    expect(keys({ scope: 'chat', new_point: false, conversation_kind: 'dm', conversation_title: 'A' })).not.toContain('forward');
    expect(keys({ author_name: 'A', body: 'words', created_at: '2026-11-01T08:00:00.000Z' })).toContain('forward');
  });
});
