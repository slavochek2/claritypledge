// @vitest-environment jsdom
/**
 * P1596, "Approved after solo test 2" (founder, 2026-11-02): one transcription bar, the short arrival line, Today's event
 * for a registered person, "Transcribed" once per run, the event room link in an event chat, and the migration's shape.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { tonightsEventHref } from '@/app/hooks/useTonightsEvent';
import { EVENT_TEXT_ARRIVES, EVENT_TEXT_ARRIVES_SHORT } from '@/app/components/session/capture-copy';

const cap = vi.hoisted(() => ({ phase: 'idle' as string }));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ phase: cap.phase, isCapturingForEvent: () => false, startCapture: async () => ({ started: true }) }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false }), useOfflineStripShown: () => false }));

import { RoomTranscribeIdleBar } from '@/app/components/session/room-capture-bar';
import { TranscriptionMark } from '@/app/pages/chat/MessageParts';
import { EventRoomLink } from '@/app/pages/chat/EventRoomLink';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';

describe('one transcription bar (founder, solo test 2026-11-02)', () => {
  it.each(['capturing', 'stalled', 'observing', 'paused'])('the idle bar is not drawn while any capture is %s, for any event', (phase) => {
    cap.phase = phase;
    render(<RoomTranscribeIdleBar eventId="other-event" displayName="Ana" onFailed={() => {}} />);
    expect(screen.queryByTestId('room-transcribe-idle')).toBeNull();
  });
  it('and is drawn when nothing runs', () => {
    cap.phase = 'idle';
    render(<RoomTranscribeIdleBar eventId="e" displayName="Ana" onFailed={() => {}} />);
    expect(screen.getByTestId('room-transcribe-idle')).toBeInTheDocument();
  });
});

describe('the arrival line', () => {
  it('has a short form for the bar and the full sentence for the live text page and the info icon', () => {
    expect(EVENT_TEXT_ARRIVES_SHORT).toBe('Text arrives after the round');
    expect(EVENT_TEXT_ARRIVES).toBe("If you're at a table, your text reaches its chat about 2 minutes after the round ends.");
  });
});

describe("Today's event for a registered person", () => {
  const ev = { slug: 'x', title: 'X', datetime: '2026-11-02T12:00:00Z', durationMinutes: 60, preparationEnabled: false };
  const mid = new Date('2026-11-02T12:30:00Z');
  it('opens the room while the window is on, preparation or not', () => {
    expect(tonightsEventHref({ ...ev, registered: true }, mid)).toBe('/events/x/room');
  });
  it('stays on the event page for the public pick of a prep-off event, and outside the window', () => {
    expect(tonightsEventHref({ ...ev, registered: false }, mid)).toBe('/events/x');
    expect(tonightsEventHref({ ...ev, registered: true }, new Date('2026-11-02T06:00:00Z'))).toBe('/events/x');
  });
});

describe('"Transcribed" once per run', () => {
  const m = { isTranscription: true, isDeleted: false } as ChatMessage;
  it('shows on the first message of a run and not on one that continues it', () => {
    const { rerender } = render(<TranscriptionMark msg={m} />);
    expect(screen.getAllByTestId('transcription-label')).toHaveLength(1);
    rerender(<TranscriptionMark msg={m} continues />);
    expect(screen.queryByTestId('transcription-label')).toBeNull();
    rerender(<TranscriptionMark msg={m} continues grouped />);
    expect(screen.queryByTestId('transcription-label')).toBeNull();
  });
});

describe('the event chat links to the event room', () => {
  const chat = (kind: string) => ({ kind, event: { slug: 'night', title: 'N', datetime: '2026-11-02T12:00:00Z' } }) as unknown as ChatSummary;
  it('for an event channel (and so its threads)', () => {
    render(<MemoryRouter><EventRoomLink chat={chat('event')} /></MemoryRouter>);
    expect(screen.getByTestId('event-room-link')).toHaveAttribute('href', '/events/night/room');
  });
  it('for no other kind of chat', () => {
    render(<MemoryRouter><EventRoomLink chat={chat('group')} /></MemoryRouter>);
    expect(screen.queryByTestId('event-room-link')).toBeNull();
  });
});

describe('the threads-in-time-order migration', () => {
  const sql = readFileSync('supabase/migrations/20261102133000_p1596_threads_in_time_order.sql', 'utf8');
  it('carries the annotations pre-commit requires and keeps the old thread kind', () => {
    expect(sql).toMatch(/^-- client-safe:/m);
    expect(sql).toMatch(/^-- diffed against:/m);
    expect(sql).toContain("'outside_rounds'");
    for (const t of ['Before round 1', 'After the last round', 'The conversation']) expect(sql).toContain(t);
  });
  it('keeps consent, erasure and the fence: the speaker lock before the place lock, consent re-check, claim fence', () => {
    expect(sql.indexOf("'p1592:speaker:'")).toBeGreaterThan(-1);
    expect(sql.indexOf("'p1592:speaker:'")).toBeLessThan(sql.indexOf("'p1596:place:'"));
    expect(sql).toContain('v_consent IS NULL');
    expect(sql).toContain('_chat_access_since');
    expect(sql).toMatch(/_transcribe_clean_enabled\(\)/);
  });
  it('starts the before job on round 1 only, and the room-end job leaves what it owns', () => {
    expect(sql).toMatch(/AFTER INSERT ON public\.event_rounds[\s\S]*WHEN \(NEW\.round_no = 1\)/);
    expect(sql).toContain("j.place = 'before'");
  });
  it('sorts before the migration that restamps its roots, which sorts before the open-round fix', () => {
    const names = readdirSync('supabase/migrations').filter(n => /^\d{14}_/.test(n)).sort();
    const at = (n: string) => names.indexOf(n);
    expect(at('20261102133000_p1596_threads_in_time_order.sql')).toBeGreaterThanOrEqual(0);
    expect(at('20261102143000_p1596_thread_roots_in_time_order.sql')).toBeGreaterThan(at('20261102133000_p1596_threads_in_time_order.sql'));
    expect(at('20261102170000_p1596_open_round_at_room_end.sql')).toBeGreaterThan(at('20261102143000_p1596_thread_roots_in_time_order.sql'));
  });
});
