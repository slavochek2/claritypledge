/**
 * P1604 final-look batch: "Transcribing into {chat name}", the name linking to the chat, in the bar and on the room page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const states = vi.hoisted(() => ({ value: new Map<string, { state: string; chatName: string | null }>() }));
vi.mock('@/app/data/room-transcription-state', () => ({ getMyRoomStates: vi.fn(async () => states.value) }));

import { CaptureChatLink } from '@/app/components/session/capture-chat-link';
import { transcribingInto } from '@/app/components/session/capture-copy';

const show = (conversationId: string | null, roomId = 'r1') =>
  render(<MemoryRouter><CaptureChatLink roomId={roomId} conversationId={conversationId} /></MemoryRouter>);

beforeEach(() => { states.value = new Map(); });

describe('Transcribing into {chat name}', () => {
  it('names the chat and links to it', async () => {
    states.value = new Map([['r1', { state: 'none', chatName: 'Ada' }]]);
    show('chat-9');
    const link = await screen.findByRole('link', { name: 'Ada' });
    expect(link.getAttribute('href')).toBe('/chats/c/chat-9');
    expect(screen.getByTestId('capture-chat-hint').textContent).toBe(transcribingInto('Ada'));
    expect(transcribingInto('Ada')).toBe('Transcribing into Ada');
  });

  it('is built from parts, not by splitting the sentence on the name: a chat called "in" or "Transcribing" reads right', async () => {
    for (const name of ['in', 'Transcribing', 'into', 'T']) {
      states.value = new Map([['r1', { state: 'none', chatName: name }]]);
      const { unmount } = show('chat-9');
      const link = await screen.findByRole('link', { name });
      expect(link.getAttribute('href')).toBe('/chats/c/chat-9');
      expect(screen.getByTestId('capture-chat-hint').textContent).toBe(`Transcribing into ${name}`);
      expect(screen.getByTestId('capture-chat-hint').firstChild?.textContent, 'the lead is exactly the lead').toBe('Transcribing into ');
      unmount();
    }
  });

  it('until the name is known it still links, as "this chat"', async () => {
    show('chat-9');
    const link = await screen.findByRole('link', { name: 'this chat' });
    expect(link.getAttribute('href')).toBe('/chats/c/chat-9');
  });

  it('a room with no chat renders nothing', async () => {
    const { container } = show(null);
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});
