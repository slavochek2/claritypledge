/**
 * P1604: /transcribe/:code for a room that belongs to a chat says, before the person agrees, that the words are posted to
 * that chat. An event room and a plain room keep their wording.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ value: 'chat' as string }));
vi.mock('@/app/pages/use-room-event', () => ({ useRoomEventState: () => state.value }));
vi.mock('@/app/pages/use-room-is-mastermind', () => ({ useRoomIsMastermind: () => false }));

import { TranscribeJoinForm } from '@/app/pages/transcribe-join-form';
import { CHAT_ROOM_INTRO } from '@/app/components/session/capture-copy';

describe('the consent screen of a room', () => {
  it('a chat room says the words are posted to the chat', () => {
    state.value = 'chat';
    render(<TranscribeJoinForm urlCode="ABC234" joinError={null} joining={false} onJoin={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(CHAT_ROOM_INTRO);
  });
  it('a plain room keeps today\'s wording', () => {
    state.value = 'room';
    render(<TranscribeJoinForm urlCode="ABC234" joinError={null} joining={false} onJoin={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain('shown to everyone in this room');
  });
  it('an event room keeps the event wording', () => {
    state.value = 'event';
    render(<TranscribeJoinForm urlCode="ABC234" joinError={null} joining={false} onJoin={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain("event's channel");
  });
});
