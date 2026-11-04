/**
 * P1604: /transcribe/:code for a room that belongs to a chat says, before the person agrees, that the words are posted to
 * that chat. An event room and a plain room keep their wording.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ value: 'chat' as string }));
vi.mock('@/app/pages/use-room-event', () => ({ useRoomEventState: () => state.value }));

import { ConsentSection } from '@/app/pages/ConsentLabel';
import { CHAT_ROOM_AGREED_LABEL, CHAT_ROOM_INTRO, consentAgreedLabel } from '@/app/components/session/capture-copy';

describe('the consent screen of a room', () => {
  it('a chat room says the words are posted to the chat', () => {
    state.value = 'chat';
    render(<ConsentSection agreed={false} code="ABC234" onToggle={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain(CHAT_ROOM_INTRO);
  });
  it('and the agreed label says so too', () => {
    state.value = 'chat';
    render(<ConsentSection agreed code="ABC234" onToggle={() => undefined} />);
    expect(screen.getByTestId('transcribe-recording-toggle').textContent).toContain(CHAT_ROOM_AGREED_LABEL);
  });
  it('a plain room keeps today\'s wording', () => {
    state.value = 'room';
    render(<ConsentSection agreed code="ABC234" onToggle={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain('shown to everyone in this room');
    expect(screen.getByTestId('transcribe-recording-toggle').textContent).toContain(consentAgreedLabel(false));
  });
  it('an event room keeps the event wording', () => {
    state.value = 'event';
    render(<ConsentSection agreed code="ABC234" onToggle={() => undefined} />);
    expect(screen.getByTestId('transcribe-consent-intro').textContent).toContain("event's channel");
  });
});
