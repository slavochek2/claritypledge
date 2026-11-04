/**
 * P1604 (founder): the mirror agent\'s chat header menu offers no Archive. An archived mirror\'s offers Unarchive; every other chat
 * keeps Archive.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';
import { ConversationHeader, type HeaderActions } from '@/app/pages/chat/ConversationHeader';

const base: ChatSummary = {
  conversationId: 'mirror-1234', kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const actions: HeaderActions = { onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn() };
function menuFor(chat: ChatSummary) {
  render(<MemoryRouter><ConversationHeader chat={chat} blocked={false} actions={actions} /></MemoryRouter>);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  return within(screen.getByRole('menu'));
}

describe('the mirror header menu', () => {
  it('has no Archive', () => {
    const menu = menuFor(base);
    expect(menu.getByRole('menuitem', { name: /mark as unread/i })).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument();
  });
  it('an archived mirror offers Unarchive', () => {
    expect(menuFor({ ...base, archived: true }).getByRole('menuitem', { name: 'Unarchive' })).toBeInTheDocument();
  });
  it('control: a group chat offers Archive', () => {
    expect(menuFor({ ...base, kind: 'group', title: 'Team' }).getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();
  });
});
