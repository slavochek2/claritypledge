/**
 * @file p1536-walk3-parts.test.tsx
 * @description P1536 walkthrough 3 (2026-11-01), the items that are one component deep: 9 (author grouping after the opener), 10 (the version
 * card's own loading footprint), 12 (no empty header band on a published view), 13 (touch targets), 14 (the opener's words).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ConversationApi } from '@/app/pages/chat/MessageList';

const helpers = vi.hoisted(() => ({ loadAttachment: vi.fn() }));
vi.mock('@/app/data/chat-ui-helpers', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-ui-helpers')), loadAttachment: helpers.loadAttachment }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/app/pages/chat/MessageRow', () => ({
  MessageRow: ({ msg, compact }: { msg: ChatMessage; compact: boolean }) => <li data-msg={msg.id} data-compact={String(compact)}>{msg.body}</li>,
}));

import { MessageList } from '@/app/pages/chat/MessageList';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => cleanup());

const m = (id: string, body: string, createdAt: string): ChatMessage => ({
  id, conversationId: 'c', authorId: 'me', body, createdAt, editedAt: null, deletedAt: null, isDeleted: false, replyToId: null, threadRootId: 'root',
  forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
});
const conv = (messages: ChatMessage[]) => ({
  status: 'ready', messages, stats: new Map(), hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(),
  syncVersion: 0, retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
}) as unknown as ConversationApi;
const compact = (id: string) => document.querySelector(`[data-msg="${id}"]`)?.getAttribute('data-compact');

describe('9: a message that follows the opener starts its own author group', () => {
  // all by the same person, a minute apart: grouping would fold each into the one before
  const list = [m('root', 'the root', '2026-10-27T08:00:00.000Z'), m('a', 'my note', '2026-10-27T08:01:00.000Z'), m('b', 'and more', '2026-10-27T08:02:00.000Z')];
  const mount = (extra: { hideId?: string; leadAfterId?: string }) => render(
    <MemoryRouter><MessageList conv={conv(list)} actions={{} as never} viewerId="me" authors={{}} label="Thread messages" empty="empty" lead={<p>opener</p>} {...extra} /></MemoryRouter>,
  );

  it('the opener sits after the root: the first message under it is NOT compact (it carries its own name), the one after it still folds in', () => {
    mount({ leadAfterId: 'root' });
    expect(compact('root')).toBe('false');
    expect(compact('a')).toBe('false');
    expect(compact('b')).toBe('true');
  });

  it('a new canvas (opener on top, root hidden): the first message carries its name, the next folds in', () => {
    mount({ hideId: 'root' });
    expect(compact('a')).toBe('false');
    expect(compact('b')).toBe('true');
  });

  it('CONTROL: with no opener a minute-apart message of the same author folds into the one before it', () => {
    render(<MemoryRouter><MessageList conv={conv(list)} actions={{} as never} viewerId="me" authors={{}} label="Thread messages" empty="empty" /></MemoryRouter>);
    expect(compact('a')).toBe('true');
  });
});

describe('10: a canvas version card loads as a card, never a blank bubble', () => {
  it('while its read is out: a Skeleton in the loaded card\'s own footprint (the card\'s row height, a disc and two lines), labelled for screen readers', () => {
    helpers.loadAttachment.mockReturnValue(new Promise(() => undefined));
    render(<MemoryRouter><AttachmentCard kind="canvas_version" id="ver-1" viewerId="me" /></MemoryRouter>);
    const loading = screen.getByRole('status', { name: 'Loading attachment' });
    expect(loading).toHaveTextContent('Loading canvas');
    expect(loading.className).toMatch(/\bmin-h-14\b/); // the card's own height (CanvasVersionCard), so nothing jumps when it arrives
    expect(loading.className).toMatch(/\brounded-xl\b/);
    expect(loading.className).toMatch(/\bborder\b/);
    expect(loading.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(3); // disc + two lines, not one grey slab
    expect(within(loading).queryByText(/./, { selector: '*:not(.sr-only)' })).toBeNull(); // the sighted view shows no text
  });
});

describe('14: the opener says what J1 says, without the "Clarity Canvas" label W8 removed', () => {
  it('the opener\'s first message is J1\'s sentence', async () => {
    const { CANVAS_OPENER_ASK } = await import('@/app/pages/chat/canvas-thread-copy');
    expect(CANVAS_OPENER_ASK).toBe('Give your mirror agent anything about your business: files, links, a few lines. It drafts your canvas.');
    expect(CANVAS_OPENER_ASK).not.toContain('Clarity Canvas');
  });

  it('the copy file keeps its [FOUNDER DECISION] marker over the opener text (F1: all copy is proposed)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/pages/chat/canvas-thread-copy.ts', 'utf8');
    const at = src.indexOf('export const CANVAS_OPENER_ASK');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, at - 900), at)).toContain('[FOUNDER DECISION');
  });
});
