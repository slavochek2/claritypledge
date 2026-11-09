/**
 * P1652: what the reader sees. Linked words (own-app same tab, others new tab, markdown stays as typed, chips untouched), the quiet link card,
 * the split "Go to original" control, and the reaction pills (toggle, who reacted, long press that does not toggle).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const cardRead = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/app/pages/chat/link-card-cache', () => ({ loadLinkCard: cardRead.fn, clearLinkCardCache: vi.fn() }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="feed-point" /> }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: () => <div data-testid="feed-story" /> }));
vi.mock('@/app/components/canvas/canvas-workspace-context', () => ({ useCanvasWorkspace: () => ({ showBox: undefined }) }));

import { ChatWords } from '@/app/pages/chat/ChatLinks';
import { CanvasMessageBody } from '@/app/pages/chat/CanvasMessageBody';
import { ChatLinkCard } from '@/app/pages/chat/ChatLinkCard';
import { Quote } from '@/app/pages/chat/Quote';
import { MessageReactions } from '@/app/pages/chat/MessageReactions';
import type { MessageReactionsState } from '@/app/pages/chat/use-message-reactions';

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;
const inRouter = (ui: ReactNode) => render(<MemoryRouter initialEntries={['/chat']}><Routes><Route path="*" element={<>{ui}<Where /></>} /></Routes></MemoryRouter>);
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('ChatWords', () => {
  it('an own-app address goes through the router in the same tab; an outside one opens a new tab', () => {
    inRouter(<ChatWords text="go https://claritypledge.com/live/ABCD or https://example.com/a" />);
    const own = screen.getByText('https://claritypledge.com/live/ABCD');
    expect(own.getAttribute('target')).toBeNull();
    fireEvent.click(own);
    expect(screen.getByTestId('where').textContent).toBe('/live/ABCD');
    const out = screen.getByText('https://example.com/a');
    expect(out.getAttribute('target')).toBe('_blank');
    expect(out.getAttribute('rel')).toContain('noopener');
  });
  it('the visible text of every link is its destination', () => {
    inRouter(<ChatWords text="www.example.com and google.com" />);
    for (const a of document.querySelectorAll('a')) expect(a.getAttribute('href')).toBe(`https://${a.textContent}`);
    expect(document.querySelectorAll('a')).toHaveLength(2);
  });
  it('markdown link syntax stays as typed with no link', () => {
    inRouter(<ChatWords text="[click here](https://example.com)" />);
    expect(document.querySelector('a')).toBeNull();
    expect(document.body.textContent).toContain('[click here](https://example.com)');
  });
  it('a spoken let.me is not a link; a spoken https address is', () => {
    inRouter(<><ChatWords text="let.me think" spoken /><ChatWords text="https://example.com" spoken /></>);
    expect(document.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('words with chips', () => {
  it('chips are not links, a markdown token beside a chip stays plain, other words still link', () => {
    inRouter(<CanvasMessageBody agent={false} boxRefs={['canvas:problem']} body="[My problem] see [click here](https://example.com) and https://example.org" />);
    const anchors = [...document.querySelectorAll('a')];
    expect(anchors.map((a) => a.textContent)).toEqual(['https://example.org']);
    expect(document.body.textContent).toContain('[click here](https://example.com)');
  });
});

/** An observer that reports the element as near the viewport at once. */
class NearObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() { this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
}

describe('ChatLinkCard (quiet)', () => {
  const original = globalThis.IntersectionObserver;
  beforeEach(() => {
    cardRead.fn.mockReset();
    vi.stubGlobal('IntersectionObserver', NearObserver);
  });
  afterEach(() => vi.stubGlobal('IntersectionObserver', original));
  const body = `see https://claritypledge.com/point/${ID}`;
  it('reads nothing until the row is near the viewport (default test observer never reports it)', async () => {
    vi.stubGlobal('IntersectionObserver', original);
    cardRead.fn.mockResolvedValue({ kind: 'point', item: { point: {} } });
    inRouter(<ChatLinkCard body={body} viewerId="v" />);
    await act(async () => undefined);
    expect(cardRead.fn).not.toHaveBeenCalled();
  });
  it('draws nothing while loading, on no access and on error, and reserves no space', async () => {
    cardRead.fn.mockReturnValue(new Promise(() => undefined));
    const { container, unmount } = inRouter(<ChatLinkCard body={body} viewerId="v" />);
    expect(container.querySelector('[data-testid^="link-card"]')).toBeNull();
    expect(container.textContent).toBe('/chat');
    unmount();
    cardRead.fn.mockResolvedValue(null);
    const r2 = inRouter(<ChatLinkCard body={body} viewerId="v" />);
    await act(async () => undefined);
    expect(r2.container.querySelector('[data-testid^="link-card"]')).toBeNull();
    expect(r2.container.textContent).not.toMatch(/Not available|Couldn/);
  });
  it('control: draws the card when the reader has access, one card for two links', async () => {
    cardRead.fn.mockResolvedValue({ kind: 'point', item: { point: {} } });
    inRouter(<ChatLinkCard body={`${body} and https://claritypledge.com/point/${ID.replace('0f8f', '1f8f')}`} viewerId="v" />);
    await act(async () => undefined);
    expect(screen.getAllByTestId('feed-point')).toHaveLength(1);
    expect(cardRead.fn).toHaveBeenCalledTimes(1);
    expect(cardRead.fn.mock.calls[0]![0]).toEqual({ kind: 'point', id: ID });
  });
  it('no card for a recipient letter link or a link to another site', async () => {
    cardRead.fn.mockResolvedValue({ kind: 'point', item: { point: {} } });
    inRouter(<ChatLinkCard body={`https://claritypledge.com/letter/${ID} https://evil.com/point/${ID}`} viewerId="v" />);
    await act(async () => undefined);
    expect(cardRead.fn).not.toHaveBeenCalled();
  });
  it('a late answer for a link since edited away is ignored', async () => {
    let resolveOld: (v: unknown) => void = () => undefined;
    cardRead.fn.mockImplementationOnce(() => new Promise((res) => { resolveOld = res; }));
    cardRead.fn.mockResolvedValue(null);
    const ui = (b: string) => <MemoryRouter><ChatLinkCard body={b} viewerId="v" /></MemoryRouter>;
    const { rerender } = render(ui(body));
    rerender(ui(`edited https://claritypledge.com/story/${ID}`));
    await act(async () => { resolveOld({ kind: 'point', item: { point: {} } }); });
    expect(screen.queryByTestId('feed-point')).toBeNull();
  });
});

describe('Quote split jump', () => {
  it('forward: words are not a button, "Go to original" is a separate 40px control, and a link in the words works', () => {
    const jump = vi.fn();
    inRouter(<Quote testId="forwarded-card" label="Forwarded" onJump={jump} splitJump body={<ChatWords text="https://example.com" />} />);
    expect(screen.getByTestId('forwarded-card').tagName).toBe('DIV');
    expect(document.querySelector('a')).not.toBeNull();
    fireEvent.click(screen.getByText('https://example.com'));
    expect(jump).not.toHaveBeenCalled();
    const go = screen.getByTestId('go-to-original');
    expect(go.className).toContain('min-h-10');
    fireEvent.click(go);
    expect(jump).toHaveBeenCalledTimes(1);
  });
  it('reply quote stays one button', () => {
    const jump = vi.fn();
    inRouter(<Quote testId="reply-quote" label="Reply" onJump={jump} body="words" />);
    expect(screen.getByTestId('reply-quote').tagName).toBe('BUTTON');
    expect(screen.queryByTestId('go-to-original')).toBeNull();
  });
});

describe('MessageReactions', () => {
  const rx = (over: Partial<MessageReactionsState> = {}): MessageReactionsState => ({
    enabled: true, messageId: 'm1', viewerId: 'me', pickerAt: null, openPicker: vi.fn(), closePicker: vi.fn(), toggle: vi.fn(),
    reactions: [
      { id: '1', messageId: 'm1', profileId: 'me', emoji: '👍' },
      { id: '2', messageId: 'm1', profileId: 'p2', emoji: '👍' },
      { id: '3', messageId: 'm1', profileId: 'ghost', emoji: '❤️' },
    ],
    ...over,
  });
  const authors = { p2: { id: 'p2', name: 'Ada', slug: null, avatarUrl: null, avatarColor: null, hasPledged: false } };

  it('a pill per emoji with its count, the viewer own pressed; unknown people read "Unknown member"', () => {
    render(<MessageReactions rx={rx()} authors={authors} />);
    const pills = screen.getAllByTestId('reaction-pill');
    expect(pills.map((p) => p.textContent)).toEqual(['👍2', '❤️1']);
    expect(pills[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(pills[1]!.getAttribute('aria-pressed')).toBe('false');
    // Item 13: the names are said by MobileTooltip (no native title next to it); the accessible name carries them.
    expect(pills[1]!.getAttribute('aria-label')).toBe('❤️ 1, Unknown member');
    expect(pills[0]!.getAttribute('aria-label')).toBe('👍 2, You, Ada');
  });
  it('tapping a pill toggles that emoji', () => {
    const state = rx();
    render(<MessageReactions rx={state} authors={authors} />);
    fireEvent.click(screen.getAllByTestId('reaction-pill')[1]!);
    expect(state.toggle).toHaveBeenCalledWith('❤️');
  });
  it('a long press shows who reacted and releasing it does not toggle; control: a plain tap toggles', () => {
    vi.useFakeTimers();
    try {
      const state = rx();
      render(<MessageReactions rx={state} authors={authors} />);
      const pill = screen.getAllByTestId('reaction-pill')[0]!;
      fireEvent.pointerDown(pill, { pointerType: 'touch' });
      act(() => { vi.advanceTimersByTime(600); });
      expect(screen.getAllByRole('tooltip')[0]!.textContent).toContain('You, Ada');
      fireEvent.pointerUp(pill, { pointerType: 'touch' });
      fireEvent.click(pill);
      expect(state.toggle).not.toHaveBeenCalled();
      fireEvent.pointerDown(pill, { pointerType: 'touch' });
      fireEvent.pointerUp(pill, { pointerType: 'touch' });
      fireEvent.click(pill);
      expect(state.toggle).toHaveBeenCalledWith('👍');
    } finally {
      vi.useRealTimers();
    }
  });
  it('nothing at all when reactions are not enabled for the message', () => {
    const { container } = render(<MessageReactions rx={rx({ enabled: false })} authors={authors} />);
    expect(container.innerHTML).toBe('');
  });
  it('the picker offers exactly the emoji set and toggles the chosen one', () => {
    const state = rx({ pickerAt: { x: 10, y: 10 } });
    render(<MessageReactions rx={state} authors={authors} />);
    expect(screen.getAllByRole('menuitem').map((b) => b.getAttribute('data-emoji'))).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏']);
    fireEvent.click(screen.getAllByRole('menuitem')[2]!);
    expect(state.toggle).toHaveBeenCalledWith('😂');
  });
});
