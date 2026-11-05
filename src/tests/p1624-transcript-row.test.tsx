/**
 * @file p1624-transcript-row.test.tsx
 * @description P1624: a session root in the chat list reads as a transcript and opens as one. Its reply count comes only from
 * replies that are not transcript text, and every other thread root keeps its count.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { mapMessageRow, type ChatMessage, type ChatMessageRow } from '@/app/data/chat-mappers';
import { sessionThreadTitle } from '@/app/data/session-thread-title';
import { INCOMPLETE_TITLE_SUFFIX } from '@/app/components/session/capture-copy';
import type { ThreadStats } from '@/app/data/chat-service';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { LONG_PRESS_MS, MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';

const ME = 'user-id-me';
const OTHER = 'user-id-other';
const START = '2026-11-05T12:37:00Z';
const baseRow: ChatMessageRow = {
  id: 'root-1', conversation_id: 'c1', author_id: null, body: `session|${START}|1`, created_at: START, edited_at: null, deleted_at: null,
  reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds',
};
const chatValue = { userId: ME, status: 'ready', chats: [], authors: { [OTHER]: { id: OTHER, name: 'Anna Example', slug: 'anna' } }, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined } as unknown as ChatContextValue;
const makeActions = (): MessageActions => ({
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
});
function show(m: ChatMessage, stat: ThreadStats | undefined, actions = makeActions(), inThread = false) {
  render(
    <MemoryRouter>
      <ChatContext.Provider value={chatValue}>
        <MirrorContext.Provider value={null}>
          <ul><MessageRow msg={m} mine={false} viewerId={ME} author={undefined} authors={chatValue.authors} compact={false} highlight={false} stat={stat} actions={actions} inThread={inThread} /></ul>
        </MirrorContext.Provider>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  return actions;
}

describe('P1624 mapping', () => {
  it('carries the session fields separately and leaves body as the formatted title', () => {
    const m = mapMessageRow({ ...baseRow, body: `session|${START}|2|i` });
    expect(m.sessionRoot).toEqual({ startIso: START, partNo: 2, incomplete: true });
    expect(m.body).toBe(sessionThreadTitle(`session|${START}|2|i`));
  });
  it('gives no session fields to other system roots, even with a matching body', () => {
    expect(mapMessageRow({ ...baseRow, body: 'Outside rounds' }).sessionRoot).toBeNull();
    expect(mapMessageRow({ ...baseRow, system_kind: 'round_thread' }).sessionRoot).toBeNull();
  });
});

describe('P1624 the row', () => {
  it('regression: transcript text only shows no reply count, and the row opens the thread', () => {
    const m = mapMessageRow(baseRow);
    const actions = show(m, { count: 1, authorIds: [OTHER], peopleCount: 0, peopleAuthorIds: [] });
    expect(screen.queryByTestId('replies-link')).toBeNull();
    fireEvent.click(screen.getByTestId('transcript-open'));
    expect(actions.onThread).toHaveBeenCalledWith(m);
    expect(screen.getByTestId('transcript-open').textContent).toContain('Open transcript');
  });
  it('shows part and incomplete in the muted date, and the title stays out of the body line', () => {
    show(mapMessageRow({ ...baseRow, body: `session|${START}|2|i` }), undefined);
    const meta = screen.getByTestId('transcript-meta').textContent ?? '';
    expect(meta).toContain('Part 2');
    expect(meta).toContain(INCOMPLETE_TITLE_SUFFIX);
    expect(screen.getByTestId('transcript-open').textContent).toMatch(/^Transcript/);
  });
  it('counts people only, separately from the transcript target', () => {
    const m = mapMessageRow(baseRow);
    const actions = show(m, { count: 7, authorIds: [OTHER], peopleCount: 2, peopleAuthorIds: [OTHER] });
    const link = screen.getByTestId('replies-link');
    expect(link.textContent).toContain('2 replies');
    expect(screen.getByTestId('transcript-open').contains(link)).toBe(false);
    fireEvent.click(link);
    expect(actions.onThread).toHaveBeenCalledTimes(1);
  });
  it('a long press opens the actions and the finger lifting does not also open the thread', () => {
    vi.useFakeTimers();
    try {
      const actions = show(mapMessageRow(baseRow), undefined);
      const open = screen.getByTestId('transcript-open');
      fireEvent.touchStart(open, { touches: [{ clientX: 5, clientY: 5 }] });
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 1); });
      fireEvent.touchEnd(open);
      fireEvent.pointerUp(open, { pointerType: 'touch' });
      fireEvent.click(open);
      expect(actions.onThread).not.toHaveBeenCalled();
      expect(screen.getByRole('menu')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
  it('a press that dismisses the open menu does not open the thread, and a later tap does', () => {
    vi.useFakeTimers();
    try {
      const actions = show(mapMessageRow(baseRow), undefined);
      const open = screen.getByTestId('transcript-open');
      fireEvent.contextMenu(open, { clientX: 5, clientY: 5 });
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerDown(open);
      fireEvent.mouseDown(open);
      act(() => { vi.advanceTimersByTime(1000); }); // held past the guard's length
      fireEvent.pointerUp(open);
      fireEvent.click(open);
      expect(actions.onThread).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1000); });
      fireEvent.click(open);
      expect(actions.onThread).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a long press with no click after it does not swallow a later keyboard activation', () => {
    vi.useFakeTimers();
    try {
      const actions = show(mapMessageRow(baseRow), undefined);
      const open = screen.getByTestId('transcript-open');
      fireEvent.touchStart(open, { touches: [{ clientX: 5, clientY: 5 }] });
      act(() => { vi.advanceTimersByTime(LONG_PRESS_MS + 1); });
      fireEvent.pointerUp(open, { pointerType: 'touch' });
      act(() => { vi.advanceTimersByTime(1000); });
      fireEvent.click(open); // what Enter on a focused button dispatches
      expect(actions.onThread).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('stays the plain title inside the thread panel', () => {
    show(mapMessageRow(baseRow), undefined, makeActions(), true);
    expect(screen.queryByTestId('transcript-open')).toBeNull();
    expect(screen.getByText(/^Transcript /)).toBeTruthy();
  });
  it('a round root keeps its current count and link', () => {
    const m = mapMessageRow({ ...baseRow, body: 'Round 1 · A & B', system_kind: 'round_thread' });
    show(m, { count: 3, authorIds: [], peopleCount: 0, peopleAuthorIds: [] });
    expect(screen.queryByTestId('transcript-open')).toBeNull();
    expect(screen.getByTestId('replies-link').textContent).toContain('3 replies');
  });
});
