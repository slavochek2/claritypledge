import { describe, it, expect } from 'vitest';
import { splitChats, isInInbox, CHAT_TABS } from '@/app/pages/chat/chat-view-model';
import type { ChatSummary } from '@/app/data/chat-mappers';

const NOW = new Date('2026-10-20T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();
const last = { id: 'm', createdAt: hours(-1) } as never;

const chat = (kind: ChatSummary['kind'], extra: Partial<ChatSummary> = {}): ChatSummary =>
  ({ conversationId: `${kind}-${Math.random()}`, kind, archived: false, unreadCount: 0, manualUnread: false, lastMessage: null, isPartner: false, ...extra }) as ChatSummary;
const event = (startInHours: number, withMessage = false) =>
  chat('event', { event: { id: 'e', slug: 'e', title: 'Night', datetime: hours(startInHours) } as never, lastMessage: withMessage ? last : null });

const where = (c: ChatSummary) => ({
  inbox: splitChats([c], 'inbox', NOW).active.length === 1,
  channels: splitChats([c], 'channels', NOW).active.length === 1,
});

describe('Inbox and Channels tabs', () => {
  it('the first tab is the Inbox', () => {
    expect(CHAT_TABS[0]).toEqual({ id: 'inbox', label: 'Inbox' });
  });
  it.each([
    ['an empty group', chat('group'), { inbox: false, channels: true }],
    ['a group with a message', chat('group', { lastMessage: last }), { inbox: true, channels: true }],
    ['an empty event 3 days out', event(72), { inbox: false, channels: true }],
    ['an empty event 20h out', event(20), { inbox: true, channels: true }],
    ['an empty event 13h after it started', event(-13), { inbox: false, channels: false }],
    ['an event with messages after it started', event(-30, true), { inbox: true, channels: true }],
    ['a 1:1', chat('dm'), { inbox: true, channels: false }],
    ['the mirror', chat('mirror'), { inbox: true, channels: false }],
  ])('%s', (_name, c, expected) => {
    expect(where(c)).toEqual(expected);
  });
  it('an empty event is in the Inbox from exactly 24h before it starts', () => {
    expect(isInInbox(event(24), NOW)).toBe(true);
    expect(isInInbox(event(24.01), NOW)).toBe(false);
  });
});
