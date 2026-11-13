/**
 * P1631 UAT: in the Mirror, a Clarify's copy of a thread showed a published point card in that thread as "Annatest … · Message removed".
 * The copy is built by clarify_chat_message (newest body: 20261104150000_p1604_mirror_session_transcript.sql): each row carries author_name, body,
 * created_at, is_transcription and system_kind, and only rows with deleted_at IS NULL are copied. So a copied row with no body is an attachment
 * (a card has no body), and the only removal a copy can show is erasure, which rewrites the row to "Deleted user" with no body
 * (erase_chat_data_for, the forward_snapshot -> thread scrub). The copy does not say what kind the attachment was, so the row takes the label a quote
 * already uses for an attachment of unknown kind (messageSummary: "An attachment"); "A point" would need the kind in the copy (SQL, not done here).
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ForwardSnapshot } from '@/app/data/chat-mappers';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-1234' } }) }));

import { ForwardedBody } from '@/app/pages/chat/MessageParts';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { messageSummary } from '@/app/pages/chat/chat-text';

const ctx = { chats: [{ conversationId: 'conv-mirror', kind: 'mirror', title: 'Test Mirror' }] } as unknown as ChatContextValue;
const snapshot = {
  authorName: 'Test Member', body: 'the pressed thread root (fake data)', createdAt: '2026-01-01T10:00:00Z', conversationKind: 'group', conversationTitle: 'Test Group',
  thread: [
    { authorName: 'Test Member', body: null, createdAt: '2026-01-01T10:01:00Z' }, // a point card published into the thread
    { authorName: 'Deleted user', body: null, createdAt: '2026-01-01T10:02:00Z' }, // a reply whose author was erased after the copy
    { authorName: 'Test Member', body: 'a plain reply (fake data)', createdAt: '2026-01-01T10:03:00Z' },
  ],
} as unknown as ForwardSnapshot;
const msg = {
  id: 'clarify-copy-1', conversationId: 'conv-mirror', authorId: 'user-id-1234', body: null, createdAt: '2026-01-01T10:05:00Z', editedAt: null, deletedAt: null,
  isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: 'user-id-5678', forwardSnapshot: snapshot, kind: 'clarify',
  attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
} as unknown as ChatMessage;

describe('P1631 UAT: a Clarify copy of a thread', () => {
  it('shows a card in the thread as an attachment (the existing quote label), and keeps "Message removed" for an erased row only', () => {
    render(<MemoryRouter><ChatContext.Provider value={ctx}><ForwardedBody msg={msg} viewerId="user-id-1234" /></ChatContext.Provider></MemoryRouter>);
    const rows = Array.from(within(screen.getByTestId('forwarded-thread')).getAllByText((_t, el) => el?.parentElement?.getAttribute('data-testid') === 'forwarded-thread'));
    const texts = rows.map((r) => r.textContent);
    const attachmentLabel = messageSummary({ body: null, isDeleted: false, attachmentKind: 'unknown-kind' as never, kind: 'message', audio: null } as never);
    expect(attachmentLabel).toBe('An attachment'); // the label is the quote's own, not new copy
    expect(texts).toEqual([
      `Test Member: ${attachmentLabel}`,
      'Deleted user · Message removed',
      'Test Member: a plain reply (fake data)',
    ]);
  });
});
