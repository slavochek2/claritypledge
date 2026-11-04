/**
 * P1604 session rules 7 and 9 (client half), the 3-hour room clock (rule 8) and the roll's MOVED step.
 * Pure: no microphone, no Supabase client (room-capture-core imports neither).
 */
import { describe, it, expect } from 'vitest';
import {
  captureReducer,
  captureCapRemainingMs,
  isSameCaptureTarget,
  CAPTURE_CAP_MINUTES,
  type CaptureState,
} from '@/app/contexts/room-capture-core';

const capturing = (over: Partial<CaptureState> = {}): CaptureState => ({
  phase: 'capturing', roomId: 'room-a', consecutiveFailures: 0, roomCode: 'AAAAAA', memberId: 'm-a',
  eventId: null, conversationId: null, roomCreatedAt: '2026-11-03T10:00:00.000Z', joinedAt: '2026-11-03T10:05:00.000Z', ...over,
});

describe('rule 9: the client compares room or conversation identity, not eventId', () => {
  it('two different plain chats are NOT the same target (eventId is null for every plain chat)', () => {
    const cur = capturing({ conversationId: 'chat-1', eventId: null });
    expect(isSameCaptureTarget(cur, { conversationId: 'chat-2', eventId: null })).toBe(false);
  });

  it('the same chat is the same target', () => {
    const cur = capturing({ conversationId: 'chat-1' });
    expect(isSameCaptureTarget(cur, { conversationId: 'chat-1', eventId: null })).toBe(true);
  });

  it('an explicit room (a code) is compared by room id, whatever chat or event it carries', () => {
    const cur = capturing({ roomId: 'room-a', conversationId: 'chat-1' });
    expect(isSameCaptureTarget(cur, { room: { id: 'room-a' } })).toBe(true);
    expect(isSameCaptureTarget(cur, { room: { id: 'room-b' } })).toBe(false);
  });

  it('an event is compared by event id only when there is one', () => {
    const cur = capturing({ eventId: 'ev-1' });
    expect(isSameCaptureTarget(cur, { eventId: 'ev-1' })).toBe(true);
    expect(isSameCaptureTarget(cur, { eventId: 'ev-2' })).toBe(false);
  });

  it('a chat and its own event room are the same place when the capture knows both', () => {
    const cur = capturing({ eventId: 'ev-1', conversationId: 'chat-1' });
    expect(isSameCaptureTarget(cur, { conversationId: 'chat-1', eventId: null })).toBe(true);
    expect(isSameCaptureTarget(cur, { eventId: 'ev-1' })).toBe(true);
  });

  it('a plain start (no chat, no event, no room) is never the same target: every plain start is a new room', () => {
    const cur = capturing({ eventId: null, conversationId: null });
    expect(isSameCaptureTarget(cur, { eventId: null })).toBe(false);
  });
});

describe('rule 8: the clock is the ROOM\'s', () => {
  it('remaining time runs from the room\'s creation, not from the member\'s joined_at', () => {
    const now = Date.parse('2026-11-03T10:30:00.000Z');
    const remaining = captureCapRemainingMs(
      { roomCreatedAt: '2026-11-03T10:00:00.000Z', joinedAt: '2026-11-03T10:29:00.000Z' }, now);
    expect(remaining).toBe((CAPTURE_CAP_MINUTES - 30) * 60_000);
  });

  it('falls back to joined_at only when the room time is unknown (an older stored capture)', () => {
    const now = Date.parse('2026-11-03T10:30:00.000Z');
    expect(captureCapRemainingMs({ roomCreatedAt: null, joinedAt: '2026-11-03T10:00:00.000Z' }, now))
      .toBe((CAPTURE_CAP_MINUTES - 30) * 60_000);
  });

  it('never negative', () => {
    expect(captureCapRemainingMs({ roomCreatedAt: '2020-01-01T00:00:00.000Z', joinedAt: null }, Date.now())).toBe(0);
  });
});

describe('rule 8: MOVED keeps the capture running in the next room', () => {
  it('swaps room, code, member and clock without leaving the capturing phase', () => {
    const next = captureReducer(capturing(), {
      type: 'MOVED',
      room: { id: 'room-b', code: 'BBBBBB', eventId: null, conversationId: 'chat-1', roomCreatedAt: '2026-11-03T13:00:00.000Z' },
      member: { id: 'm-b', joinedAt: '2026-11-03T13:00:00.000Z' },
    });
    expect(next.phase).toBe('capturing');
    expect(next.roomId).toBe('room-b');
    expect(next.roomCode).toBe('BBBBBB');
    expect(next.memberId).toBe('m-b');
    expect(next.roomCreatedAt).toBe('2026-11-03T13:00:00.000Z');
    expect(next.consecutiveFailures).toBe(0);
  });

  it('a paused capture stays paused when it moves', () => {
    const next = captureReducer(capturing({ phase: 'paused' }), {
      type: 'MOVED', room: { id: 'room-b', code: 'BBBBBB', eventId: null }, member: { id: 'm-b' },
    });
    expect(next.phase).toBe('paused');
    expect(next.roomId).toBe('room-b');
  });

  it('does nothing when no capture exists', () => {
    const idle = captureReducer({ phase: 'idle', roomId: null, consecutiveFailures: 0 }, {
      type: 'MOVED', room: { id: 'room-b', code: 'BBBBBB', eventId: null }, member: { id: 'm-b' },
    });
    expect(idle.phase).toBe('idle');
    expect(idle.roomId).toBeNull();
  });
});
