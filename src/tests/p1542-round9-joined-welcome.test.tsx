// @vitest-environment jsdom
/**
 * P1542 round 9/9b: the welcome after joining from the close. One primary that opens the community's chat: found in
 * the shell's list → straight there; not in the list → the list is read once more; still none (or the read fails) →
 * the group's own page, never /home; a refresh that lands after the person moved on navigates nowhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { JoinedWelcome } from '@/app/prototypes/events/close/JoinedWelcome';

const channel = { kind: 'group', org: { id: 'org-1' }, conversationId: 'conv-1' };

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
function Leave() { const nav = useNavigate(); return <button onClick={() => nav('/elsewhere')}>leave</button>; }

function setup(ctx: { chats: unknown[]; refresh?: () => Promise<unknown[] | null> } | null) {
  return render(
    <ChatContext.Provider value={ctx as never}>
      <MemoryRouter initialEntries={['/events/e/close']}>
        <Routes>
          <Route path="/events/e/close" element={<><JoinedWelcome community="Test Group · Somewhere" orgId="org-1" orgSlug="test-group" onContinue={() => {}} /><Leave /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ChatContext.Provider>,
  );
}
const tap = () => fireEvent.click(screen.getByRole('button', { name: 'Open the community chat' }));

describe('JoinedWelcome', () => {
  it('names the community from data and has ONE primary plus a quiet way back', () => {
    setup({ chats: [] });
    expect(screen.getByTestId('welcome-community').textContent).toContain('Test Group · Somewhere');
    expect(screen.getByRole('heading').textContent).toBe("Welcome, you're in");
    expect(screen.getByTestId('welcome-continue').textContent).toBe('Back to your feedback');
  });

  it('chat already in the list → opens it, with no refresh', async () => {
    const refresh = vi.fn();
    setup({ chats: [channel], refresh });
    tap();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chats/c/conv-1'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('not in the list yet → reads the list once more, then opens the chat', async () => {
    const refresh = vi.fn().mockResolvedValue([channel]);
    setup({ chats: [], refresh });
    tap();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chats/c/conv-1'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('no chat even after the refresh → the group page, never the chats list', async () => {
    setup({ chats: [], refresh: vi.fn().mockResolvedValue([]) });
    tap();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/groups/test-group'));
  });

  it('a failed refresh → the group page', async () => {
    setup({ chats: [], refresh: vi.fn().mockRejectedValue(new Error('down')) });
    tap();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/groups/test-group'));
  });

  it('no chat shell at all → the group page', async () => {
    setup(null);
    tap();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/groups/test-group'));
  });

  it('moved on before the refresh landed → navigates nowhere', async () => {
    let answer!: (v: unknown[]) => void;
    setup({ chats: [], refresh: () => new Promise((r) => { answer = r; }) });
    tap();
    fireEvent.click(screen.getByRole('button', { name: 'leave' }));
    expect(screen.getByTestId('where').textContent).toBe('/elsewhere');
    answer([channel]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('where').textContent).toBe('/elsewhere');
  });
});
