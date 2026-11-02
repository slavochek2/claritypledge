/**
 * P1596: "Open" for an event's transcription goes to the viewer's current round-table thread, else the
 * event channel. The decision is eventChatPath (pure); resolveEventChatPath adds the two reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chats = vi.hoisted(() => ({ list: [] as unknown[], seat: null as unknown, fail: false }));
vi.mock('@/app/data/chat-service', () => ({ getMyChats: vi.fn(async () => chats.list) }));
vi.mock('@/app/data/chat-round-threads', () => ({
  getMyOpenRoundSeat: vi.fn(async () => { if (chats.fail) throw new Error('rpc'); return chats.seat; }),
}));

import { eventChatPath, openCapturedRoom, resolveEventChatPath } from '@/app/data/event-chat-path';

beforeEach(() => { chats.list = []; chats.seat = null; chats.fail = false; });

describe('eventChatPath', () => {
  it('seated in the open round with its thread: that thread', () => {
    expect(eventChatPath('c1', { rootMessageId: 'r2' })).toBe('/chats/c/c1/t/r2');
  });
  it('seated in the open round, thread not created yet: the event channel, not an earlier round', () => {
    expect(eventChatPath('c1', { rootMessageId: null })).toBe('/chats/c/c1');
  });
  it('not currently seated (sat out, left, between rounds, never seated): the event channel', () => {
    expect(eventChatPath('c1', null)).toBe('/chats/c/c1');
  });
});

describe('eventChatPath between rounds', () => {
  it('open round, seated, thread: that thread', () => {
    expect(eventChatPath('c1', { rootMessageId: 'r2', roundOpen: true, latestRootMessageId: 'r1' })).toBe('/chats/c/c1/t/r2');
  });
  it('open round, seated, no thread yet: the channel, not an older thread', () => {
    expect(eventChatPath('c1', { rootMessageId: null, roundOpen: true, latestRootMessageId: 'r1' })).toBe('/chats/c/c1');
  });
  it('open round, not seated: the channel, not an older thread', () => {
    expect(eventChatPath('c1', { rootMessageId: null, roundOpen: true, latestRootMessageId: 'r1' })).toBe('/chats/c/c1');
  });
  it('no round open (between rounds or after the last): my newest round thread', () => {
    expect(eventChatPath('c1', { rootMessageId: null, roundOpen: false, latestRootMessageId: 'r1' })).toBe('/chats/c/c1/t/r1');
  });
  it('no round open and I have no round thread: the channel', () => {
    expect(eventChatPath('c1', { rootMessageId: null, roundOpen: false, latestRootMessageId: null })).toBe('/chats/c/c1');
  });
});

describe('resolveEventChatPath', () => {
  it('no round open: resolves to my newest round thread', async () => {
    chats.list = [{ kind: 'event', conversationId: 'c1', event: { id: 'e1' } }];
    chats.seat = { rootMessageId: null, roundOpen: false, latestRootMessageId: 'r7' };
    expect(await resolveEventChatPath('e1')).toBe('/chats/c/c1/t/r7');
  });
  const channelList = () => [
    { kind: 'dm', conversationId: 'd', event: null },
    { kind: 'event', conversationId: 'other', event: { id: 'e2' } },
    { kind: 'event', conversationId: 'c1', event: { id: 'e1' } },
  ];
  it('seated in the active round: this event\'s channel, that round\'s thread', async () => {
    chats.list = channelList();
    chats.seat = { rootMessageId: 'root9' };
    expect(await resolveEventChatPath('e1')).toBe('/chats/c/c1/t/root9');
  });
  it('sat out the active round (the database answers "not seated" even though an earlier round had a thread): the channel', async () => {
    chats.list = channelList();
    chats.seat = null;
    expect(await resolveEventChatPath('e1')).toBe('/chats/c/c1');
  });
  it('the read failing never strands the viewer: the channel', async () => {
    chats.list = channelList();
    chats.fail = true;
    expect(await resolveEventChatPath('e1')).toBe('/chats/c/c1');
  });
  it('no readable channel: null, so the caller falls back to the room page', async () => {
    chats.list = [{ kind: 'event', conversationId: 'c1', event: { id: 'e9' } }];
    expect(await resolveEventChatPath('e1')).toBeNull();
  });
});

describe('openCapturedRoom (founder, solo test 2026-11-02: the live text, not the empty chat)', () => {
  it('an ad-hoc room opens the room page', () => {
    const go = vi.fn();
    openCapturedRoom({ roomCode: 'ABC' }, go);
    expect(go).toHaveBeenCalledWith('/transcribe/ABC');
  });
  it('an event capture opens the room page too, with no chat read', () => {
    chats.list = [{ kind: 'event', conversationId: 'c1', event: { id: 'e1' } }];
    chats.seat = { rootMessageId: 'r1' };
    const go = vi.fn();
    openCapturedRoom({ roomCode: 'ABC', eventId: 'e1' } as { roomCode: string }, go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/transcribe/ABC');
  });
});
