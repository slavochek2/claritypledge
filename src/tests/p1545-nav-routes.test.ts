import { describe, it, expect } from 'vitest';
import { isBottomNavHiddenRoute, CHAT_CONVERSATION_PREFIX } from '@/app/components/layout/bottom-nav-routes';
import { chatPath, HOME, parseChatRoute } from '@/app/pages/chat/chat-view-model';
import { HOME_PATH, CHATS_PATH, ARTIFACTS_PATH } from '@/app/components/layout/app-shell/shell-nav';

describe('P1545 route moves', () => {
  it('Home is the feed, Chats lives at /chats, Artifacts at /artifacts', () => {
    expect(HOME_PATH).toBe('/feed');
    expect(CHATS_PATH).toBe('/chats');
    expect(ARTIFACTS_PATH).toBe('/artifacts');
    expect(HOME).toBe('/chats');
  });

  it('an open conversation hides the phone bar; the chat list and the other tabs do not', () => {
    expect(CHAT_CONVERSATION_PREFIX).toBe('/chats/c/');
    expect(isBottomNavHiddenRoute('/chats/c/abc', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/chats/c/abc/t/xyz', '')).toBe(true);
    expect(isBottomNavHiddenRoute('/chats', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/artifacts', '')).toBe(false);
    expect(isBottomNavHiddenRoute('/feed', '')).toBe(false);
  });

  it('chat links are built and parsed under /chats/c/', () => {
    expect(chatPath('abc')).toBe('/chats/c/abc');
    expect(chatPath('abc', { rootId: 'r' })).toBe('/chats/c/abc/t/r');
    expect(parseChatRoute('/chats/c/abc/t/r')).toEqual({ conversationId: 'abc', rootId: 'r' });
    expect(parseChatRoute('/home/c/abc')).toEqual({ conversationId: null, rootId: null });
  });
});
