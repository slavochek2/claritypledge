/**
 * P1652 second review round: reactors' profiles are requested, a drawn link card follows viewer and access, reactions wait for the chats to
 * load, links are bidi-isolated, trailing closers strip only when unbalanced, own-app paths refuse encoded slashes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { mapMessageRow, type ChatMessageRow } from '@/app/data/chat-mappers';
import { scanChat, scanUrls } from '@/app/utils/link-scan';
import { linkifyText } from '@/app/utils/linkify';
import { ownAppPath } from '@/app/pages/chat/chat-link-targets';

const h = vi.hoisted(() => ({ cardRead: vi.fn(), list: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/pages/chat/link-card-cache', () => ({ loadLinkCard: h.cardRead, clearLinkCardCache: vi.fn() }));
vi.mock('@/app/components/feed/feed-point-card', () => ({ FeedPointCard: () => <div data-testid="feed-point" /> }));
vi.mock('@/app/components/feed/feed-story-card', () => ({ FeedStoryCard: () => <div data-testid="feed-story" /> }));
vi.mock('@/app/data/chat-reactions-service', () => ({
  REACTION_EMOJI: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
  listReactions: h.list,
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  subscribeToReactions: () => () => undefined,
}));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';
import { ChatLinkCard } from '@/app/pages/chat/ChatLinkCard';
import { ChatWords } from '@/app/pages/chat/ChatLinks';

const ME = 'user-id-me';
const START = '2026-11-05T12:37:00Z';
const rootRow: ChatMessageRow = {
  id: 'root-1', conversation_id: 'c1', author_id: null, body: `session|${START}|1`, created_at: START, edited_at: null, deleted_at: null,
  reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds',
};
const actions: MessageActions = {
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
};
const ensureAuthors = vi.fn();
const chatValue = (status: 'loading' | 'ready'): ChatContextValue =>
  ({ userId: ME, status, chats: [], authors: {}, missingAuthors: new Set(), ensureAuthors, outbox: [], subscribe: () => () => undefined }) as unknown as ChatContextValue;
const row = (status: 'loading' | 'ready') => (
  <MemoryRouter>
    <ChatContext.Provider value={chatValue(status)}>
      <MirrorContext.Provider value={null}>
        <ul><MessageRow msg={mapMessageRow(rootRow)} mine={false} viewerId={ME} author={undefined} authors={{}} compact={false} highlight={false} actions={actions} /></ul>
      </MirrorContext.Provider>
    </ChatContext.Provider>
  </MemoryRouter>
);

beforeEach(() => {
  ensureAuthors.mockReset();
  h.list.mockReset();
  h.list.mockResolvedValue([{ id: 'r1', messageId: 'root-1', profileId: 'user-id-stranger', emoji: '👍' }]);
});

describe('item 6: reactors whose profile is not loaded are requested', () => {
  it('asks for the reactor through ensureAuthors', async () => {
    render(row('ready'));
    await screen.findByTestId('reaction-pill');
    expect(ensureAuthors).toHaveBeenCalledWith(expect.arrayContaining(['user-id-stranger']));
  });
});

describe('item 8: reactions wait for the chats to load', () => {
  it('while the chats load there is no control and no read; control: once ready it reads and shows', async () => {
    const { rerender } = render(row('loading'));
    await act(async () => undefined);
    expect(h.list).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reaction-pill')).toBeNull();
    rerender(row('ready'));
    expect(await screen.findByTestId('reaction-pill')).toBeTruthy();
    expect(h.list).toHaveBeenCalled();
  });
});

class NearObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() { this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
}
describe('item 7: a drawn link card follows the viewer and the access', () => {
  const original = globalThis.IntersectionObserver;
  beforeEach(() => { h.cardRead.mockReset(); vi.stubGlobal('IntersectionObserver', NearObserver); });
  afterEach(() => vi.stubGlobal('IntersectionObserver', original));
  const body = 'https://claritypledge.com/point/0f8fad5b-d9cb-469f-a165-70867728950e';
  const ui = (viewer: string) => <MemoryRouter><ChatLinkCard body={body} viewerId={viewer} /></MemoryRouter>;
  it('another viewer with no access sees no card (control: the first viewer sees it)', async () => {
    h.cardRead.mockImplementation(async (_t: unknown, viewer: string) => (viewer === 'v1' ? { kind: 'point', item: { point: {} } } : null));
    const { rerender } = render(ui('v1'));
    await act(async () => undefined);
    expect(screen.getByTestId('feed-point')).toBeTruthy();
    rerender(ui('v2'));
    await act(async () => undefined);
    expect(screen.queryByTestId('feed-point')).toBeNull();
  });
  it('a viewer who lost access sees no card again when the answer turns null', async () => {
    let answer: unknown = { kind: 'point', item: { point: {} } };
    h.cardRead.mockImplementation(async () => answer);
    const { rerender } = render(ui('v1'));
    await act(async () => undefined);
    expect(screen.getByTestId('feed-point')).toBeTruthy();
    answer = null;
    rerender(ui('v2'));
    await act(async () => undefined);
    rerender(ui('v1'));
    await act(async () => undefined);
    expect(screen.queryByTestId('feed-point')).toBeNull();
  });
});

describe('item 9: every chat link is bidi-isolated', () => {
  it('chat links and the shared parser anchors carry dir=ltr and unicode-bidi isolate', () => {
    const { container } = render(<MemoryRouter><ChatWords text="a https://example.com b https://claritypledge.com/story/x" /></MemoryRouter>);
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.getAttribute('dir')).toBe('ltr');
      expect(a.className).toContain('[unicode-bidi:isolate]');
    }
    const shared = render(<div>{linkifyText('see https://example.com and [https://example.org](https://example.org)')}</div>).container;
    const sharedAnchors = [...shared.querySelectorAll('a')];
    expect(sharedAnchors.length).toBeGreaterThanOrEqual(2);
    for (const a of sharedAnchors) {
      expect(a.getAttribute('dir')).toBe('ltr');
      expect(a.className).toContain('[unicode-bidi:isolate]');
    }
  });
});

const linkTexts = (t: string) => scanChat(t).filter((s) => s.type === 'link').map((s) => (s.type === 'link' ? s.text : ''));
describe('item 10: trailing closers strip only when unbalanced', () => {
  it('keeps a balanced ) and drops an unbalanced one', () => {
    expect(linkTexts('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    expect(linkTexts('(see https://a.com)')).toEqual(['https://a.com']);
    expect(linkTexts('https://en.wikipedia.org/wiki/Foo_(bar).')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    expect(linkTexts('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });
  it('the same for ] and }', () => {
    expect(linkTexts('https://a.com/x[1]')).toEqual(['https://a.com/x[1]']);
    expect(linkTexts('[https://a.com]')).toEqual(['https://a.com']);
    expect(linkTexts('https://a.com/x{1}')).toEqual(['https://a.com/x{1}']);
    expect(linkTexts('{https://a.com}')).toEqual(['https://a.com']);
  });
  it('strips one trailing quote only', () => {
    expect(linkTexts('"https://a.com"')).toEqual(['https://a.com']);
    expect(scanUrls('https://a.com/x""').filter((s) => s.type === 'link').map((s) => (s.type === 'link' ? s.text : ''))).toEqual(['https://a.com/x"']);
  });
});

describe('item 11: ownAppPath refuses encoded slashes at the path start', () => {
  const o = 'https://claritypledge.com';
  it('null for %5c and %2f (any case), control: an ordinary path stays', () => {
    expect(ownAppPath(`${o}/%5cevil.com`, o)).toBeNull();
    expect(ownAppPath(`${o}/%5Cevil.com`, o)).toBeNull();
    expect(ownAppPath(`${o}/%2fevil.com`, o)).toBeNull();
    expect(ownAppPath(`${o}/%2Fevil.com`, o)).toBeNull();
    expect(ownAppPath(`${o}/story/x?a=1#h`, o)).toBe('/story/x?a=1#h');
    expect(ownAppPath(`${o}/a%2fb`, o)).toBe('/a%2fb'); // not at the start
  });
});
