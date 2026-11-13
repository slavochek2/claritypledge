/**
 * P1631 UAT, AC 137: "From a thread, the thread moves left with '← Chat'. × restores the previous layout exactly."
 * Before: Clarify on an open thread's first message drew the Mirror INSTEAD of the thread (one side panel), with the main chat on the left.
 * Now, from 1280px: the thread takes the left area (its header has "← Chat", which puts the main chat back there) and the Mirror is on the right;
 * × on the Mirror removes only ?clarify=, so the thread is open on the right again, as before. Below 1280px nothing changes.
 * The panes are stubs here: this file proves which pane goes where, from the address and the width.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ wide: true, desktop: true }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { stopSessionRecording: () => undefined } }));
vi.mock('@/app/hooks/useTonightsEvent', () => ({ useTonightsEvent: () => null, eventNightBackFallback: () => null }));
vi.mock('@/app/pages/chat/chat-hooks', async () => ({
  ...(await vi.importActual<object>('@/app/pages/chat/chat-hooks')),
  useMediaQuery: (q: string) => (q === '(min-width: 1280px)' ? h.wide : h.desktop),
  useFinishLeave: () => undefined,
}));
vi.mock('@/app/pages/chat/ChatList', () => ({ ChatList: () => <nav data-testid="chat-list" /> }));
vi.mock('@/app/pages/chat/PointsPanel', () => ({ PointsPanel: () => null }));
// The real pane marks the chat read and "viewed" only while paneVisible is true (use-conversation-read.ts): the stub shows what it was told.
vi.mock('@/app/pages/chat/ConversationPane', () => ({
  ConversationPane: ({ paneVisible }: { paneVisible: boolean }) => <div data-testid="conversation-pane" data-visible={paneVisible ? 'yes' : 'no'} />,
}));
type StubProps = { rootId: string; onClose?: () => void; onBackToChat?: () => void; clarifyPanel?: boolean; focusable?: boolean; onClarifyThread?: (is: boolean | null) => void };
vi.mock('@/app/pages/chat/ThreadPanel', () => ({
  ThreadPanel: (p: StubProps) => <StubThread {...p} />,
}));
/** A thread whose root id starts with "clarify-" is a Clarify thread; "pending-" is one whose root is still being read (the real panel reports null then). */
function StubThread({ rootId, onClose, onBackToChat, clarifyPanel, focusable = true, onClarifyThread }: StubProps) {
  useEffect(() => { onClarifyThread?.(rootId.startsWith('pending-') ? null : rootId.startsWith('clarify-')); }, [rootId, onClarifyThread]);
  return (
    <section data-testid={`panel-${rootId}`} data-slot={onBackToChat ? 'left' : 'right'} data-clarify-panel={clarifyPanel ? 'yes' : 'no'} data-focusable={focusable ? 'yes' : 'no'}>
      {onBackToChat && <button type="button" onClick={onBackToChat}>← Chat</button>}
      {onClose && <button type="button" onClick={onClose}>Close {rootId}</button>}
    </section>
  );
}

import ChatHomePage from '@/app/pages/chat/ChatHomePage';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const chats = [
  { conversationId: 'conv-mirror', kind: 'mirror', title: 'Test Mirror' },
  { conversationId: 'conv-group', kind: 'group', title: 'Test Group' },
];
const FROM_THREAD = '/chats/c/conv-group/t/root-thread?clarify=root-mirror';
const resync = vi.fn();
const refresh = vi.fn(async () => null);
const ctx = { chats, resync, refresh } as unknown as ChatContextValue;

function Where() {
  const l = useLocation();
  const go = useNavigate();
  return (
    <>
      <span data-testid="where">{l.pathname}{l.search}</span>
      <button type="button" onClick={() => go('/chats/c/conv-mirror')}>go elsewhere</button>
      <button type="button" onClick={() => go(FROM_THREAD)}>go to the thread with the Mirror</button>
    </>
  );
}
const mount = (url: string) => render(
  <MemoryRouter initialEntries={[url]}><ChatContext.Provider value={ctx}><ChatHomePage /><Where /></ChatContext.Provider></MemoryRouter>,
);
/** The panes in the order they are drawn, left to right. */
const panes = () => Array.from(document.querySelectorAll('[data-testid="conversation-pane"], section[data-testid^="panel-"]'))
  .map((el) => (el.getAttribute('data-testid') === 'conversation-pane' ? 'chat' : `${el.getAttribute('data-testid')}:${el.getAttribute('data-slot')}`));


describe('P1631 UAT: Clarify from an open thread (AC 137)', () => {
  beforeEach(() => { h.wide = true; h.desktop = true; });
  afterEach(cleanup);

  it('from 1280px the thread moves left with "← Chat" and the Mirror is on the right', async () => {
    mount(FROM_THREAD);
    await screen.findByTestId('panel-root-mirror');
    expect(panes()).toEqual(['panel-root-thread:left', 'panel-root-mirror:right']);
    expect(screen.getByRole('button', { name: '← Chat' })).toBeTruthy();
  });

  it('"← Chat" puts the main chat back on the left; the Mirror stays', async () => {
    mount(FROM_THREAD);
    fireEvent.click(await screen.findByRole('button', { name: '← Chat' }));
    expect(panes()).toEqual(['chat', 'panel-root-mirror:right']);
  });

  it('× on the Mirror restores the previous layout exactly: the chat, and the thread open on the right', async () => {
    mount(FROM_THREAD);
    fireEvent.click(await screen.findByRole('button', { name: 'Close root-mirror' }));
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/conv-group/t/root-thread');
    expect(panes()).toEqual(['chat', 'panel-root-thread:right']);
  });

  it('× after "← Chat" restores the same previous layout (the thread on the right)', async () => {
    mount(FROM_THREAD);
    fireEvent.click(await screen.findByRole('button', { name: '← Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close root-mirror' }));
    expect(panes()).toEqual(['chat', 'panel-root-thread:right']);
  });

  it('CONTROL: below 1280px nothing changes (the Mirror replaces the thread, no "← Chat")', async () => {
    h.wide = false;
    mount(FROM_THREAD);
    await screen.findByTestId('panel-root-mirror');
    expect(panes()).toEqual(['chat', 'panel-root-mirror:right']);
    expect(screen.queryByRole('button', { name: '← Chat' })).toBeNull();
  });

  it('CONTROL: Clarify with no thread open keeps the chat on the left at 1280px', async () => {
    mount('/chats/c/conv-group?clarify=root-mirror');
    await screen.findByTestId('panel-root-mirror');
    expect(panes()).toEqual(['chat', 'panel-root-mirror:right']);
  });
});

/**
 * AC 137, follow-up: "Phone and below 1280 px: full screen with Back". The page hides the chat list and the conversation behind the Clarify panel at
 * every width below 1280px (it hid them only below 1024px), and tells the panel it is the Clarify panel. An ordinary thread keeps 1024px.
 */
describe('P1631 UAT: the Clarify panel covers the page below 1280px (AC 137)', () => {
  beforeEach(() => { h.wide = false; h.desktop = true; });
  afterEach(cleanup);
  const paneWrapper = () => screen.getByTestId('conversation-pane').parentElement as HTMLElement;

  it('with the Mirror open, the conversation is shown only from 1280px, and the panel is told it is the Clarify panel', async () => {
    mount('/chats/c/conv-group?clarify=root-mirror');
    expect((await screen.findByTestId('panel-root-mirror')).getAttribute('data-clarify-panel')).toBe('yes');
    expect(paneWrapper().className).toContain('hidden xl:flex');
    expect(paneWrapper().className).not.toContain('lg:flex');
  });

  it('CONTROL: an ordinary open thread still shows the conversation beside it from 1024px', async () => {
    mount('/chats/c/conv-group/t/root-thread');
    expect((await screen.findByTestId('panel-root-thread')).getAttribute('data-clarify-panel')).toBe('no');
    expect(paneWrapper().className).toContain('hidden lg:flex');
  });
});

describe('P1631 UAT review: the left thread and the page around it', () => {
  beforeEach(() => { h.wide = true; h.desktop = true; resync.mockClear(); refresh.mockClear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('item 3: a left thread that turns out unavailable leaves the address on the chat (the Mirror stays open, the dead thread message ?m= is dropped)', async () => {
    mount(`${FROM_THREAD}&m=reply-id-1`);
    fireEvent.click(await screen.findByRole('button', { name: 'Close root-thread' })); // the real panel calls onClose when its thread is unavailable
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/conv-group?clarify=root-mirror');
    expect(panes()).toEqual(['chat', 'panel-root-mirror:right']);
  });

  it('item 4: while the left thread covers it the chat is not mounted, so nothing marks it read or viewed; back on screen it is visible again', async () => {
    mount(FROM_THREAD);
    await screen.findByTestId('panel-root-mirror');
    expect(screen.queryByTestId('conversation-pane')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Chat' }));
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('yes');
  });

  it('item 4 (follow-up AC 137): below 1280px the Mirror covers the chat, which is mounted but not visible (not read, not viewed)', async () => {
    h.wide = false;
    mount('/chats/c/conv-group?clarify=root-mirror');
    await screen.findByTestId('panel-root-mirror');
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('no');
  });

  it('item 5: the left thread does not take focus on mount; the Mirror may', async () => {
    mount(FROM_THREAD);
    expect((await screen.findByTestId('panel-root-thread')).getAttribute('data-focusable')).toBe('no');
    expect(screen.getByTestId('panel-root-mirror').getAttribute('data-focusable')).toBe('yes');
  });

  it('item 6: after "← Chat", ×, leaving and coming back, Clarify from the same thread shows the left layout again', async () => {
    mount(FROM_THREAD);
    fireEvent.click(await screen.findByRole('button', { name: '← Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close root-mirror' }));
    fireEvent.click(screen.getByRole('button', { name: 'go elsewhere' }));
    fireEvent.click(screen.getByRole('button', { name: 'go to the thread with the Mirror' }));
    expect(panes()).toEqual(['panel-root-thread:left', 'panel-root-mirror:right']);
  });

  it('item 7: a Clarify thread opened from the Mirror chat itself covers the page below 1280px', async () => {
    h.wide = false;
    mount('/chats/c/conv-mirror/t/clarify-root-1');
    await screen.findByTestId('panel-clarify-root-1');
    expect(screen.getByTestId('conversation-pane').parentElement?.className).toContain('hidden xl:flex');
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('no');
  });

  it('item 7 CONTROL: any other thread of the Mirror chat keeps the side panel from 1024px', async () => {
    h.wide = false;
    mount('/chats/c/conv-mirror/t/plain-root-1');
    await screen.findByTestId('panel-plain-root-1');
    expect(screen.getByTestId('conversation-pane').parentElement?.className).toContain('hidden lg:flex');
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('yes');
  });

  it('round 2 item 3: below 1280px a Mirror-chat thread whose root is still being read leaves the chat counted as not seen', async () => {
    h.wide = false;
    mount('/chats/c/conv-mirror/t/pending-root-1');
    await screen.findByTestId('panel-pending-root-1');
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('no');
  });

  it('round 3 C: below 1280px a Mirror-chat thread whose root is still being read is laid out full screen (no side-layout flash for a Clarify thread)', async () => {
    h.wide = false;
    mount('/chats/c/conv-mirror/t/pending-root-1');
    await screen.findByTestId('panel-pending-root-1');
    expect(screen.getByTestId('conversation-pane').parentElement?.className).toContain('hidden xl:flex');
  });

  it('round 2 item 3 CONTROL: a thread of any other chat does not wait (the chat beside it is seen from 1024px)', async () => {
    h.wide = false;
    mount('/chats/c/conv-group/t/pending-root-1');
    await screen.findByTestId('panel-pending-root-1');
    expect(screen.getByTestId('conversation-pane').getAttribute('data-visible')).toBe('yes');
    expect(screen.getByTestId('conversation-pane').parentElement?.className).toContain('hidden lg:flex');
  });

  it('round 3 E: a list read that takes longer than a tick skips the next tick (no pile-up), and a failed one does not stop the timer', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    refresh.mockImplementationOnce(() => new Promise((r) => { finish = () => r(null); }));
    mount(FROM_THREAD);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); // the first read is still on its way
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    refresh.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); // fails, caught
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); // and the next tick runs
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('item 14: while the left thread is shown the open views are re-read every 60 s (the safety net the hidden chat would have run)', async () => {
    vi.useFakeTimers();
    mount(FROM_THREAD);
    expect(screen.getByTestId('panel-root-thread')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(resync).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1); // the chat list too (names, unread counts), as the provider's own timer does
    fireEvent.click(screen.getByRole('button', { name: '← Chat' })); // the chat is back on screen: its own pane runs the provider's timer again
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(resync).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
