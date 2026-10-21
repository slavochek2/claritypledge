/**
 * @file p1533-mirror-menu-copy.test.tsx
 * @description P1533 (founder, after trying P1520): the mirror's panel is reachable from the three-dots menu
 * ("About Mira"), its subtitle says what is private ("Only you see this chat"), and the redundant hint under
 * the face choice is gone.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';
import { ConversationHeader, type HeaderActions } from '@/app/pages/chat/ConversationHeader';
import { MirrorInfoDialog } from '@/app/pages/chat/MirrorInfoDialog';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext, type MirrorContextValue } from '@/app/pages/chat/mirror-state';

const mirrorChat: ChatSummary = {
  conversationId: 'mirror-1234', kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const actions = (over: Partial<HeaderActions> = {}): HeaderActions => ({
  onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn(), ...over,
});
function openMenu() {
  const more = screen.getByRole('button', { name: 'More' });
  fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  return screen.getByRole('menu');
}

describe('P1533 mirror menu', () => {
  it('has "About Mira", which opens the panel', () => {
    const onMirrorInfo = vi.fn();
    render(<MemoryRouter><ConversationHeader chat={mirrorChat} blocked={false} actions={actions({ onMirrorInfo })} /></MemoryRouter>);
    fireEvent.click(within(openMenu()).getByRole('menuitem', { name: 'About Mira' }));
    expect(onMirrorInfo).toHaveBeenCalled();
  });

  it('control: a channel menu has no About item', () => {
    render(<MemoryRouter><ConversationHeader chat={{ ...mirrorChat, kind: 'group', title: 'Team' }} blocked={false} actions={actions({ onMirrorInfo: vi.fn() })} /></MemoryRouter>);
    expect(within(openMenu()).queryByRole('menuitem', { name: /About/ })).not.toBeInTheDocument();
  });
});

describe('P1533 mirror panel copy', () => {
  it('says "Your mirror · Only you see this chat." and drops the face-choice hint', () => {
    const mirror = {
      enabled: true, profile: { conversationId: 'mirror-1234', portraitUrl: null, credit: null, gender: null }, portraitStatus: 'idle',
      statusFor: () => undefined, requestReply: vi.fn(), loadStatuses: vi.fn(), ask: vi.fn(), newFace: vi.fn(), ensurePortrait: vi.fn(), setGender: vi.fn(),
    } as unknown as MirrorContextValue;
    render(
      <MemoryRouter>
        <ChatContext.Provider value={{} as ChatContextValue}>
          <MirrorContext.Provider value={mirror}>
            <MirrorInfoDialog chat={mirrorChat} onRename={vi.fn()} onClose={vi.fn()} />
          </MirrorContext.Provider>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    const panel = screen.getByTestId('mirror-info');
    expect(panel).toHaveTextContent('Your mirror · Only you see this chat.');
    expect(panel).not.toHaveTextContent('Used the next time');
    expect(within(panel).getByRole('radiogroup', { name: 'Face' })).toBeInTheDocument();
  });
});
