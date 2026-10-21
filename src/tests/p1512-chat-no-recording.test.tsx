/**
 * P1512: the privacy policy says chats are never recorded by Mixpanel session replay.
 * index.html covers a page that LOADS on /home; this pins the in-app path: arriving on Home from
 * another page, the recorder is stopped before any chat content is in the DOM, so not even one
 * frame of a chat can reach a replay.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const seenAtStop: boolean[] = [];
const stopSessionRecording = vi.fn(() => {
  seenAtStop.push(document.body.textContent?.includes('CHAT-CONTENT') ?? false);
});
vi.mock('@/lib/mixpanel', () => ({ analytics: { stopSessionRecording: () => stopSessionRecording() } }));
vi.mock('@/app/pages/chat/ChatList', () => ({ ChatList: () => <div>CHAT-CONTENT</div> }));
vi.mock('@/app/pages/chat/ConversationPane', () => ({ ConversationPane: () => <div>CHAT-CONTENT</div> }));
vi.mock('@/app/pages/chat/ThreadPanel', () => ({ ThreadPanel: () => null }));
vi.mock('@/app/pages/chat/chat-hooks', async () => ({
  ...(await vi.importActual<object>('@/app/pages/chat/chat-hooks')),
  useBack: () => () => {},
  useFinishLeave: () => {},
  useMediaQuery: () => true,
}));

import ChatHomePage from '@/app/pages/chat/ChatHomePage';
import { ChatContext } from '@/app/pages/chat/chat-state';

describe('P1512: chats are never in a session recording', () => {
  it('stops Mixpanel recording before any chat content mounts', async () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <ChatContext.Provider value={{ chats: [] } as never}>
          <Routes>
            <Route path="/home/*" element={<ChatHomePage />} />
          </Routes>
        </ChatContext.Provider>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('CHAT-CONTENT')).length).toBeGreaterThan(0);
    expect(stopSessionRecording).toHaveBeenCalledTimes(1);
    expect(seenAtStop).toEqual([false]);
  });
});
